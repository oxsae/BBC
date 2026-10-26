/**
 * BBC — Buatan Business Cockpit
 * Parser.gs : membaca spreadsheet format lama berdasarkan LABEL, bukan alamat sel.
 *
 * Semua fungsi di file ini hanya menerima array 2D (hasil getValues()),
 * sehingga bisa diuji di luar Google (Node) dengan file .xlsx asli.
 *
 * Input workbook: [{ name: 'nama tab', values: [[...], ...] }, ...]
 */

var BULAN_ID = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6, JULI: 7,
  AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOPEMBER: 11, NOVEMBER: 11, DESEMBER: 12
};
// Singkatan yang dipakai di judul laporan, mis. "BULAN SEPT 2026", "AGSTS".
var BULAN_SINGKAT = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, JUN: 6, JUL: 7, AGU: 8, AGS: 8, AGT: 8, AGSTS: 8, AGUST: 8,
  SEP: 9, SEPT: 9, OKT: 10, OCT: 10, NOV: 11, NOP: 11, DES: 12, DEC: 12
};

// Produk yang dikenali dari judul "MONITORING PENGIRIMAN ...".
var PRODUK_DIKENAL = ['CPO', 'PK', 'TANKOS', 'CANGKANG', 'FIBER', 'SOLID', 'ABU JANJANG', 'ABU BOILER'];

/* ---------------------------------------------------------------- helper */

/** Normalisasi label: huruf besar, tanda baca jadi spasi. 'AMO,I' -> 'AMO I'. */
function bbcNorm_(v) {
  if (v === null || v === undefined) return '';
  return String(v).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Angka dari sel. '#REF!', teks, kosong -> null. '151,0' -> 151. */
function bbcNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  var s = String(v).trim();
  if (!s || s.charAt(0) === '#' || s === '-') return null;
  if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');          // 1.234.567
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function bbcIsErr_(v) {
  return typeof v === 'string' && /^#(REF|DIV\/0|VALUE|N\/A|NAME|NUM|ERROR)/.test(v.trim());
}

function bbcPad_(n) { return (n < 10 ? '0' : '') + n; }

/** Tanggal dari Date, '01.10.2026', '01/10/2026', atau '01 Oktober 2026' -> 'YYYY-MM-DD'. */
function bbcDate_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.getFullYear() + '-' + bbcPad_(v.getMonth() + 1) + '-' + bbcPad_(v.getDate());
  }
  if (typeof v !== 'string') return null;
  var s = v.trim(), m;
  if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/))) {
    return m[3] + '-' + bbcPad_(+m[2]) + '-' + bbcPad_(+m[1]);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/))) {
    var bln = BULAN_ID[m[2].toUpperCase()];
    if (bln) return m[3] + '-' + bbcPad_(bln) + '-' + bbcPad_(+m[1]);
  }
  return null;
}

/** 'BULAN : OKTOBER 2026' -> {tahun:2026, bulan:10} */
function bbcBulanDariTeks_(s) {
  var t = bbcNorm_(s), k;
  var peta = [BULAN_ID, BULAN_SINGKAT];
  for (var i = 0; i < peta.length; i++) {
    for (k in peta[i]) {
      var m = t.match(new RegExp('\\b' + k + '\\s+(\\d{4})\\b'));
      if (m) return { tahun: +m[1], bulan: peta[i][k] };
    }
  }
  // Ejaan lain (mis. "AGUSTS 2026"): cocokkan 3 huruf pertama kata sebelum tahun.
  var re = /\b([A-Z]{3,10})\s+(\d{4})\b/g, mm;
  while ((mm = re.exec(t))) {
    var b = BULAN_SINGKAT[mm[1].slice(0, 3)] || { MEI: 5 }[mm[1].slice(0, 3)];
    if (b) return { tahun: +mm[2], bulan: b };
  }
  return null;
}

/** Cari sel dengan label (exact setelah normalisasi). Mengembalikan {r, c} pertama. */
function bbcFind_(values, label, opt) {
  opt = opt || {};
  var target = bbcNorm_(label);
  var r0 = opt.r0 || 0, r1 = Math.min(opt.r1 === undefined ? values.length : opt.r1, values.length);
  for (var r = r0; r < r1; r++) {
    var row = values[r] || [];
    if (opt.col !== undefined) {
      if (bbcNorm_(row[opt.col]) === target) return { r: r, c: opt.col };
      continue;
    }
    var c1 = Math.min(opt.c1 === undefined ? row.length : opt.c1, row.length);
    for (var c = opt.c0 || 0; c < c1; c++) {
      if (bbcNorm_(row[c]) === target) return { r: r, c: c };
    }
  }
  return null;
}

function bbcCell_(values, r, c) {
  var row = values[r];
  return row ? row[c] : undefined;
}

/* ----------------------------------------------------- deteksi jenis file */

/** Menentukan jenis workbook dari isinya. */
function bbcDetectType(workbook) {
  for (var i = 0; i < workbook.length; i++) {
    var v = workbook[i].values;
    var top = v.slice(0, 8);
    for (var r = 0; r < top.length; r++) {
      for (var c = 0; c < (top[r] || []).length; c++) {
        var t = bbcNorm_(top[r][c]);
        if (!t) continue;
        if (t.indexOf('MONITORING PENGIRIMAN') === 0) return 'PENGIRIMAN';
        // Laporan harian by product: "LAPORAN HARIAN [SAVING] TANKOS/CANGKANG/... PKS SBT"
        if (t.indexOf('LAPORAN HARIAN') === 0 && bbcJenisByproduct_(t)) return 'TANKOS_HARIAN';
        if (t === 'TBS BUKU') return 'PRODUKSI';
      }
    }
    if (bbcRealProduksiHeader_(v)) return 'PRODUKSI';
  }
  return null;
}

/* ------------------------------------------ Laporan Harian Produksi (1 tab = 1 hari) */

/**
 * Membaca satu tab harian. Mengembalikan { hari, sumber[], shift[], sisaReal[], tangki[], warnings[] }
 * atau null jika tab bukan laporan harian.
 */
