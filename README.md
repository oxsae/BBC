# BBC — Buatan Business Cockpit

Dashboard laporan PKS Sei Buatan. Staf tetap mengisi spreadsheet format lama, lalu BBC membaca dan menampilkannya. Semua halaman memakai login, dan website hanya untuk melihat data.

```
Staf isi Google Sheets (format lama)
        ↓  sinkron otomatis tiap 15 menit
Apps Script (spreadsheet "BBC Backend"): parser → sheet db_* + validasi
        ↓  API, wajib token login
Website di GitHub Pages: Ringkasan | Produksi | By product | Pengiriman | Validasi
```

## Isi repository

| Lokasi | Fungsi |
|---|---|
| `index.html`, `assets/` | Website (di-host di GitHub Pages) |
| `assets/config.js` | **Satu-satunya file yang perlu diedit**: tempat URL API |
| `backend-apps-script/` | Kode untuk disalin ke Apps Script |
| `test/` | Skrip uji parser untuk developer (tidak dipakai website) |

Repository ini aman dibuat publik karena **tidak berisi data pabrik**. Data hanya keluar dari API setelah login.

---

## Langkah 1 — Siapkan folder data di Google Drive

1. Buat satu folder, misalnya `BBC Data`. Subfolder boleh dipakai (misalnya per tahun).
2. Masukkan file laporan ke folder tersebut. **Semua file harus berformat Google Spreadsheet, bukan .xlsx.** Jika file masih .xlsx, buka file → *File* → *Simpan sebagai Google Spreadsheet*, lalu hapus versi .xlsx dari folder.
3. Jenis file dikenali otomatis dari isinya, sehingga nama file bebas:

| Jenis | Ciri yang dikenali | Susunan |
|---|---|---|
| Laporan Harian Produksi | ada label `TBS BUKU` | 1 file per bulan, tab 1–31 |
| Monitoring pengiriman | judul `MONITORING PENGIRIMAN CPO / PK / TANKOS ...` | 1 file per bulan |
| Tankos harian | judul `LAPORAN HARIAN SAVING TANKOS` | 1 file per tahun, tab per bulan |

4. Salin ID folder, yaitu bagian URL setelah `/folders/`.

## Langkah 2 — Buat backend Apps Script

1. Buat Google Spreadsheet baru bernama **BBC Backend**. Jangan dibagikan ke siapa pun selain admin.
2. Buka *Ekstensi (Extensions)* → *Apps Script*.
3. Buat file sesuai isi folder `backend-apps-script/`: `Parser.gs`, `Sync.gs`, `Code.gs`, `Setup.gs` (tombol **+** → *Skrip*, lalu tempel isinya).
4. Buka *Setelan project (Project Settings)* (ikon roda gigi), centang **Tampilkan file manifes "appsscript.json"**, lalu ganti isinya dengan `appsscript.json` dari folder ini.
5. Simpan, lalu kembali ke spreadsheet dan muat ulang halaman. Menu **BBC** akan muncul.
6. Jalankan **BBC → 1. Setup awal**. Google akan meminta izin, setujui dengan akun pemilik.
7. Di sheet **Setting**, isi:
   - `FOLDER_ID`: ID folder dari langkah 1
   - `KAPASITAS_TERPASANG_TON_JAM`: kapasitas pabrik (untuk menghitung utilitas)
   - `TARGET_REND_CPO` dan `TARGET_REND_PK` (opsional)
8. Jalankan **BBC → 2. Tambah / reset user** untuk setiap pengguna:
   - `admin`: bisa menjalankan sinkronisasi dari website
   - `viewer`: hanya melihat

   Password disimpan dalam bentuk hash, bukan teks asli. Untuk menonaktifkan user, ubah kolom `aktif` menjadi `FALSE`.
9. Jalankan **BBC → Sinkron sekarang**, lalu periksa sheet `db_produksi` dan `db_pengiriman`.
10. Jalankan **BBC → Nyalakan sinkron otomatis (tiap 15 menit)**.

## Langkah 3 — Publikasikan API

1. Di editor Apps Script: *Terapkan (Deploy)* → *Deployment baru (New deployment)* → jenis **Aplikasi web (Web app)**.
2. *Jalankan sebagai (Execute as)*: **Saya (Me)**. *Yang memiliki akses (Who has access)*: **Siapa saja (Anyone)**.
   Ini aman karena setiap permintaan data tetap wajib membawa token login.
