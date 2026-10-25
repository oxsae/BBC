/**
 * BBC — Buatan Business Cockpit
 * Sync.gs : membaca semua file di folder data, mem-parse, lalu menyimpan hasilnya
 * ke sheet db_* di spreadsheet backend ini.
 *
 * Cara kerja:
 *  - Setiap file Google Sheets di folder (FOLDER_ID di sheet Setting) dikenali jenisnya dari isinya.
 *  - File yang tidak berubah sejak sinkron terakhir dilewati (cepat).
 *  - Baris lama dari file yang berubah diganti, file yang dihapus dari folder dibuang datanya.
 */

var TABEL = {
  file: ['file_id', 'nama', 'jenis', 'diperbarui', 'disinkron', 'status', 'baris', 'peringatan'],
  produksi: ['file_id', 'tanggal', 'tab', 'sisa_awal', 'diterima', 'tersedia', 'tbs_olah', 'cpo', 'pk', 'sisa_akhir',
    'tbs_olah_real', 'lori', 'jam_olah', 'jam_stagnasi', 'stagnasi_ket', 'sisa_real', 'selisih_tbs',
    'cpo_buku', 'cpo_real', 'pk_buku', 'pk_real', 'alb_tangki', 'sd_tbs', 'sd_cpo', 'sd_pk', 'diolah_bln_ini', 'sd_bln_ini_tbs'],
  terima: ['file_id', 'tanggal', 'sumber', 'kg'],
  sumber: ['file_id', 'tanggal', 'sumber', 'kelompok', 'tbs', 'cpo', 'pk'],
  shift: ['file_id', 'tanggal', 'shift', 'tbs', 'lori', 'minyak'],
  sisa_real: ['file_id', 'tanggal', 'lokasi', 'kg'],
  pengiriman: ['file_id', 'tanggal', 'produk', 'no_do', 'kontrak', 'tujuan', 'rspo', 'non_rspo', 'tonase',
    'alb', 'ka', 'kk', 'trip', 'sisa_do', 'keterangan'],
  byproduct: ['file_id', 'tanggal', 'jenis', 'tbs_olah', 'produksi', 'dibakar', 'dijual', 'kbn_inti', 'pls_tu',
    'pls_tu_bruto', 'generator', 'boiler', 'waduk', 'stok', 'stok_awal_bulan']
};
// Kolom berisi teks (diformat "teks biasa" agar tanggal tidak diubah otomatis oleh Sheets).
var KOLOM_TEKS = { file_id: 1, nama: 1, jenis: 1, diperbarui: 1, disinkron: 1, status: 1, peringatan: 1, tanggal: 1, tab: 1,
  stagnasi_ket: 1, sumber: 1, kelompok: 1, lokasi: 1, produk: 1, no_do: 1, kontrak: 1, tujuan: 1, keterangan: 1 };

function bbcSheet_(nama) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nama);
  if (!sh) throw new Error('Sheet "' + nama + '" tidak ada. Jalankan menu BBC > Setup awal.');
  return sh;
}

function bbcReadTable_(nama) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_' + nama);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var H = vals[0].map(String);
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var o = {};
    for (var c = 0; c < H.length; c++) {
      var v = vals[r][c];
      if (H[c] === 'file_id') { o._file = v; if (nama === 'file') o.file_id = v; continue; }
      o[H[c]] = v === '' ? null : v;
    }
    out.push(o);
  }
  return out;
}

function bbcWriteTable_(nama, rows) {
  var cols = TABEL[nama];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('db_' + nama) || ss.insertSheet('db_' + nama);
  sh.clearContents();
  var data = [cols].concat(rows.map(function (r) {
    return cols.map(function (k) { var v = r[k]; return v === null || v === undefined ? '' : v; });
  }));
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  if (sh.getMaxRows() < data.length) sh.insertRowsAfter(sh.getMaxRows(), data.length - sh.getMaxRows());
  cols.forEach(function (k, i) {
    if (KOLOM_TEKS[k]) sh.getRange(1, i + 1, data.length, 1).setNumberFormat('@');
  });
  sh.getRange(1, 1, data.length, cols.length).setValues(data);
  sh.setFrozenRows(1);
}

/** Isi semua tab sebuah spreadsheet sebagai array 2D (tanggal dijadikan teks dd.MM.yyyy). */
function bbcBacaWorkbook_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  return ss.getSheets().map(function (sh) {
    var values = sh.getLastRow() ? sh.getDataRange().getValues() : [];
    for (var r = 0; r < values.length; r++) {
      for (var c = 0; c < values[r].length; c++) {
        if (values[r][c] instanceof Date) values[r][c] = Utilities.formatDate(values[r][c], tz, 'dd.MM.yyyy');
      }
    }
    return { name: sh.getName(), values: values };
  });
}

function bbcDaftarFile_(folder, out) {
  var it = folder.getFiles();
  while (it.hasNext()) out.push(it.next());
  var sub = folder.getFolders();
  while (sub.hasNext()) bbcDaftarFile_(sub.next(), out);
  return out;
}

/**
 * Sinkronisasi. paksa=true membaca ulang semua file walau tidak berubah.
 * Dipanggil oleh trigger berkala, menu, atau tombol admin di website.
 */