function bbcParseProduksiTab(values, tabName) {
  var W = [];
  var anchor = bbcFind_(values, 'TBS BUKU', { r1: 10 });
  if (!anchor) return null;
  var L = anchor.c;                       // kolom label utama
  var V = L + 1;                          // kolom nilai di sebelah label
  var tag = 'Tab "' + tabName + '"';

  // Tanggal: cari di 3 baris teratas.
  var tanggal = null;
  for (var r = 0; r < 3 && !tanggal; r++) {
    var row = values[r] || [];
    for (var c = 0; c < row.length && !tanggal; c++) tanggal = bbcDate_(row[c]);
  }
  if (!tanggal) { W.push({ level: 'error', pesan: tag + ': tanggal tidak ditemukan di baris atas.' }); return { warnings: W }; }
  var dayFromTab = parseInt(tabName, 10);
  if (dayFromTab && dayFromTab !== +tanggal.slice(8, 10)) {
    W.push({ level: 'warn', pesan: tag + ': nama tab (' + tabName + ') tidak sama dengan tanggal di sel (' + tanggal + ').' });
  }
  tag = tanggal + ' (tab ' + tabName + ')';

  function rowOf(label, r0, r1) { var f = bbcFind_(values, label, { col: L, r0: r0, r1: r1 }); return f ? f.r : -1; }
  function valAt(label, r0, r1, wajib) {
    var r = rowOf(label, r0, r1);
    if (r < 0) { if (wajib) W.push({ level: 'error', pesan: tag + ': label "' + label + '" tidak ditemukan.' }); return null; }
    var raw = bbcCell_(values, r, V);
    if (bbcIsErr_(raw)) W.push({ level: 'warn', kode: label + ' berisi ' + raw, tab: tabName, pesan: tag + ': "' + label + '" berisi ' + raw + '.' });
    return bbcNum_(raw);
  }

  var rSisaAwal = rowOf('SISA AWAL');
  var rTersedia = rowOf('TERSEDIA');
  var rDiolah = rowOf('DIOLAH', rTersedia > 0 ? rTersedia : 0);
  var rSisaAkhir = rowOf('SISA AKHIR TBS');
  var rSisaReal = rowOf('SISA TBS REAL');
  var rSelisihTbs = rowOf('SELISIH TBS');
  if (rSisaAwal < 0 || rTersedia < 0 || rDiolah < 0 || rSisaAkhir < 0) {
    W.push({ level: 'error', pesan: tag + ': struktur utama (SISA AWAL / TERSEDIA / DIOLAH / SISA AKHIR TBS) tidak lengkap.' });
    return { warnings: W };
  }

  var hari = { tanggal: tanggal, tab: tabName };
  hari.sisa_awal = valAt('SISA AWAL', 0, rTersedia, true);

  // TBS diterima per sumber (antara DITERIMA dan TERSEDIA).
  var rDiterima = rowOf('DITERIMA', 0, rTersedia);
  var terima = [];
  for (r = rDiterima + 1; r < rTersedia; r++) {
    var lab = bbcNorm_(bbcCell_(values, r, L));
    if (!lab) continue;
    var n = bbcNum_(bbcCell_(values, r, V));
    if (lab === 'JUMLAH') { hari.diterima = n; continue; }
    terima.push({ sumber: lab, kg: n || 0 });
  }
  hari.tersedia = valAt('TERSEDIA', 0, rTersedia + 1, true);

  // Tabel DIOLAH: kolom dicari dari judul di baris DIOLAH (TBS, CPO, KERNEL).
  var hdr = values[rDiolah] || [];
  var cTbs = -1, cCpo = -1, cKer = -1;
  for (c = L + 1; c < hdr.length; c++) {
    var h = bbcNorm_(hdr[c]);
    if (h === 'TBS' && cTbs < 0) cTbs = c;
    else if (h === 'CPO' && cCpo < 0) cCpo = c;
    else if ((h === 'KERNEL' || h === 'PK') && cKer < 0) cKer = c;
  }
  if (cTbs < 0 || cCpo < 0 || cKer < 0) {
    W.push({ level: 'error', pesan: tag + ': judul kolom TBS/CPO/KERNEL di tabel DIOLAH tidak ditemukan.' });
    return { warnings: W };
  }
  var olah = {};       // label -> {tbs,cpo,pk}
  var rSd = -1;
  for (r = rDiolah + 1; r < rSisaAkhir; r++) {
    lab = bbcNorm_(bbcCell_(values, r, L));
    if (!lab) continue;
    if (lab === 'S D BLN INI') rSd = r;
    var key = lab;
    if (olah[key]) continue;   // label pertama yang dipakai
    olah[key] = {
      tbs: bbcNum_(bbcCell_(values, r, cTbs)),
      cpo: bbcNum_(bbcCell_(values, r, cCpo)),
      pk: bbcNum_(bbcCell_(values, r, cKer))
    };
  }
  var tot = olah['JUMLAH'] || {};
  hari.tbs_olah = tot.tbs; hari.cpo = tot.cpo; hari.pk = tot.pk;
  var bln = olah['BLN INI'] || {};       // hanya kebun Sei Induk (lihat catatan README)
  var sd = olah['S D BLN INI'] || {};
  hari.sd_tbs = sd.tbs; hari.sd_cpo = sd.cpo; hari.sd_pk = sd.pk;   // akumulasi tahun berjalan (Sei Induk)
  hari.bln_induk_tbs = bln.tbs; hari.bln_induk_cpo = bln.cpo; hari.bln_induk_pk = bln.pk;
  if (tot.tbs === null || tot.tbs === undefined) W.push({ level: 'error', pesan: tag + ': baris JUMLAH di tabel DIOLAH tidak terbaca.' });

  var SUMBER_OLAH = [
    ['INTI SBT TM', 'Inti SBT (TM)', 'Inti'], ['TBM', 'Inti SBT (TBM)', 'Inti'],
    ['AMO I', 'AMO I', 'AMO'], ['AMO II', 'AMO II', 'AMO'],
    ['PLSMA', 'Plasma', 'Plasma'], ['PLASMA', 'Plasma', 'Plasma'],
    ['PIHAK III', 'Pihak III', 'Pihak III']
  ];
  var sumber = [], sumTbs = 0, seen = {};
  SUMBER_OLAH.forEach(function (s) {
    var o = olah[s[0]];
    if (!o || seen[s[1]]) return;
    seen[s[1]] = true;
    sumber.push({ tanggal: tanggal, sumber: s[1], kelompok: s[2], tbs: o.tbs || 0, cpo: o.cpo || 0, pk: o.pk || 0 });
    sumTbs += o.tbs || 0;
  });
  if (tot.tbs && Math.abs(sumTbs - tot.tbs) > 1) {
    W.push({ level: 'warn', pesan: tag + ': total TBS olah (' + tot.tbs + ') tidak sama dengan jumlah per sumber (' + sumTbs + ').' });
  }

  // Jam olah, jam stagnasi, keterangan: di area setelah "s/d bln ini" sampai SISA AKHIR.
  var jam = [], ket = '';
  var rA = rSd > 0 ? rSd + 1 : rDiolah + 1;
  for (r = rA; r < rSisaAkhir; r++) {
    row = values[r] || [];
    for (c = cKer + 1; c < row.length; c++) {
      var cell = row[c];
      if (typeof cell !== 'string') continue;
      var mj = cell.match(/^\s*(\d+(?:[.,]\d+)?)\s*jam\s*$/i);
      if (mj) jam.push(Number(mj[1].replace(',', '.')));
      else if (/[A-Za-z]{3,}/.test(cell) && cell.trim().length > 8 && !ket) ket = cell.trim();
    }
  }
  hari.jam_olah = jam.length > 0 ? jam[0] : null;
  hari.jam_stagnasi = jam.length > 1 ? jam[1] : null;
  hari.stagnasi_ket = ket;
  if (!hari.tbs_olah && (hari.jam_olah || hari.jam_stagnasi)) {
    W.push({ level: 'warn', pesan: tag + ': TBS olah 0 tetapi jam olah/stagnasi terisi (' + hari.jam_olah + ' jam / ' +
      hari.jam_stagnasi + ' jam) — kemungkinan tersalin dari hari sebelumnya. Jam diabaikan.' });
    hari.jam_olah = 0; hari.jam_stagnasi = null; hari.stagnasi_ket = '';
  }
  if (hari.tbs_olah > 0 && !hari.jam_olah) W.push({ level: 'warn', pesan: tag + ': jam olah tidak terbaca (format yang dicari mis. "18jam").' });

  hari.sisa_akhir = valAt('SISA AKHIR TBS', rSisaAkhir, rSisaAkhir + 1, true);
  hari.diolah_bln_ini = valAt('DIOLAH BLN INI', rSisaAkhir, rSisaReal > 0 ? rSisaReal : undefined);
  hari.sd_bln_ini_tbs = valAt('SD BLN INI', rSisaAkhir, rSisaReal > 0 ? rSisaReal : undefined);

  // Sisa TBS real per lokasi.
  var sisaReal = [];
  if (rSisaReal > 0) {
    var rEnd = rSelisihTbs > 0 ? rSelisihTbs : rSisaReal + 15;
    for (r = rSisaReal + 1; r < rEnd; r++) {
      lab = bbcCell_(values, r, L);
      if (!bbcNorm_(lab)) continue;
      n = bbcNum_(bbcCell_(values, r, V));
      if (bbcNorm_(lab) === 'JUMLAH') { hari.sisa_real = n; continue; }
      sisaReal.push({ tanggal: tanggal, lokasi: String(lab).replace(/\s+/g, ' ').trim(), kg: n || 0 });
    }
    hari.selisih_tbs = rSelisihTbs > 0 ? bbcNum_(bbcCell_(values, rSelisihTbs, V)) : null;
  }

  // Stok CPO & kernel (buku vs real).
  hari.cpo_buku = valAt('CPO BUKU');
  hari.cpo_real = valAt('CPO REAL');
  hari.pk_buku = valAt('KERNEL BUKU');
  hari.pk_real = valAt('KERNEL REAL');

  // TBS diolah real per shift (tabel dengan judul SHIFT).
  var shift = [];
  var aS = bbcFind_(values, 'SHIFT', { r1: rTersedia });
  if (aS) {
    var sh = values[aS.r] || [], cD = -1, cL = -1, cM = -1;
    for (c = aS.c + 1; c < sh.length; c++) {
      h = bbcNorm_(sh[c]);
      if (h === 'DIOLAH' && cD < 0) cD = c;
      else if (h === 'JLH LORI' && cL < 0) cL = c;
      else if (h === 'MINYAK' && cM < 0) cM = c;
    }
    for (r = aS.r + 1; r < rTersedia; r++) {
      var no = bbcNum_(bbcCell_(values, r, aS.c));
      var kg = cD >= 0 ? bbcNum_(bbcCell_(values, r, cD)) : null;
      if (no && no >= 1 && no <= 4 && kg !== null) {
        shift.push({ tanggal: tanggal, shift: no, tbs: kg, lori: cL >= 0 ? bbcNum_(bbcCell_(values, r, cL)) : null,
          minyak: cM >= 0 ? bbcNum_(bbcCell_(values, r, cM)) : null });
      }
    }
    shift.sort(function (a, b) { return a.shift - b.shift; });
    hari.tbs_olah_real = shift.reduce(function (s, x) { return s + (x.tbs || 0); }, 0);
    hari.lori = shift.reduce(function (s, x) { return s + (x.lori || 0); }, 0);
  }

  // Tangki CPO (ALB).
  var tangki = [];
  var aT = bbcFind_(values, 'TANGKI', { col: L, r0: rSisaAkhir });
  if (aT) {
    var th = values[aT.r] || [], cAlb = -1, cReal = -1, cBuku = -1;
    for (c = L + 1; c < th.length; c++) {
      h = bbcNorm_(th[c]);
      if (h === 'ALB' && cAlb < 0) cAlb = c;
      else if (h === 'REAL' && cReal < 0) cReal = c;
      else if (h === 'BUKU' && cBuku < 0) cBuku = c;
    }
    for (r = aT.r + 1; r < aT.r + 8; r++) {
      lab = bbcNorm_(bbcCell_(values, r, L));
      if (!lab) continue;
      if (lab === 'JUMLAH') break;
      tangki.push({ tanggal: tanggal, tangki: String(bbcCell_(values, r, L)).trim(),
        alb: cAlb >= 0 ? bbcNum_(bbcCell_(values, r, cAlb)) : null,
        real: cReal >= 0 ? bbcNum_(bbcCell_(values, r, cReal)) : null,
        buku: cBuku >= 0 ? bbcNum_(bbcCell_(values, r, cBuku)) : null });
    }
    if (tangki.length) hari.alb_tangki = tangki[0].alb;
  }

  // Cek konsistensi neraca TBS.
  if (hari.sisa_awal !== null && hari.diterima !== null && hari.tersedia !== null &&
      Math.abs(hari.sisa_awal + hari.diterima - hari.tersedia) > 1) {
    W.push({ level: 'warn', pesan: tag + ': SISA AWAL + DITERIMA ≠ TERSEDIA.' });
  }
  if (hari.tersedia !== null && hari.tbs_olah !== null && hari.sisa_akhir !== null &&
      Math.abs(hari.tersedia - hari.tbs_olah - hari.sisa_akhir) > 1) {
    W.push({ level: 'warn', pesan: tag + ': TERSEDIA − DIOLAH ≠ SISA AKHIR TBS.' });
  }
  if (hari.tbs_olah > 0) {
    var rc = hari.cpo / hari.tbs_olah * 100, rp = hari.pk / hari.tbs_olah * 100;
    if (rc < 15 || rc > 30) W.push({ level: 'warn', pesan: tag + ': rendemen CPO ' + rc.toFixed(2) + '% di luar kewajaran (15–30%).' });
    if (rp < 2 || rp > 8) W.push({ level: 'warn', pesan: tag + ': rendemen PK ' + rp.toFixed(2) + '% di luar kewajaran (2–8%).' });
  }

  terima.forEach(function (t) { t.tanggal = tanggal; });
  return { hari: hari, terima: terima, sumber: sumber, shift: shift, sisaReal: sisaReal, tangki: tangki, warnings: W };
}

