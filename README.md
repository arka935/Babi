# RuangChat Ultimate (prototype)

## Jalankan di Termux

```bash
pkg update
pkg install nodejs-lts unzip
cd ~
unzip -o RuangChat-Ultimate.zip
cd RuangChat-Ultimate
npm install
npm start
```

Buka `http://localhost:3000`. Untuk dua HP di Wi-Fi yang sama, buka `http://IP-LOKAL-HP-SERVER:3000` dari HP kedua. Server harus tetap hidup.

## Fitur demo
- Halaman home daftar kontak terpisah dari layar chat penuh; tombol `×` kembali ke home.
- Tambah kontak berdasarkan username, kontak tersimpan di localStorage perangkat.
- Pesan pribadi per pasangan username via Socket.IO, reply, indikator mengetik, URL otomatis jadi link biru.
- Voice note melalui MediaRecorder, file lampiran dengan nama dan ekstensi asli (batas demo sekitar 9 MB).
- Ekspor chat TXT, hapus riwayat percakapan demo, toggle suara notifikasi (UI demo), foto profil.
- Status foto/video atau caption, edit/hapus, kedaluwarsa 24 jam. Status disimpan lokal pada perangkat pembuat.
- Telepon suara WebRTC (audio saja), dengan layar panggilan masuk, dering/getaran saat halaman terbuka, tombol angkat/tolak, mute, dan akhiri panggilan.
- Kerangka notifikasi push untuk panggilan saat browser tertutup/offline: tekan “Aktifkan notifikasi panggilan” di home. Membutuhkan HTTPS, browser/PWA yang mendukung push, izin notifikasi, dan server yang terus aktif. Jika penerima membuka notifikasi dalam 45 detik, panggilan bisa diterima; notifikasi push tidak menjamin panggilan tersambung jika server/perangkat mati.
- Neta-AI offline berbasis aturan manual sederhana, respons tertunda 3 detik.
- Tema hijau tua, hitam, abu-abu.

## Batasan penting
Ini adalah prototipe untuk belajar, BUKAN aplikasi privat/produksi. Tidak ada autentikasi/password, database persisten, enkripsi end-to-end, moderasi, kontrol akses kuat, atau sinkronisasi status lintas perangkat. Riwayat chat disimpan di RAM server dan hilang saat server restart. Menghapus chat membersihkan pasangan riwayat di memori server demo. Username dapat dipalsukan oleh siapa pun; jangan gunakan untuk percakapan sensitif. Lampiran dikirim sebagai data URL lewat Socket.IO dan dibatasi ukurannya. Status tersimpan hanya di localStorage pembuat. Neta-AI tidak punya 100.000 dataset manual; ia menggunakan kumpulan pola respons demo yang disusun manual dan fallback sederhana.

Untuk penggunaan nyata, tambahkan autentikasi kuat, database, otorisasi server per pengguna, batas upload, validasi tipe file, penyimpanan media terpisah, HTTPS, TURN, rate limits, dan audit keamanan sebelum membuka ke publik.


## Panggilan offline dan notifikasi push
- Jalankan `npm install` setelah memperbarui proyek agar dependensi `web-push` terpasang.
- Server membuat `vapid.json` saat pertama kali dijalankan dan menyimpan subscription di `push-subscriptions.json`; simpan kedua file ini dengan aman.
- Panggilan offline hanya menunggu 45 detik. Push memberi tahu penerima; penerima harus membuka notifikasi dan menekan Angkat. Jika halaman sudah terbuka, panggilan masuk akan berdering/getar dan tetap butuh persetujuan.
- Untuk panggilan saat browser tertutup, host harus menggunakan HTTPS dan tetap aktif 24/7. `localhost` Termux tidak bisa membangunkan HP lain saat server/host mati. STUN saja juga tidak menjamin audio melewati semua jaringan; penggunaan publik biasanya membutuhkan TURN.