function bbcSync(paksa) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return { ringkas: { pesan: 'Sinkronisasi lain sedang berjalan.' } };
  try {
    var set = bbcSetting_();
    var folderId = String(set.FOLDER_ID || '').trim();
    if (!folderId) throw new Error('FOLDER_ID belum diisi di sheet Setting.');
    var folder = DriveApp.getFolderById(folderId);
    var semua = bbcDaftarFile_(folder, []);

    var tables = {};
    Object.keys(TABEL).forEach(function (t) {
      tables[t] = bbcReadTable_(t).map(function (r) { r.file_id = r._file; delete r._file; return r; });
    });
    var metaLama = {};
    tables.file.forEach(function (f) { metaLama[f.file_id] = f; });

    var adaDiFolder = {}, ganti = {}, metaBaru = {}, syncWarn = [];
    var nBaca = 0, nLewat = 0;
    var sekarang = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

    semua.forEach(function (file) {
      var id = file.getId(), nama = file.getName(), mime = file.getMimeType();
      adaDiFolder[id] = true;
      if (mime !== MimeType.GOOGLE_SHEETS) {
        if (/\.xlsx?$/i.test(nama)) {
          syncWarn.push({ file: nama, jenis: '-', level: 'error',
            pesan: 'File Excel (.xlsx) tidak bisa dibaca langsung. Buka file → File → Simpan sebagai Google Spreadsheet, lalu hapus/pindahkan versi .xlsx dari folder.' });
        }
        return;
      }
      var diperbarui = Utilities.formatDate(file.getLastUpdated(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
      var lama = metaLama[id];
      if (!paksa && lama && lama.diperbarui === diperbarui && lama.status === 'ok') {
        metaBaru[id] = lama; nLewat++; return;
      }
      nBaca++;
      ganti[id] = true;
      var meta = { file_id: id, nama: nama, diperbarui: diperbarui, disinkron: sekarang, status: 'ok', baris: 0, jenis: '' };
      try {
        var wb = bbcBacaWorkbook_(SpreadsheetApp.openById(id));
        var jenis = bbcDetectType(wb);
        meta.jenis = jenis || 'TIDAK DIKENAL';
        var hasil, warnings = [];
        if (jenis === 'PRODUKSI') {
          hasil = bbcParseProduksiWorkbook(wb);
          warnings = hasil.warnings;
          bbcTambah_(tables.produksi, hasil.hari, id);
          bbcTambah_(tables.terima, hasil.terima, id);
          bbcTambah_(tables.sumber, hasil.sumber, id);
          bbcTambah_(tables.shift, hasil.shift, id);
          bbcTambah_(tables.sisa_real, hasil.sisaReal, id);
          meta.baris = hasil.hari.length;
        } else if (jenis === 'PENGIRIMAN') {
          hasil = bbcParsePengirimanWorkbook(wb);
          warnings = hasil.warnings;
          bbcTambah_(tables.pengiriman, hasil.rows, id);
          meta.baris = hasil.rows.length;
          if (hasil.rows.length) meta.jenis = 'PENGIRIMAN ' + hasil.rows[0].produk;
        } else if (jenis === 'TANKOS_HARIAN') {
          hasil = bbcParseTankosWorkbook(wb);
          warnings = hasil.warnings;
          bbcTambah_(tables.byproduct, hasil.rows, id);
          meta.baris = hasil.rows.length;
        } else {
          meta.status = 'dilewati';
          warnings = [{ level: 'info', pesan: 'Format file tidak dikenali — tidak ada judul "TBS BUKU", "MONITORING PENGIRIMAN ..." atau "LAPORAN HARIAN SAVING TANKOS".' }];
        }
        if (warnings.some(function (w) { return w.level === 'error'; })) meta.status = 'ada error';
        meta.peringatan = JSON.stringify(warnings).slice(0, 45000);
      } catch (err) {
        meta.status = 'gagal';
        meta.peringatan = JSON.stringify([{ level: 'error', pesan: 'Gagal membaca file: ' + (err && err.message || err) }]);
      }
      metaBaru[id] = meta;
    });

    // Buang data dari file yang berubah (data barunya sudah ditambahkan dengan penanda _baru) atau yang sudah tidak ada.
    Object.keys(TABEL).forEach(function (t) {
      if (t === 'file') return;
      tables[t] = tables[t].filter(function (r) {
        if (r._baru) return true;
        return adaDiFolder[r.file_id] && !ganti[r.file_id];
      });
    });
    tables.file = Object.keys(metaBaru).map(function (k) { return metaBaru[k]; });

    // Cek tanggal produksi ganda antar file.
    var perTgl = {};
    tables.produksi.forEach(function (r) { (perTgl[r.tanggal] = perTgl[r.tanggal] || []).push(r.file_id); });
    var namaFile = {};
    tables.file.forEach(function (f) { namaFile[f.file_id] = f.nama; });
    Object.keys(perTgl).forEach(function (tg) {
      var ids = perTgl[tg].filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (ids.length > 1) syncWarn.push({ file: ids.map(function (i) { return namaFile[i]; }).join(' & '), jenis: 'PRODUKSI', level: 'warn',
        pesan: 'Tanggal ' + tg + ' ada di lebih dari satu file. Dashboard memakai file yang paling baru diubah.' });
    });

    Object.keys(TABEL).forEach(function (t) {
      tables[t].forEach(function (r) { delete r._baru; });
      tables[t].sort(function (a, b) { return String(a.tanggal || a.nama) < String(b.tanggal || b.nama) ? -1 : 1; });
      bbcWriteTable_(t, tables[t]);
    });

    var props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_SYNC', sekarang);
    props.setProperty('SYNC_WARNINGS', JSON.stringify(syncWarn).slice(0, 8000));
    return { ringkas: { waktu: sekarang, file_dibaca: nBaca, file_tidak_berubah: nLewat, total_file: semua.length } };
  } finally {
    lock.releaseLock();
  }
}

function bbcTambah_(tabel, rows, fileId) {
  rows.forEach(function (r) { var o = {}; for (var k in r) o[k] = r[k]; o.file_id = fileId; o._baru = true; tabel.push(o); });
}

/** Untuk trigger berkala (dipasang lewat menu). */
function bbcSyncOtomatis() { bbcSync(false); }