/** Membaca seluruh workbook produksi (tab 1–31). Menambah cek antar-hari. */
function bbcParseProduksiWorkbook(workbook) {
  var out = { hari: [], terima: [], sumber: [], shift: [], sisaReal: [], tangki: [], warnings: [] };
  var grup = {};   // peringatan yang sama di banyak tab digabung jadi satu baris
  workbook.forEach(function (tab) {
    var p = bbcParseRealProduksiTab(tab.values, tab.name) || bbcParseProduksiTab(tab.values, tab.name);
    if (!p) return;
    p.warnings.forEach(function (w) {
      if (!w.kode) { out.warnings.push(w); return; }
      (grup[w.kode] = grup[w.kode] || []).push(w.tab);
    });
    if (!p.hari) return;
    out.hari = out.hari.concat(Array.isArray(p.hari) ? p.hari : [p.hari]);
    ['terima', 'sumber', 'shift', 'sisaReal', 'tangki'].forEach(function (k) { out[k] = out[k].concat(p[k]); });
  });
  Object.keys(grup).forEach(function (k) {
    out.warnings.push({ level: 'warn', pesan: '"' + k.replace(' berisi ', '" berisi ') + ' di ' + grup[k].length + ' tab (tab ' + grup[k].join(', ') + ').' });
  });
  out.hari.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; });
  for (var i = 1; i < out.hari.length; i++) {
    var a = out.hari[i - 1], b = out.hari[i];
    if (a.tanggal === b.tanggal) {
      out.warnings.push({ level: 'error', pesan: 'Tanggal ' + b.tanggal + ' muncul di dua tab (' + a.tab + ' dan ' + b.tab + ').' });
    } else if (a.sisa_akhir !== null && b.sisa_awal !== null && Math.abs(a.sisa_akhir - b.sisa_awal) > 1) {
      out.warnings.push({ level: 'warn', pesan: b.tanggal + ': SISA AWAL (' + b.sisa_awal + ') tidak sama dengan SISA AKHIR hari sebelumnya (' + a.sisa_akhir + ').' });
    }
  }
  return out;
}

