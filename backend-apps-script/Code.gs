/**
 * BBC — Buatan Business Cockpit
 * Code.gs : API untuk website (GitHub Pages) + login.
 *
 * Website mengirim POST dengan body JSON (Content-Type: text/plain) berisi
 *   { action: 'login' | 'logout' | 'me' | 'meta' | 'data' | 'validasi' | 'sync', token, ... }
 * dan menerima JSON { ok: true, ... } atau { ok: false, error: '...' }.
 */

var SESI_DETIK = 6 * 60 * 60;        // masa berlaku token (maks. CacheService = 6 jam)
var MAKS_GAGAL_LOGIN = 5;            // setelah 5x salah, username dikunci 15 menit
var HASH_ITERASI = 500;

function doGet(e) {
  return bbcJson_({ ok: true, app: 'BBC API', pesan: 'API aktif. Gunakan website BBC untuk mengakses data.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return bbcJson_({ ok: false, error: 'Permintaan tidak valid.' });
  }
  try {
    var action = String(req.action || '');
    if (action === 'login') return bbcJson_(bbcLogin_(req.username, req.password));

    var sesi = bbcSesi_(req.token);
    if (!sesi) return bbcJson_({ ok: false, error: 'Sesi berakhir. Silakan login lagi.', kode: 'AUTH' });

    switch (action) {
      case 'logout':
        CacheService.getScriptCache().remove('tok:' + req.token);
        bbcLog_(sesi.u, 'logout', '');
        return bbcJson_({ ok: true });
      case 'me':
        return bbcJson_({ ok: true, user: sesi });
      case 'meta':
        return bbcJson_(bbcMeta_());
      case 'data':
        return bbcJson_(bbcData_(String(req.bulan || '')));
      case 'validasi':
        return bbcJson_(bbcValidasi_());
      case 'sync':
        if (sesi.role !== 'admin') return bbcJson_({ ok: false, error: 'Hanya admin yang bisa menjalankan sinkronisasi.' });
        var hasil = bbcSync(!!req.paksa);
        bbcLog_(sesi.u, 'sync', JSON.stringify(hasil.ringkas));
        return bbcJson_({ ok: true, hasil: hasil.ringkas });
      default:
        return bbcJson_({ ok: false, error: 'Aksi tidak dikenal.' });
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return bbcJson_({ ok: false, error: 'Terjadi kesalahan di server: ' + (err && err.message || err) });
  }
}

function bbcJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ login */

function bbcHash_(salt, password) {
  var h = salt + '|' + password;
  for (var i = 0; i < HASH_ITERASI; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8);
    h = Utilities.base64Encode(bytes);
  }
  return h;
}

function bbcLogin_(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!username || !password) return { ok: false, error: 'Username dan password wajib diisi.' };

  var cache = CacheService.getScriptCache();
  var kunciGagal = 'fail:' + username;
  var gagal = Number(cache.get(kunciGagal) || 0);
  if (gagal >= MAKS_GAGAL_LOGIN) return { ok: false, error: 'Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.' };

  var sh = bbcSheet_('Users');
  var data = sh.getDataRange().getValues();
  var H = data[0].map(String);
  var iU = H.indexOf('username'), iN = H.indexOf('nama'), iR = H.indexOf('role'), iS = H.indexOf('salt'),
      iH = H.indexOf('hash'), iA = H.indexOf('aktif'), iL = H.indexOf('login_terakhir');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iU]).trim().toLowerCase() !== username) continue;
    var aktif = data[r][iA] === true || String(data[r][iA]).toUpperCase() === 'TRUE';
    if (aktif && bbcHash_(String(data[r][iS]), password) === String(data[r][iH])) {
      var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
      var sesi = { u: username, nama: String(data[r][iN] || username), role: String(data[r][iR] || 'viewer').toLowerCase() };
      cache.put('tok:' + token, JSON.stringify(sesi), SESI_DETIK);
      cache.remove(kunciGagal);
      sh.getRange(r + 1, iL + 1).setValue(new Date());
      bbcLog_(username, 'login', '');
      return { ok: true, token: token, user: sesi, berlaku_detik: SESI_DETIK };
    }
    break;
  }
  cache.put(kunciGagal, String(gagal + 1), 15 * 60);
  bbcLog_(username, 'login_gagal', '');
  return { ok: false, error: 'Username atau password salah.' };
}

function bbcSesi_(token) {
  if (!token || typeof token !== 'string' || token.length < 30) return null;
  var raw = CacheService.getScriptCache().get('tok:' + token);
  return raw ? JSON.parse(raw) : null;
}

function bbcLog_(user, aksi, detail) {
  try {
    var sh = bbcSheet_('Log');
    sh.appendRow([new Date(), user, aksi, detail]);
    if (sh.getLastRow() > 5000) sh.deleteRows(2, 1000);   // jaga ukuran log
  } catch (e) { /* log tidak boleh menggagalkan permintaan */ }
}

/* ----------------------------------------------------------------- data */

function bbcSetting_() {
  var vals = bbcSheet_('Setting').getDataRange().getValues(), s = {};
  for (var r = 1; r < vals.length; r++) if (vals[r][0]) s[String(vals[r][0]).trim()] = vals[r][1];
  return s;
}

