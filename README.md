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
| Laporan Harian Produksi (format utama) | sheet dengan judul kolom `TGL`, `TBS DITERIMA`, `TBS DIOLAH` (tabel "Real Produksi") | 1 file per bulan, 1 baris per tanggal |
| Laporan Harian Produksi (format lama) | ada label `TBS BUKU` | 1 file per bulan, tab 1–31 |
| Monitoring pengiriman | judul `MONITORING PENGIRIMAN CPO / PK / TANKOS ...` | 1 file per bulan |
| Laporan harian by product | judul `LAPORAN HARIAN [SAVING] TANKOS / CANGKANG / FIBRE / SOLID / ABU JANJANG / ABU BOILER PKS SBT` | 1 file per tahun, tab per bulan |

Sheet lain di dalam file (REKAP, Laporan Bulanan RSPO, dan sebagainya) dilewati, karena BBC menghitung rekapnya sendiri.

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
- **Bulan baru untuk Real Produksi**: isi baris **"Awal"** (TBS SISA, STOCK CPO, STOCK KERNEL) dengan **angka**, yaitu sisa/stok akhir bulan lalu. Jangan memakai rumus yang mengambil dari file lain, karena rumus seperti itu rusak (`#REF!`) di Google Sheets.
- **Aturan untuk staf** (supaya parser tetap bisa membaca):
  1. Judul kolom jangan diubah: di Real Produksi (`TGL`, `TBS DITERIMA`, `TBS DIOLAH`, `TBS SISA`, `MINYAK SAWIT`, `INTI SAWIT`, `JUMLAH`, `DITERIMA`, `DIOLAH`, `JLH`), dan di laporan by product (`TGL`, `TBS OLAH`, `PRODUKSI ...`, `DIBAKAR`, `PENGIRIMAN`, `INTI`, `PLSMA`, `STOCK`).
  2. Kolom TGL di Real Produksi berisi tanggal (bukan teks). Judul laporan by product memuat bulan dan tahun, misalnya `BULAN SEPT 2026`.
  3. Menyisipkan baris atau kolom **boleh**, karena parser mencari judul, bukan alamat sel.
  4. Stok awal by product (`STOCK AWAL`) diisi dengan angka, bukan rumus ke file lain.
- **Halaman Validasi** di website menampilkan file yang dibaca dan hal yang perlu diperiksa. Perbaiki di file aslinya, lalu sinkron ulang.

## Mengubah kode backend

Setelah mengedit kode di Apps Script: *Terapkan* → *Kelola deployment* → ikon pensil → *Versi: Versi baru* → *Terapkan*. Dengan cara ini URL tetap sama, sehingga `config.js` tidak perlu diubah.

## Aturan perhitungan

- **Rendemen** = CPO (atau PK) ÷ TBS diolah × 100. Rendemen akumulasi dihitung dari total ÷ total, bukan rata-rata harian.
- **Real Produksi**: TBS diterima dan diolah memakai kolom `DITERIMA` dan `DIOLAH`. CPO dan PK adalah jumlah RSPO + non-RSPO. Rincian per sumber (Inti SBT, Inti LDA, AMO I, AMO II, Plasma, Pihak III) diambil dari kolom `JUMLAH` tiap kelompok. Hasilnya sudah dicocokkan dengan baris JLH September 2026.
- **Jam olah dan stagnasi** tidak ada di format Real Produksi. Bagian kapasitas olah dan stagnasi hanya muncul jika datanya ada (format lama). **Kapasitas olah** = TBS diolah ÷ jam olah; **utilitas** = kapasitas olah ÷ kapasitas terpasang.
- **By product**: tujuan keluar dibaca dari kolom yang ada di masing-masing laporan (dijual/pengiriman, inti, plasma, waduk, dibakar). Di Solid, AMO-1 dihitung ke kebun inti. Website hanya menampilkan kolom yang ada isinya.
- **Mutu pengiriman** (ALB, KA, KK) dirata-rata dengan bobot tonase.
- **Tankos**: kolom PLS/TU di laporan sudah termasuk waduk, sehingga BBC memakai PLS/TU − WADUK, sama seperti sheet REKAP. Hasilnya sudah dicocokkan dengan REKAP untuk Januari–Oktober 2026.

## Temuan dari file di folder BBC DATA (dicek 25 Oktober 2026)

Hal-hal ini akan muncul di halaman Validasi sampai diperbaiki di file aslinya:

- **Real Produksi September**: baris "Awal" kolom TBS SISA, STOCK CPO, dan STOCK KERNEL berisi `#REF!`, karena rumusnya mengambil dari file Agustus dan putus saat dikonversi. Akibatnya sisa TBS, stok CPO, stok kernel, dan baris "s/d B.I" kosong. Perbaikan: ketik angkanya di baris "Awal".
- **Fibre 2026**: `STOCK AWAL` berisi `#ERROR!` di semua tab bulan (rumus `=[1]NOVEMBER!L37` ke file lain). Perbaikan: ketik angka stok awal.
- **Sheet REKAP** Fibre, Solid, dan Abu Janjang berisi `#ERROR!`/`#REF!`. Sheet ini tidak dibaca BBC.
- **Selisih data**: pengiriman PK September di Monitoring PK 983.110 kg, sedangkan kolom pengiriman kernel di Real Produksi 982.270 kg (selisih 840 kg). BBC memakai angka Monitoring PK.
- Tankos Oktober: angka waduk diisi di kolom tanpa judul (kolom Q), bukan di kolom WADUK. BBC tetap membacanya sebagai waduk dan memberi peringatan.
- Tankos Agustus: ada angka −27.180 di kolom Q (baris tanggal 2). Angka ini diabaikan.

## Uji parser (untuk developer)

```bash
npm i xlsx@0.18.5
node test/run-parser.js "Laporan Harian Produksi.xlsx" "Monitoring PK.xlsx"   # cek hasil baca
FILE="Laporan Harian Produksi.xlsx" node test/robust.js                       # tahan sisip baris/kolom
FILE="LAPORAN HARIAN PRODUKSI SEPT 2026.xlsx" node test/robust-real.js        # sama, untuk format Real Produksi
node test/mock-gas.js *.xlsx                                                   # simulasi backend + login
```
(`XLSX_PATH` bisa diisi jika paket xlsx terpasang di lokasi lain.)