/* ---------------------------------- Real Produksi (1 tab = 1 bulan, 1 baris = 1 hari) */

/** Baris judul tabel Real Produksi: memuat TGL, TBS DITERIMA, TBS DIOLAH. Mengembalikan {r, c} atau null. */
function bbcRealProduksiHeader_(values) {
  for (var r = 0; r < Math.min(10, values.length); r++) {
    var row = (values[r] || []).map(bbcNorm_);
    var cT = row.indexOf('TGL');
    if (cT >= 0 && row.indexOf('TBS DITERIMA') >= 0 && row.indexOf('TBS DIOLAH') >= 0) return { r: r, c: cT };
  }
  return null;
}

/**
 * Tabel bulanan "Real Produksi": kelompok kolom (TBS DITERIMA, TBS DIOLAH, TBS SISA, MINYAK SAWIT,
 * INTI SAWIT, Persediaan dan Mutu, Persediaan) dicari dari judul di baris atas, lalu sub-kolom
 * dicari dari judul di bawahnya. Hasilnya berbentuk sama dengan laporan harian per tab.
 */
function bbcParseRealProduksiTab(values, tabName) {
  var H = bbcRealProduksiHeader_(values);
  if (!H) return null;
  var W = [], tag = 'Real Produksi (tab "' + tabName + '")';
  var top = (values[H.r] || []).map(bbcNorm_);
  var lebar = 0, r, c;
  for (r = H.r; r < H.r + 5; r++) lebar = Math.max(lebar, (values[r] || []).length);

  // Rentang kolom tiap kelompok: dari judulnya sampai judul kelompok berikutnya.
  var judul = [];
  for (c = 0; c < top.length; c++) if (top[c] && c !== H.c) judul.push({ nama: top[c], c: c });
  function sek(nama) {
    for (var i = 0; i < judul.length; i++) {
      if (judul[i].nama === nama) return { c0: judul[i].c, c1: i + 1 < judul.length ? judul[i + 1].c : lebar };
    }
    return null;
  }
  // Baris judul (di bawah baris kelompok) tempat label pertama kali muncul dalam rentang s.
  function barisDari(s, label) {
    if (!s) return -1;
    var target = bbcNorm_(label);
    for (var rr = H.r + 1; rr < Math.min(H.r + 9, values.length); rr++) {
      for (var cc = s.c0; cc < s.c1; cc++) if (bbcNorm_((values[rr] || [])[cc]) === target) return rr;
    }
    return -1;
  }
  // Kolom ke-n (mulai 1) di rentang s pada baris rr yang judulnya sama dengan label.
  function kol(s, rr, label, ke) {
    if (!s || rr < 0) return -1;
    var row = values[rr] || [], target = bbcNorm_(label), hit = 0;
    for (var cc = s.c0; cc < s.c1; cc++) {
      if (bbcNorm_(row[cc]) === target && ++hit === (ke || 1)) return cc;
    }
    return -1;
  }
  var sT = sek('TBS DITERIMA'), sO = sek('TBS DIOLAH'), sS = sek('TBS SISA'), sM = sek('MINYAK SAWIT'),
      sI = sek('INTI SAWIT'), sPM = sek('PERSEDIAAN DAN MUTU'), sP = sek('PERSEDIAAN');
  if (!sT || !sO || !sM || !sI) {
    return { warnings: [{ level: 'error', pesan: tag + ': judul kelompok TBS DITERIMA / TBS DIOLAH / MINYAK SAWIT / INTI SAWIT tidak lengkap.' }] };
  }
  // Sub-kolom. rT/rO = baris judul paling bawah (SBT, LDA, ..., JUMLAH, DITERIMA / DIOLAH);
  // rM/rI = baris nama kebun di Minyak & Inti; rM3/rI3 = baris "JUMLAH P3".
  var rT = barisDari(sT, 'SBT'), rO = barisDari(sO, 'SBT');
  var rM = barisDari(sM, 'INTI SBT'), rI = barisDari(sI, 'INTI SBT');
  var rM3 = barisDari(sM, 'JUMLAH P3'), rI3 = barisDari(sI, 'JUMLAH P3');
  var K = {
    t: { sbt: kol(sT, rT, 'SBT'), lda: kol(sT, rT, 'LDA'), amo1: kol(sT, rT, 'AMO I'), amo2: kol(sT, rT, 'AMO II'),
         pls: kol(sT, rT, 'JUMLAH', 1), p3: kol(sT, rT, 'JUMLAH', 2), tot: kol(sT, rT, 'DITERIMA') },
    o: { sbt: kol(sO, rO, 'SBT'), lda: kol(sO, rO, 'LDA'), amo1: kol(sO, rO, 'AMOI') >= 0 ? kol(sO, rO, 'AMOI') : kol(sO, rO, 'AMO I'),
         amo2: kol(sO, rO, 'AMO II'), pls: kol(sO, rO, 'JUMLAH', 1), p3: kol(sO, rO, 'JUMLAH', 2), tot: kol(sO, rO, 'DIOLAH') },
    m: { sbt: kol(sM, rM, 'INTI SBT'), lda: kol(sM, rM, 'INTI LDA'), amo1: kol(sM, rM, 'AMO I'), amo2: kol(sM, rM, 'AMO II'),
         pls: kol(sM, rM, 'JUMLAH', 1), p3: kol(sM, rM3, 'JUMLAH P3'), tot: kol(sM, rM, 'JUMLAH', 2) },
    i: { sbt: kol(sI, rI, 'INTI SBT'), lda: kol(sI, rI, 'INTI LDA'), amo1: kol(sI, rI, 'AMO I'), amo2: kol(sI, rI, 'AMO II'),
         pls: kol(sI, rI, 'JUMLAH', 1), p3: kol(sI, rI3, 'JUMLAH P3'), tot: kol(sI, rI, 'JUMLAH', 2) }
  };
  var kurang = [];
  ['t', 'o', 'm', 'i'].forEach(function (g) {
    if (K[g].tot < 0) kurang.push({ t: 'jumlah TBS diterima', o: 'jumlah TBS diolah', m: 'jumlah minyak sawit', i: 'jumlah inti sawit' }[g]);
  });
  if (kurang.length) return { warnings: [{ level: 'error', pesan: tag + ': kolom ' + kurang.join(', ') + ' tidak ditemukan.' }] };
  var cSisa = sS ? sS.c0 : -1;
  var cAlb = kol(sPM, barisDari(sPM, 'ALB'), 'ALB');               // ALB persediaan minyak sawit
  // STOCK KERNEL kadang berada di kolom yang sama dengan judul kelompok berikutnya, jadi rentang dilebarkan 1 kolom.
  var sP2 = sP ? { c0: sP.c0, c1: sP.c1 + 1 } : null;
  var rStok = barisDari(sP2, 'STOCK CPO');
  var cStokCpo = kol(sP2, rStok, 'STOCK CPO'), cStokPk = kol(sP2, rStok, 'STOCK KERNEL');

  function num(row, cc) { return cc >= 0 ? bbcNum_(row[cc]) : null; }
  // Minyak & inti total: kolom JUMLAH dipecah RSPO / Non-RSPO (dua kolom).
  function totalRspo(row, cc) {
    var a = num(row, cc), b = num(row, cc + 1);
    if (a === null && b === null) return null;
    return (a || 0) + (b || 0);
  }

  var hari = [], terima = [], sumber = [], awalSisa = null, refAwal = [];
  var GRUP = [['sbt', 'Inti SBT', 'Inti'], ['lda', 'Inti LDA', 'Inti'], ['amo1', 'AMO I', 'AMO'], ['amo2', 'AMO II', 'AMO'],
              ['pls', 'Plasma', 'Plasma'], ['p3', 'Pihak III', 'Pihak III']];
  for (r = H.r + 1; r < values.length; r++) {
    var row = values[r] || [];
    var lab = bbcNorm_(row[H.c]);
    if (lab === 'JLH' || lab === 'JUMLAH') break;
    if (lab === 'AWAL') {
      awalSisa = num(row, cSisa);
      if (cSisa >= 0 && bbcIsErr_(row[cSisa])) refAwal.push('TBS SISA');
      if (cStokCpo >= 0 && bbcIsErr_(row[cStokCpo])) refAwal.push('STOCK CPO');
      if (cStokPk >= 0 && bbcIsErr_(row[cStokPk])) refAwal.push('STOCK KERNEL');
      continue;
    }
    var tg = bbcDate_(row[H.c]);
    if (!tg) continue;
    var h = { tanggal: tg, tab: tabName, stagnasi_ket: '' };
    h.diterima = num(row, K.t.tot);
    h.tbs_olah = num(row, K.o.tot);
    h.cpo = totalRspo(row, K.m.tot);
    h.pk = totalRspo(row, K.i.tot);
    if (!h.diterima && !h.tbs_olah && !h.cpo) continue;      // baris tanggal yang belum diisi
    h.sisa_akhir = num(row, cSisa);
    h.alb_tangki = num(row, cAlb);
    h.cpo_buku = num(row, cStokCpo);
    h.pk_buku = num(row, cStokPk);
    h.jam_olah = null; h.jam_stagnasi = null;

    var sumO = 0, sumT = 0;
    GRUP.forEach(function (g) {
      var t = num(row, K.t[g[0]]) || 0, o = num(row, K.o[g[0]]) || 0;
      sumT += t; sumO += o;
      if (t) terima.push({ tanggal: tg, sumber: g[1], kg: t });
      if (o || num(row, K.m[g[0]]) || num(row, K.i[g[0]])) {
        sumber.push({ tanggal: tg, sumber: g[1], kelompok: g[2], tbs: o,
          cpo: num(row, K.m[g[0]]) || 0, pk: num(row, K.i[g[0]]) || 0 });
      }
    });
    if (h.tbs_olah && Math.abs(sumO - h.tbs_olah) > 1) {
      W.push({ level: 'warn', pesan: tg + ': TBS diolah (' + h.tbs_olah + ') tidak sama dengan jumlah per sumber (' + sumO + ').' });
    }
    if (h.diterima && Math.abs(sumT - h.diterima) > 1) {
      W.push({ level: 'warn', pesan: tg + ': TBS diterima (' + h.diterima + ') tidak sama dengan jumlah per sumber (' + sumT + ').' });
    }
    if (h.tbs_olah > 0) {
      var rc = h.cpo / h.tbs_olah * 100, rp = h.pk / h.tbs_olah * 100;
      if (rc < 15 || rc > 30) W.push({ level: 'warn', pesan: tg + ': rendemen CPO ' + rc.toFixed(2) + '% di luar kewajaran (15–30%).' });
      if (rp < 2 || rp > 8) W.push({ level: 'warn', pesan: tg + ': rendemen PK ' + rp.toFixed(2) + '% di luar kewajaran (2–8%).' });
    } else if (h.cpo) {
      W.push({ level: 'warn', pesan: tg + ': ada produksi CPO tetapi TBS diolah 0.' });
    }
    hari.push(h);
  }

  // Sisa awal & tersedia: dari sisa akhir hari sebelumnya (hari pertama dari baris "Awal").
  var prev = awalSisa;
  hari.forEach(function (h) {
    h.sisa_awal = prev;
    h.tersedia = prev !== null && h.diterima !== null ? prev + h.diterima : null;
    prev = h.sisa_akhir;
  });
  if (refAwal.length) {
    W.push({ level: 'warn', pesan: tag + ': baris "Awal" kolom ' + refAwal.join(', ') +
      ' berisi #REF! (rumus ke file bulan lalu putus saat dikonversi). Ketik angka sisa/stok awal secara langsung; sampai itu diperbaiki, sisa TBS dan stok CPO/kernel tidak tampil.' });
  }
  return { hari: hari, terima: terima, sumber: sumber, shift: [], sisaReal: [], tangki: [], warnings: W };
}

