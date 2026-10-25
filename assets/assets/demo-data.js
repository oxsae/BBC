// Data CONTOH untuk mode demo (dibuat acak, bukan data pabrik).
// Dipakai hanya jika API_URL di config.js kosong.
(function () {
  var BULAN = ['2026-07', '2026-08', '2026-09', '2026-10'];
  var HARI_TERAKHIR = { '2026-10': 23 };

  function rng(seed) {
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hariDalam(b) { var y = +b.slice(0, 4), m = +b.slice(5, 7); return new Date(y, m, 0).getDate(); }
  var KET = ['Preventive maintenance blower IDF', 'Preventive maintenance rail track', 'Pembersihan rebusan', 'Air baku surut',
    'Perbaikan conveyor fibre shell', 'Preventive maintenance scrapper', 'Ganti rantai conveyor'];
  var SUMBER = [['Inti SBT (TM)', 'Inti', .27, .236, .0352], ['Inti SBT (TBM)', 'Inti', .008, .162, .032],
    ['AMO I', 'AMO', .03, .21, .035], ['AMO II', 'AMO', .03, .21, .035], ['Plasma', 'Plasma', .36, .209, .046], ['Pihak III', 'Pihak III', .302, .191, .042]];
  var LOKASI = ['LOADING RAMP NO.I', 'LANTAI NO.I', 'LOADING RAMP NO.II', 'LANTAI NO.II', 'DILORIKAN', 'PENDORONG', 'REBUSAN', 'RANTAIAN'];
  var TUJUAN_CPO = [['0166/SPJ/PALM/R3/2026', 'ITMS SIAK'], ['0166/SPJ/PALM/R3/2026', 'PT. KPBN'], ['3097/HO-PALMCO/CPO-E/2026', 'PT. BUNGE']];

  function buat(b) {
    var r = rng(+b.replace('-', '') * 7);
    var n = HARI_TERAKHIR[b] || hariDalam(b);
    var out = { ok: true, bulan: b, produksi: [], terima: [], sumber: [], shift: [], sisa_real: [], pengiriman: [], byproduct: [] };
    var sisa = 900000 + Math.round(r() * 200000), stokTankos = 140000;
    for (var d = 1; d <= n; d++) {
      var tg = b + '-' + pad(d);
      var libur = r() < 0.04;
      var terima = Math.round((700000 + r() * 260000) / 10) * 10;
      var stag = libur ? 24 : [1, 2, 2, 3, 3, 4, 6, 7][Math.floor(r() * 8)];
      var jam = 24 - stag;
      var olah = libur ? 0 : Math.round(jam * (37000 + r() * 6000) / 10) * 10;
      olah = Math.min(olah, sisa + terima - 100000);
      var cpo = 0, pk = 0, rows = [];
      SUMBER.forEach(function (s) {
        var t = Math.round(olah * s[2] * (0.8 + r() * 0.4) / 10) * 10;
        rows.push({ tanggal: tg, sumber: s[0], kelompok: s[1], tbs: t, cpo: +(t * s[3] * (0.97 + r() * 0.06)).toFixed(1), pk: Math.round(t * s[4]) });
      });
      var sumT = rows.reduce(function (a, x) { return a + x.tbs; }, 0);
      rows[rows.length - 1].tbs += olah - sumT;
      rows.forEach(function (x) { cpo += x.cpo; pk += x.pk; out.sumber.push(x); });
      var tersedia = sisa + terima, akhir = tersedia - olah;
      var real = libur ? 0 : Math.round(olah * 1.09 / 2500) * 2500;
      var sisaReal = Math.round(akhir * (0.93 + r() * 0.06) / 100) * 100;
      out.produksi.push({
        tanggal: tg, tab: String(d), sisa_awal: sisa, diterima: terima, tersedia: tersedia, tbs_olah: olah, cpo: +cpo.toFixed(1), pk: pk,
        sisa_akhir: akhir, tbs_olah_real: real, lori: real / 2500, jam_olah: jam, jam_stagnasi: libur ? null : stag,
        stagnasi_ket: libur ? '' : '07.00-' + pad(7 + stag) + '.00 ' + KET[Math.floor(r() * KET.length)],
        sisa_real: sisaReal, selisih_tbs: sisaReal - akhir, alb_tangki: +(4.5 + r() * 0.5).toFixed(2)
      });
      [['AMO,I', .03], ['AMO,II', .03], ['INTI SBT', .28], ['KBN LDA', 0], ['PLSMA', .37], ['PIHAK III', .29]].forEach(function (s) {
        out.terima.push({ tanggal: tg, sumber: s[0], kg: Math.round(terima * s[1] / 10) * 10 });
      });
      if (real) { var s1 = Math.round(real * (0.4 + r() * 0.2) / 2500) * 2500;
        out.shift.push({ tanggal: tg, shift: 1, tbs: s1, lori: s1 / 2500 }, { tanggal: tg, shift: 2, tbs: real - s1, lori: (real - s1) / 2500 }); }
      var sisaLok = sisaReal;
      LOKASI.forEach(function (l, i) {
        var kg = i === LOKASI.length - 1 ? sisaLok : Math.round(sisaReal * (0.05 + r() * 0.15) / 500) * 500;
        kg = Math.max(0, Math.min(kg, sisaLok)); sisaLok -= kg;
        out.sisa_real.push({ tanggal: tg, lokasi: l, kg: kg });
      });
      sisa = akhir;

      // Pengiriman
      if (r() > 0.15) {
        var k = Math.floor(r() * 2) + 1;
        for (var i = 0; i < k; i++) {
          var tj = TUJUAN_CPO[Math.floor(r() * TUJUAN_CPO.length)];
          var ton = Math.round((80000 + r() * 150000) / 10) * 10, rspo = tj[1] === 'PT. BUNGE';
          out.pengiriman.push({ tanggal: tg, produk: 'CPO', no_do: '', kontrak: tj[0], tujuan: tj[1], rspo: rspo ? ton : 0, non_rspo: rspo ? 0 : ton,
            tonase: ton, alb: +(4.4 + r() * 0.4).toFixed(2), ka: 0.3, kk: 0.02, trip: null, sisa_do: null, keterangan: '' });
        }
      }
      if (r() > 0.2) {
        var tr = 1 + Math.floor(r() * 3), tonpk = tr * Math.round((26000 + r() * 6000) / 10) * 10;
        out.pengiriman.push({ tanggal: tg, produk: 'PK', no_do: '', kontrak: 'SPPBJ/PALM/HO/2026/0266', tujuan: 'PPIS TANDUN', rspo: 0, non_rspo: tonpk,
          tonase: tonpk, alb: null, ka: +(8 + r() * 2.5).toFixed(2), kk: +(11 + r() * 5).toFixed(2), trip: tr, sisa_do: null, keterangan: '' });
      }
      // Tankos
      var prod = Math.round(olah * (0.19 + r() * 0.06) / 10) * 10;
      var jual = r() > 0.3 ? Math.round(prod * (0.3 + r() * 0.3) / 10) * 10 : 0;
      var inti = Math.round(prod * (0.2 + r() * 0.2) / 10) * 10;
      var plstu = Math.round(prod * (0.1 + r() * 0.15) / 10) * 10;
      var waduk = r() > 0.6 ? Math.round(12000 * r()) : 0;
      stokTankos = Math.max(60000, stokTankos + prod - jual - inti - plstu - waduk);
      if (olah || jual) out.byproduct.push({ tanggal: tg, jenis: 'TANKOS', tbs_olah: olah, produksi: prod, dibakar: 0, dijual: jual, kbn_inti: inti,
        pls_tu: plstu, waduk: waduk, boiler: 0, generator: 0, stok: Math.round(stokTankos / 5000) * 5000 });
    }
    return out;
  }

  function data(b) {
    var res = buat(b);
    res.tahunan = { produksi: {}, byproduct: {}, pengiriman: {} };
    BULAN.forEach(function (m) {
      if (m.slice(0, 4) !== b.slice(0, 4)) return;
      var x = buat(m), p = {};
      x.produksi.forEach(function (h) {
        ['diterima', 'tbs_olah', 'cpo', 'pk', 'jam_olah', 'jam_stagnasi'].forEach(function (f) { p[f] = (p[f] || 0) + (h[f] || 0); });
        p.hari = (p.hari || 0) + 1;
      });
      res.tahunan.produksi[m] = p;
      var t = {};
      x.byproduct.forEach(function (h) { ['tbs_olah', 'produksi', 'dibakar', 'dijual', 'kbn_inti', 'pls_tu', 'waduk', 'boiler', 'generator'].forEach(function (f) { t[f] = (t[f] || 0) + (h[f] || 0); }); });
      res.tahunan.byproduct[m + '|TANKOS'] = t;
      x.pengiriman.forEach(function (h) { var k = m + '|' + h.produk; res.tahunan.pengiriman[k] = res.tahunan.pengiriman[k] || { tonase: 0 }; res.tahunan.pengiriman[k].tonase += h.tonase; });
    });
    return res;
  }

  window.BBC_DEMO = {
    meta: function () {
      return { ok: true, bulan: BULAN, sinkron_terakhir: '2026-10-24 07:45:00',
        setting: { nama_pks: 'PKS Sei Buatan', kapasitas: 45, target_rend_cpo: 21, target_rend_pk: 4.3 } };
    },
    data: data,
    validasi: function () {
      return { ok: true, sinkron_terakhir: '2026-10-24 07:45:00',
        file: [
          { nama: 'Laporan Harian Produksi Oktober 2026', jenis: 'PRODUKSI', diperbarui: '2026-10-24 07:30:12', disinkron: '2026-10-24 07:45:00', status: 'ok', baris: 23 },
          { nama: 'Monitoring Pengiriman CPO Oktober 2026', jenis: 'PENGIRIMAN CPO', diperbarui: '2026-10-23 16:02:40', disinkron: '2026-10-24 07:45:00', status: 'ok', baris: 26 },
          { nama: 'Monitoring PK Oktober 2026', jenis: 'PENGIRIMAN PK', diperbarui: '2026-10-23 15:11:05', disinkron: '2026-10-24 07:45:00', status: 'ok', baris: 19 },
          { nama: 'Tankos 2026', jenis: 'TANKOS_HARIAN', diperbarui: '2026-10-24 06:58:31', disinkron: '2026-10-24 07:45:00', status: 'ok', baris: 266 }
        ],
        peringatan: [
          { file: 'Laporan Harian Produksi Oktober 2026', level: 'warn', pesan: '2026-10-18 (tab 18): TBS olah 0 tetapi jam olah/stagnasi terisi (contoh peringatan).' },
          { file: 'Tankos 2026', level: 'warn', pesan: 'Tankos OKTOBER: kolom WADUK kosong, tetapi ada angka di kolom tanpa judul di sebelahnya (contoh peringatan).' }
        ] };
    }
  };
})();
