const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');
const { Server } = require('socket.io');
const app = express(); const server = http.createServer(app);
const io = new Server(server,{maxHttpBufferSize:18e6});
const PORT=process.env.PORT||3000;
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(_q,res)=>res.json({ok:true,app:'RuangChat'}));
// Demo only: accounts, messages, call state and push subscriptions are not production-grade.
const sessions=new Map(), online=new Map(), chats=new Map(), pendingCalls=new Map(), pendingByTarget=new Map(), pushSubs=new Map();
const clean=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);
const key=(a,b)=>[a,b].sort().join('::');
const getPublic=()=>[...online.values()].map(({username,displayName,avatar})=>({username,displayName,avatar}));
function sendError(s,msg){s.emit('app-error',msg)}
function loadPushSubs(){try{const data=JSON.parse(fs.readFileSync(path.join(__dirname,'push-subscriptions.json'),'utf8'));for(const [u,sub] of Object.entries(data))pushSubs.set(u,sub)}catch{}}
function savePushSubs(){try{fs.writeFileSync(path.join(__dirname,'push-subscriptions.json'),JSON.stringify(Object.fromEntries(pushSubs)))}catch(e){console.error('Gagal menyimpan subscription push:',e.message)}}
function vapidKeys(){const file=path.join(__dirname,'vapid.json');try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{const e=crypto.createECDH('prime256v1');e.generateKeys();const keys={publicKey:e.getPublicKey().toString('base64url'),privateKey:e.getPrivateKey().toString('base64url')};fs.writeFileSync(file,JSON.stringify(keys,null,2),{mode:0o600});return keys}}
const vapid=vapidKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',vapid.publicKey,vapid.privateKey);
app.get('/api/push-key',(_q,res)=>res.json({publicKey:vapid.publicKey}));
loadPushSubs();
async function sendPush(username,call){const sub=pushSubs.get(username);if(!sub)return;try{await webpush.sendNotification(sub,JSON.stringify({title:call.mode==='video'?'Video call RuangChat':'Voice call RuangChat',body:`${call.fromName} ${call.mode==='video'?'melakukan video call':'menelepon kamu'}. Buka RuangChat untuk menjawab.`,url:'/',callId:call.callId}),{TTL:50})}catch(e){if(e.statusCode===404||e.statusCode===410){pushSubs.delete(username);savePushSubs()}else console.warn('Push panggilan gagal:',e.message)}}
function clearPending(callId){const call=pendingCalls.get(callId);if(!call)return null;clearTimeout(call.timer);pendingCalls.delete(callId);if(pendingByTarget.get(call.target)===callId)pendingByTarget.delete(call.target);return call}
function finishCall(callId, event, payload={}){const call=clearPending(callId);if(!call)return;const from=online.get(call.from),to=online.get(call.target);if(from)io.to(from.id).emit(event,{callId,...payload});if(to)io.to(to.id).emit(event,{callId,...payload});}
io.on('connection',s=>{
 s.on('register',d=>{const username=clean(d?.username),displayName=String(d?.displayName||username).trim().slice(0,28); if(username.length<3)return sendError(s,'Username minimal 3 karakter.'); const old=online.get(username); if(old&&old.id!==s.id)return sendError(s,'Username sedang dipakai.'); const u={username,displayName,avatar:String(d?.avatar||'').slice(0,4000000),id:s.id}; sessions.set(s.id,u); online.set(username,u); s.data.username=username; s.emit('registered',{username,displayName}); io.emit('online-users',getPublic());const cid=pendingByTarget.get(username),call=cid&&pendingCalls.get(cid);if(call&&call.expiresAt>Date.now())s.emit('call-incoming',{callId:call.callId,from:call.from,fromName:call.fromName,mode:call.mode,offlineReturn:true}); });
 s.on('profile-update',d=>{const u=sessions.get(s.id);if(!u)return;u.displayName=String(d?.displayName||u.displayName).slice(0,28);u.avatar=String(d?.avatar||'').slice(0,4000000);online.set(u.username,u);io.emit('online-users',getPublic());});
 s.on('push-subscribe',sub=>{const me=sessions.get(s.id);if(!me||!sub?.endpoint||!sub?.keys)return;pushSubs.set(me.username,sub);savePushSubs();s.emit('push-subscribed');});
 s.on('open-chat',raw=>{const me=sessions.get(s.id),target=clean(raw);if(!me||!target||target===me.username)return;const k=key(me.username,target);s.join('dm:'+k);s.emit('chat-history',{target,messages:(chats.get(k)||[]).slice(-200)});});
 s.on('send-message',d=>{const me=sessions.get(s.id);if(!me)return;const target=clean(d?.target);if(!target||target===me.username)return;const type=['text','audio','file','image'].includes(d?.type)?d.type:'text';let content=String(d?.content||'');if(type==='text')content=content.trim().slice(0,6000);if(type==='audio'&&!content.startsWith('data:audio/'))return;if(['file','image'].includes(type)&&!content.startsWith('data:'))return;if(type==='image'&&!/^data:image\//i.test(content))return;if(content.length>15e6)return sendError(s,'File terlalu besar untuk demo (maksimum kira-kira 10 MB).');if(!content)return;const m={id:Date.now()+'-'+Math.random().toString(16).slice(2),sender:me.username,senderName:me.displayName,target,type,content,fileName:String(d?.fileName||'').slice(0,180),replyTo:d?.replyTo||null,time:new Date().toISOString()};const k=key(me.username,target),arr=chats.get(k)||[];arr.push(m);chats.set(k,arr.slice(-300));io.to('dm:'+k).emit('new-message',m);const to=online.get(target);if(to&&to.id!==s.id)io.to(to.id).emit('incoming-message',m);s.emit('message-sent',m);});
 s.on('typing',d=>{const me=sessions.get(s.id),target=clean(d?.target);if(me&&target) {const u=online.get(target);if(u)io.to(u.id).emit('typing',{from:me.username,active:!!d.active});}});
 s.on('clear-chat',raw=>{const me=sessions.get(s.id),target=clean(raw);if(!me||!target)return;chats.delete(key(me.username,target));s.emit('chat-cleared',{target});});
 s.on('call-request',d=>{const me=sessions.get(s.id),target=clean(d?.target);if(!me||!target||target===me.username)return;const prior=pendingByTarget.get(target);if(prior&&pendingCalls.has(prior))return sendError(s,'Kontak sedang menerima panggilan lain.');const callId=String(d?.callId||crypto.randomUUID());const call={callId,from:me.username,fromName:me.displayName,target,mode:d?.mode==='video'?'video':'voice',expiresAt:Date.now()+45000,timer:null};call.timer=setTimeout(()=>{finishCall(callId,'call-timeout',{message:'Panggilan tidak dijawab.'})},45000);pendingCalls.set(callId,call);pendingByTarget.set(target,callId);const to=online.get(target);if(to){io.to(to.id).emit('call-incoming',{callId,from:me.username,fromName:me.displayName,mode:call.mode});s.emit('call-status',{callId,status:'ringing',message:'Memanggil…'})}else{s.emit('call-status',{callId,status:'offline',message:'Kontak offline. Notifikasi dikirim jika tersedia; menunggu hingga 45 detik.'});sendPush(target,call)}});
 s.on('call-accept',d=>{const me=sessions.get(s.id),call=pendingCalls.get(String(d?.callId||''));if(!me||!call||call.target!==me.username||call.expiresAt<Date.now())return;const caller=online.get(call.from);if(!caller){finishCall(call.callId,'call-ended',{message:'Penelepon terputus.'});return;}clearTimeout(call.timer);call.timer=null;if(pendingByTarget.get(call.target)===call.callId)pendingByTarget.delete(call.target);io.to(caller.id).emit('call-accepted',{callId:call.callId,from:me.username,fromName:me.displayName,mode:call.mode});s.emit('call-accepted',{callId:call.callId,from:call.from,fromName:call.fromName,mode:call.mode});});
 s.on('call-reject',d=>{const me=sessions.get(s.id),call=pendingCalls.get(String(d?.callId||''));if(!me||!call||call.target!==me.username)return;finishCall(call.callId,'call-rejected',{message:`${me.displayName} menolak panggilan.`});});
 for(const ev of ['call-offer','call-answer','call-ice']) s.on(ev,d=>{const me=sessions.get(s.id),target=clean(d?.target);const to=online.get(target);if(me&&to)io.to(to.id).emit(ev,{...d,from:me.username,fromName:me.displayName});});
 s.on('call-end',d=>{const me=sessions.get(s.id),callId=String(d?.callId||''),call=pendingCalls.get(callId);if(!me||!call||![call.from,call.target].includes(me.username))return;finishCall(callId,'call-ended',{message:'Panggilan berakhir.'});});
 s.on('disconnect',()=>{const u=sessions.get(s.id);sessions.delete(s.id);if(u&&online.get(u.username)?.id===s.id)online.delete(u.username);io.emit('online-users',getPublic());});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`RuangChat berjalan pada port ${PORT}`));