/* --------------------------------------- Monitoring Pengiriman (CPO, PK, Tankos, dll.) */

function bbcParsePengirimanWorkbook(workbook) {
  var out = { rows: [], warnings: [] };
  workbook.forEach(function (tab) {
    var p = bbcParsePengirimanTab(tab.values, tab.name);
    if (!p) return;
    out.rows = out.rows.concat(p.rows);
    out.warnings = out.warnings.concat(p.warnings);
  });
  return out;
}

function bbcParsePengirimanTab(values, tabName) {
  var W = [], produk = null, periode = null, r, c;
  for (r = 0; r < Math.min(8, values.length); r++) {
    var row = values[r] || [];
    for (c = 0; c < row.length; c++) {
      var t = bbcNorm_(row[c]);
      if (!t) continue;
      if (t.indexOf('MONITORING PENGIRIMAN') === 0) {
        var rest = t.replace('MONITORING PENGIRIMAN', '').trim();
        PRODUK_DIKENAL.forEach(function (p) { if (!produk && (' ' + rest + ' ').indexOf(' ' + p + ' ') >= 0) produk = p; });
        if (!produk) produk = rest.split(' ')[0] || 'LAINNYA';
        var pb = bbcBulanDariTeks_(t);
        if (pb) periode = pb;
      }
      if (!periode && t.indexOf('BULAN') === 0) periode = bbcBulanDariTeks_(t);
    }
  }
  if (!produk) return null;

  // Baris judul kolom: yang memuat TANGGAL dan TUJUAN.
  var hr = -1;
  for (r = 0; r < Math.min(20, values.length) && hr < 0; r++) {
    var names = (values[r] || []).map(bbcNorm_);
    if (names.indexOf('TANGGAL') >= 0 && names.indexOf('TUJUAN') >= 0) hr = r;
  }
  if (hr < 0) { return { rows: [], warnings: [{ level: 'error', pesan: 'Pengiriman ' + produk + ' (tab ' + tabName + '): baris judul kolom (TANGGAL, TUJUAN) tidak ditemukan.' }] }; }
  var H = values[hr], H2 = values[hr + 1] || [];
  var col = {};
  for (c = 0; c < H.length; c++) {
    var h = bbcNorm_(H[c]);
    if (!h) continue;
    if (h === 'TANGGAL') col.tanggal = c;
    else if (h === 'NO DO') col.do_ = c;
    else if (h === 'NO KONTRAK') col.kontrak = c;
    else if (h === 'TUJUAN') col.tujuan = c;
    else if (h.indexOf('VOL KIRIM') === 0) col.vol = c;
    else if (h === 'ALB') col.alb = c;
    else if (h === 'KA') col.ka = c;
    else if (h === 'KK') col.kk = c;
    else if (h.indexOf('SISA VOL') === 0) col.sisa = c;
    else if (h === 'KETERANGAN' && col.ket === undefined) col.ket = c;
    else if (h === 'TRIP') col.trip = c;
  }
  // Sub-judul RSPO / NON RSPO di baris bawahnya.
  for (c = 0; c < H2.length; c++) {
    var h2 = bbcNorm_(H2[c]);
    if (h2 === 'RSPO') col.rspo = c;
    else if (h2 === 'NON RSPO') col.nonrspo = c;
  }
  var dataStart = (col.rspo !== undefined || col.nonrspo !== undefined) ? hr + 2 : hr + 1;
  if (col.tanggal === undefined || (col.vol === undefined && col.nonrspo === undefined)) {
    return { rows: [], warnings: [{ level: 'error', pesan: 'Pengiriman ' + produk + ': kolom TANGGAL / VOL. KIRIM tidak ditemukan.' }] };
  }

  var rows = [], lastDate = null, label = 'Pengiriman ' + produk;
  for (r = dataStart; r < values.length; r++) {
    row = values[r] || [];
    var stop = false;
    for (c = 0; c < Math.min(row.length, (col.tujuan || 6) + 1); c++) {
      var tt = bbcNorm_(row[c]);
      if (tt === 'TOTAL' || tt === 'JUMLAH') stop = true;
    }
    if (stop) break;
    var d = bbcDate_(row[col.tanggal]);
    if (d) lastDate = d;
    var rspo = col.rspo !== undefined ? bbcNum_(row[col.rspo]) : null;
    var non = col.nonrspo !== undefined ? bbcNum_(row[col.nonrspo]) : null;
    var vol = (col.rspo === undefined && col.nonrspo === undefined) ? bbcNum_(row[col.vol]) : null;
    var tonase = (rspo || 0) + (non || 0) + (vol || 0);
    if (!tonase) continue;
    if (!lastDate) { W.push({ level: 'error', pesan: label + ' baris ' + (r + 1) + ': ada volume tanpa tanggal.' }); continue; }
    if (periode && (+lastDate.slice(0, 4) !== periode.tahun || +lastDate.slice(5, 7) !== periode.bulan)) {
      W.push({ level: 'warn', pesan: label + ' baris ' + (r + 1) + ': tanggal ' + lastDate + ' di luar bulan laporan.' });
    }
    function s(k) { return col[k] !== undefined && row[col[k]] !== null && row[col[k]] !== undefined ? String(row[col[k]]).trim() : ''; }
    function n(k) { return col[k] !== undefined ? bbcNum_(row[col[k]]) : null; }
    rows.push({
      tanggal: lastDate, produk: produk, no_do: s('do_'), kontrak: s('kontrak'), tujuan: s('tujuan'),
      rspo: rspo || 0, non_rspo: (non || 0) + (vol || 0), tonase: tonase,
      alb: n('alb'), ka: n('ka'), kk: n('kk'), trip: n('trip'), sisa_do: n('sisa'), keterangan: s('ket'),
      baris: r + 1
    });
  }
  // Koreksi satuan: volume satu pengiriman di bawah 1.000 kg tidak mungkin (satu truk ≥ beberapa ton).
  // Ini terjadi jika lokal spreadsheet bukan Indonesia: staf mengetik "72.740" tetapi tersimpan 72,74.
  var dikoreksi = 0;
  rows.forEach(function (x) {
    if (x.tonase > 0 && x.tonase < 1000) {
      x.rspo *= 1000; x.non_rspo *= 1000; x.tonase *= 1000;
      if (x.sisa_do !== null && Math.abs(x.sisa_do) < 1000) x.sisa_do *= 1000;
      if (/^\d+(\.\d+)?$/.test(x.keterangan) && +x.keterangan < 1000) x.keterangan = String(Math.round(+x.keterangan * 1000));
      dikoreksi++;
    }
  });
  if (dikoreksi) {
    W.push({ level: 'warn', pesan: label + ' (tab "' + tabName + '"): ' + dikoreksi + ' baris volume tersimpan dalam satuan ton (mis. 72,74 untuk 72.740 kg) dan sudah dikali 1.000. ' +
      'Penyebabnya pengaturan lokal spreadsheet bukan Indonesia: buka File → Setelan → Lokal: Indonesia, lalu ketik ulang angka volume di tab ini.' });
  }
  return { rows: rows, warnings: W };
}