function bbcMeta_() {
  var set = bbcSetting_();
  var bulan = {};
  ['produksi', 'pengiriman', 'byproduct'].forEach(function (t) {
    bbcReadTable_(t).forEach(function (row) { if (row.tanggal) bulan[String(row.tanggal).slice(0, 7)] = true; });
  });
  var props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    bulan: Object.keys(bulan).sort(),
    setting: {
      nama_pks: set.NAMA_PKS || 'PKS Sei Buatan',
      kapasitas: Number(set.KAPASITAS_TERPASANG_TON_JAM) || null,
      target_rend_cpo: Number(set.TARGET_REND_CPO) || null,
      target_rend_pk: Number(set.TARGET_REND_PK) || null
    },
    sinkron_terakhir: props.getProperty('LAST_SYNC') || null
  };
}

/** Semua data untuk satu bulan ('YYYY-MM') + rekap bulanan tahun berjalan. */
function bbcData_(bulan) {
  if (!/^\d{4}-\d{2}$/.test(bulan)) return { ok: false, error: 'Format bulan harus YYYY-MM.' };
  var tahun = bulan.slice(0, 4);
  var urutFile = bbcUrutFile_();
  function bulanIni(rows) { return rows.filter(function (r) { return String(r.tanggal).slice(0, 7) === bulan; }); }

  var produksiAll = bbcDedupeTanggal_(bbcReadTable_('produksi'), urutFile);
  var pakaiFile = {};
  produksiAll.forEach(function (r) { pakaiFile[r.tanggal] = r._file; });
  function dariFileTerpakai(rows) { return rows.filter(function (r) { return pakaiFile[r.tanggal] === r._file; }); }

  var res = {
    ok: true,
    bulan: bulan,
    produksi: bulanIni(produksiAll),
    terima: bulanIni(dariFileTerpakai(bbcReadTable_('terima'))),
    sumber: bulanIni(dariFileTerpakai(bbcReadTable_('sumber'))),
    shift: bulanIni(dariFileTerpakai(bbcReadTable_('shift'))),
    sisa_real: bulanIni(dariFileTerpakai(bbcReadTable_('sisa_real'))),
    pengiriman: bulanIni(bbcReadTable_('pengiriman')),
    byproduct: bulanIni(bbcReadTable_('byproduct')),
    tahunan: { produksi: {}, byproduct: {}, pengiriman: {} }
  };

  // Rekap per bulan untuk tahun yang sama (grafik tren tahunan).
  function tambah(obj, key, field, v) { obj[key] = obj[key] || {}; obj[key][field] = (obj[key][field] || 0) + (Number(v) || 0); }
  produksiAll.forEach(function (r) {
    if (String(r.tanggal).slice(0, 4) !== tahun) return;
    var m = String(r.tanggal).slice(0, 7);
    ['diterima', 'tbs_olah', 'cpo', 'pk', 'jam_olah', 'jam_stagnasi'].forEach(function (f) { tambah(res.tahunan.produksi, m, f, r[f]); });
    tambah(res.tahunan.produksi, m, 'hari', 1);
  });
  bbcReadTable_('byproduct').forEach(function (r) {
    if (String(r.tanggal).slice(0, 4) !== tahun) return;
    var k = String(r.tanggal).slice(0, 7) + '|' + r.jenis;
    ['tbs_olah', 'produksi', 'dibakar', 'dijual', 'kbn_inti', 'pls_tu', 'waduk', 'boiler', 'generator'].forEach(function (f) { tambah(res.tahunan.byproduct, k, f, r[f]); });
  });
  bbcReadTable_('pengiriman').forEach(function (r) {
    if (String(r.tanggal).slice(0, 4) !== tahun) return;
    tambah(res.tahunan.pengiriman, String(r.tanggal).slice(0, 7) + '|' + r.produk, 'tonase', r.tonase);
  });

  ['produksi', 'terima', 'sumber', 'shift', 'sisa_real', 'pengiriman', 'byproduct'].forEach(function (k) {
    res[k].forEach(function (r) { delete r._file; });
  });
  return res;
}

function bbcValidasi_() {
  var files = bbcReadTable_('file');
  var list = [];
  files.forEach(function (f) {
    var w = [];
    try { w = JSON.parse(f.peringatan || '[]'); } catch (e) {}
    w.forEach(function (x) { list.push({ file: f.nama, jenis: f.jenis, level: x.level, pesan: x.pesan }); });
  });
  var lain = PropertiesService.getScriptProperties().getProperty('SYNC_WARNINGS');
  if (lain) JSON.parse(lain).forEach(function (x) { list.push(x); });
  return {
    ok: true,
    sinkron_terakhir: PropertiesService.getScriptProperties().getProperty('LAST_SYNC'),
    file: files.map(function (f) {
      return { nama: f.nama, jenis: f.jenis, diperbarui: f.diperbarui, disinkron: f.disinkron, status: f.status, baris: f.baris };
    }),
    peringatan: list
  };
}

/** file_id -> urutan (file yang lebih baru diperbarui menang jika tanggal ganda). */
function bbcUrutFile_() {
  var map = {};
  bbcReadTable_('file').forEach(function (f) { map[f.file_id] = String(f.diperbarui || ''); });
  return map;
}

function bbcDedupeTanggal_(rows, urutFile) {
  var best = {};
  rows.forEach(function (r) {
    var cur = best[r.tanggal];
    if (!cur || (urutFile[r._file] || '') > (urutFile[cur._file] || '')) best[r.tanggal] = r;
  });
  return Object.keys(best).sort().map(function (k) { return best[k]; });
}