3. Salin URL yang berakhiran `/exec`.

## Langkah 4 — Website di GitHub Pages

1. Buat repository baru di GitHub, lalu upload semua isi folder ini.
2. Edit `assets/config.js` dan tempel URL dari langkah 3:
   ```js
   window.BBC_CONFIG = { API_URL: 'https://script.google.com/macros/s/XXXX/exec' };
   ```
3. Buka *Settings* → *Pages* → *Deploy from a branch* → `main` / `(root)` → *Save*.
4. Setelah 1–2 menit, website bisa dibuka di `https://<username>.github.io/<nama-repo>/`.

Jika `API_URL` kosong, website berjalan dalam **mode demo** dengan data contoh acak. Mode ini berguna untuk melihat tampilan sebelum backend siap.

---

## Pekerjaan rutin

- **Bulan baru**: salin file bulan lalu, kosongkan isinya, beri nama baru, lalu taruh di folder data. File akan terbaca otomatis pada sinkron berikutnya.
- **Aturan untuk staf** (supaya parser tetap bisa membaca):
  1. Teks label di kolom kiri (`SISA AWAL`, `TERSEDIA`, `DIOLAH`, `JUMLAH`, `SISA TBS REAL`, dan seterusnya) jangan diubah.
  2. Tanggal di sel paling atas setiap tab ditulis `dd.mm.yyyy`.
  3. Jam olah dan stagnasi ditulis seperti sekarang, misalnya `18jam` dan `6 jam`.
  4. Menyisipkan baris atau kolom **boleh**, karena parser mencari label, bukan alamat sel.
- **Halaman Validasi** di website menampilkan file yang dibaca dan hal yang perlu diperiksa. Perbaiki di file aslinya, lalu sinkron ulang.

## Mengubah kode backend

Setelah mengedit kode di Apps Script: *Terapkan* → *Kelola deployment* → ikon pensil → *Versi: Versi baru* → *Terapkan*. Dengan cara ini URL tetap sama, sehingga `config.js` tidak perlu diubah.

## Aturan perhitungan

- **Rendemen** = CPO (atau PK) ÷ TBS diolah × 100. Rendemen akumulasi dihitung dari total ÷ total, bukan rata-rata harian.
- **Kapasitas olah** = TBS diolah ÷ jam olah (ton/jam). **Utilitas** = kapasitas olah ÷ kapasitas terpasang.
- **TBS diolah** memakai angka buku (baris `JUMLAH` di tabel DIOLAH). TBS diolah real per shift ditampilkan terpisah.
- **Mutu pengiriman** (ALB, KA, KK) dirata-rata dengan bobot tonase.
- **Tankos**: kolom PLS/TU di laporan sudah termasuk waduk, sehingga BBC memakai PLS/TU − WADUK, sama seperti sheet REKAP. Hasilnya sudah dicocokkan dengan REKAP untuk Januari–Oktober 2026.

## Temuan dari file contoh (Oktober 2026)

Hal-hal ini akan muncul di halaman Validasi sampai diperbaiki di file aslinya:

- `CPO REAL` berisi `#REF!` di tab 1–18, sehingga stok CPO real tidak terbaca untuk tanggal tersebut.
- Tab 18: TBS olah 0, tetapi jam olah/stagnasi masih berisi `20jam / 4 jam` (tersalin dari tanggal 17). BBC mengabaikan jam tersebut.
- Tankos Oktober: angka waduk diisi di kolom tanpa judul (kolom Q), bukan di kolom WADUK. BBC tetap membacanya sebagai waduk dan memberi peringatan.
- Tankos Agustus: ada angka −27.180 di kolom Q (baris tanggal 2). Angka ini diabaikan.

## Uji parser (untuk developer)

```bash
npm i xlsx@0.18.5
node test/run-parser.js "Laporan Harian Produksi.xlsx" "Monitoring PK.xlsx"   # cek hasil baca
FILE="Laporan Harian Produksi.xlsx" node test/robust.js                       # tahan sisip baris/kolom
node test/mock-gas.js *.xlsx                                                   # simulasi backend + login
```
(`XLSX_PATH` bisa diisi jika paket xlsx terpasang di lokasi lain.)