/* ------------------------------------ Laporan Harian Saving Tankos (1 tab = 1 bulan) */

function bbcParseTankosWorkbook(workbook) {
  var out = { rows: [], warnings: [] }, grup = {};
  workbook.forEach(function (tab) {
    var p = bbcParseTankosTab(tab.values, tab.name);
    if (!p) return;
    out.rows = out.rows.concat(p.rows);
    p.warnings.forEach(function (w) {
      if (!w.kode) { out.warnings.push(w); return; }
      (grup[w.kode] = grup[w.kode] || []).push(w.tab);
    });
  });
  Object.keys(grup).forEach(function (k) {
    out.warnings.push({ level: 'warn', pesan: k + ' di tab ' + grup[k].join(', ') + ' (rumus ke file lain putus). Ketik angka stok awal secara langsung.' });
  });
  return out;
}

/** 'LAPORAN HARIAN SAVING CANGKANG PKS SBT' -> 'CANGKANG'. Fibre ditulis FIBER. */
function bbcJenisByproduct_(judulNorm) {
  var m = judulNorm.match(/^LAPORAN HARIAN (?:SAVING )?(.+?) PKS\b/);
  if (!m) return null;
  var j = m[1].trim();
  if (j === 'FIBRE') j = 'FIBER';
  return /^(TANKOS|CANGKANG|FIBER|SOLID|ABU JANJANG|ABU BOILER)$/.test(j) ? j : null;
}

/**
 * Laporan harian by product (1 tab = 1 bulan): Tankos, Cangkang, Fibre, Solid, Abu Janjang, Abu Boiler.
 * Kolom dicari dari judulnya; kolom yang tidak ada di laporan jenis tertentu dibiarkan kosong.
 */
function bbcParseTankosTab(values, tabName) {
  var periode = null, jenis = null, r, c, W = [];
  for (r = 0; r < 4; r++) {
    (values[r] || []).forEach(function (v) {
      var t = bbcNorm_(v);
      if (!jenis && t.indexOf('LAPORAN HARIAN') === 0) jenis = bbcJenisByproduct_(t);
      if (!periode) periode = bbcBulanDariTeks_(v);
    });
  }
  if (!jenis) return null;
  var namaJenis = jenis.charAt(0) + jenis.slice(1).toLowerCase();
  var aT = bbcFind_(values, 'TGL', { r1: 10 });
  if (!periode || !aT) return { rows: [], warnings: [{ level: 'error', pesan: namaJenis + ' tab "' + tabName + '": bulan atau kolom TGL tidak ditemukan.' }] };

  // Judul kolom ada di dua baris (aT.r dan +2 untuk STOCK AWAL / BOILER / WADUK).
  var col = {};
  [aT.r, aT.r + 1, aT.r + 2].forEach(function (rr) {
    var row = values[rr] || [];
    for (c = 0; c < row.length; c++) {
      var h = bbcNorm_(row[c]);
      if (!h) continue;
      if (h.indexOf('TBS OLAH') === 0) col.tbs = c;
      else if (h.indexOf('PRODUKSI') === 0) col.produksi = c;
      else if (h === 'DIBAKAR') col.dibakar = c;
      else if (h.indexOf('PENGIRIMAN') === 0 && col.dijual === undefined) col.dijual = c;
      else if (h === 'DIJUAL') col.dijual = c;            // Abu Janjang: PENGIRIMAN dipecah DIJUAL / INTI
      else if (h === 'KBN INTI' || h === 'INTI') col.inti = c;
      else if (h === 'AMO 1' || h === 'AMO I') col.amo = c;  // Solid: AMO-1 dihitung ke kebun inti
      else if (h === 'PLS TU' || h === 'PLSMA' || h === 'PLASMA') col.plstu = c;
      else if (h.indexOf('STOCK') === 0 && h !== 'STOCK AWAL') col.stok = c;
      else if (h === 'CENERATOR' || h === 'GENERATOR') col.generator = c;
      else if (h === 'BOILER') col.boiler = c;
      else if (h === 'WADUK') col.waduk = c;
      else if (h === 'STOCK AWAL') col.stokAwalRow = rr;
    }
  });
  var label = namaJenis + ' ' + tabName;
  var stokAwal = (col.stokAwalRow !== undefined && col.stok !== undefined) ? bbcNum_(bbcCell_(values, col.stokAwalRow, col.stok)) : null;
  if (col.stokAwalRow !== undefined && col.stok !== undefined && bbcIsErr_(bbcCell_(values, col.stokAwalRow, col.stok))) {
    W.push({ level: 'warn', kode: namaJenis + ': STOCK AWAL berisi ' + String(bbcCell_(values, col.stokAwalRow, col.stok)).trim(), tab: tabName,
      pesan: label + ': STOCK AWAL berisi ' + bbcCell_(values, col.stokAwalRow, col.stok) + ' (rumus ke file lain putus). Ketik angka stok awal secara langsung.' });
  }
  var lastHeaderCol = Math.max(col.waduk || 0, col.boiler || 0, col.generator || 0, col.stok || 0);

  // Kolom tanpa judul tepat setelah WADUK: di Okt dipakai untuk WADUK, di bulan lain berisi rumus/angka lain.
  var cLiar = jenis === 'TANKOS' && col.waduk !== undefined ? lastHeaderCol + 1 : -1;
  var sumWaduk = 0, sumLiar = 0, rr2;
  for (rr2 = aT.r + 3; rr2 < values.length; rr2++) {
    var tg = bbcNum_(bbcCell_(values, rr2, aT.c));
    if (!tg || tg < 1 || tg > 31) continue;
    sumWaduk += bbcNum_(bbcCell_(values, rr2, col.waduk)) || 0;
    if (cLiar >= 0) sumLiar += bbcNum_(bbcCell_(values, rr2, cLiar)) || 0;
  }
  var pakaiLiar = cLiar >= 0 && sumWaduk === 0 && sumLiar > 0;
  if (pakaiLiar) {
    W.push({ level: 'warn', pesan: label + ': kolom WADUK kosong, tetapi ada angka di kolom tanpa judul di sebelahnya (total ' +
      sumLiar + ' kg). Sementara dibaca sebagai WADUK — sebaiknya dipindah ke kolom WADUK.' });
  } else if (cLiar >= 0 && sumLiar !== 0) {
    W.push({ level: 'warn', pesan: label + ': ada angka di kolom tanpa judul setelah WADUK (total ' + sumLiar + ' kg). Diabaikan.' });
  }

  var rows = [];
  for (r = aT.r + 1; r < values.length; r++) {
    var row = values[r] || [];
    var tgl = bbcNum_(row[aT.c]);
    if (bbcNorm_(row[aT.c]) === 'JLH' || bbcNorm_(row[aT.c]) === 'JUMLAH') break;
    if (!tgl || tgl < 1 || tgl > 31) continue;
    function n(k) { return col[k] !== undefined ? bbcNum_(row[col[k]]) : null; }
    var rec = {
      tanggal: periode.tahun + '-' + bbcPad_(periode.bulan) + '-' + bbcPad_(tgl), jenis: jenis,
      tbs_olah: n('tbs'), produksi: n('produksi'), dibakar: n('dibakar'), dijual: n('dijual'),
      kbn_inti: n('inti'), pls_tu: n('plstu'), generator: n('generator'), boiler: n('boiler'), waduk: n('waduk'), stok: n('stok')
    };
    if (n('amo')) rec.kbn_inti = (rec.kbn_inti || 0) + n('amo');
    if (pakaiLiar) rec.waduk = bbcNum_(row[cLiar]);
    rec.pls_tu_bruto = rec.pls_tu;
    // Khusus Tankos: PLS/TU sudah termasuk WADUK (REKAP memakai PLS/TU − WADUK). Simpan versi bersih.
    if (jenis === 'TANKOS' && col.waduk !== undefined) rec.pls_tu = (rec.pls_tu || 0) - (rec.waduk || 0);
    // Tanggal tidak valid (mis. 31 September) diabaikan.
    var dt = new Date(periode.tahun, periode.bulan - 1, tgl);
    if (dt.getMonth() !== periode.bulan - 1) {
      if (rec.produksi || rec.dijual) W.push({ level: 'warn', pesan: label + ': tanggal ' + tgl + ' tidak ada di bulan ini tetapi berisi angka.' });
      continue;
    }
    var ada = rec.tbs_olah || rec.produksi || rec.dijual || rec.kbn_inti || rec.pls_tu || rec.waduk || rec.boiler;
    if (!ada) continue;
    rec.stok_awal_bulan = stokAwal;
    rows.push(rec);
  }
  return { rows: rows, warnings: W };
}

// Ekspor untuk pengujian di Node (diabaikan di Apps Script).
if (typeof module !== 'undefined') {
  module.exports = {
    bbcDetectType: bbcDetectType, bbcParseProduksiWorkbook: bbcParseProduksiWorkbook,
    bbcParsePengirimanWorkbook: bbcParsePengirimanWorkbook, bbcParseTankosWorkbook: bbcParseTankosWorkbook,
    bbcNum_: bbcNum_, bbcDate_: bbcDate_
  };
}
