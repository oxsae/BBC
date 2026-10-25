/* BBC — Buatan Business Cockpit (frontend) */
(function () {
  'use strict';

  var CFG = window.BBC_CONFIG || {};
  var DEMO = !CFG.API_URL;
  var S = { token: null, user: null, meta: null, bulan: null, hari: null, data: {}, page: 'ringkasan', produk: 'SEMUA', bp: 'TANKOS', charts: [] };
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  /* ------------------------------------------------------------ util */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { return typeof v === 'number' && isFinite(v) ? v : (v === null || v === undefined || v === '' ? null : (isFinite(+v) ? +v : null)); }
  function fmt(v, d) { v = n(v); if (v === null) return '–'; return v.toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function kg(v) { return n(v) === null ? '–' : fmt(Math.round(v)); }
  function ton(v, d) { return n(v) === null ? '–' : fmt(v / 1000, d === undefined ? 1 : d); }
  function pct(v, d) { return n(v) === null ? '–' : fmt(v, d === undefined ? 2 : d) + '%'; }
  function rend(a, b) { return n(b) ? n(a) / n(b) * 100 : null; }
  function sum(rows, f) { return rows.reduce(function (s, r) { return s + (n(typeof f === 'function' ? f(r) : r[f]) || 0); }, 0); }
  function wavg(rows, f, w) { var tw = 0, t = 0; rows.forEach(function (r) { if (n(r[f]) !== null && n(r[w])) { t += r[f] * r[w]; tw += r[w]; } }); return tw ? t / tw : null; }
  function parseTgl(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function tglPanjang(s) { var d = parseTgl(s); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear(); }
  function tglPendek(s) { var d = parseTgl(s); return d.getDate() + ' ' + BLN[d.getMonth()].slice(0, 3); }
  function namaBulan(b) { return BLN[+b.slice(5, 7) - 1] + ' ' + b.slice(0, 4); }
  function waktu(s) { if (!s) return 'belum pernah'; var d = parseTgl(s.slice(0, 10)); return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear() + ' pukul ' + s.slice(11, 16).replace(':', '.'); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  /* ------------------------------------------------------------- API */
  function api(action, params) {
    var body = Object.assign({ action: action, token: S.token }, params || {});
    if (DEMO) {
      return new Promise(function (ok) {
        setTimeout(function () {
          if (action === 'login') ok({ ok: true, token: 'demo', user: { u: body.username || 'demo', nama: body.username || 'Pengguna demo', role: 'admin' } });
          else if (action === 'meta') ok(window.BBC_DEMO.meta());
          else if (action === 'data') ok(window.BBC_DEMO.data(body.bulan));
          else if (action === 'validasi') ok(window.BBC_DEMO.validasi());
          else if (action === 'sync') ok({ ok: true, hasil: { file_dibaca: 0, file_tidak_berubah: 4 } });
          else ok({ ok: true });
        }, 150);
      });
    }
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Server membalas ' + r.status); return r.json(); })
      .then(function (res) {
        if (!res.ok && res.kode === 'AUTH' && action !== 'login') { keluar('Sesi berakhir. Silakan masuk lagi.'); throw new Error('AUTH'); }
        return res;
      });
  }

  /* ----------------------------------------------------------- login */
  function tampilLogin(pesan) {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#demo-hint').hidden = !DEMO;
    var e = $('#login-error'); e.hidden = !pesan; e.textContent = pesan || '';
    setTimeout(function () { $('#lg-user').focus(); }, 0);
  }
  $('#login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var u = $('#lg-user').value.trim(), p = $('#lg-pass').value;
    var e = $('#login-error');
    if (!u || !p) { e.hidden = false; e.textContent = 'Isi username dan password.'; return; }
    var btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'Memeriksa…';
    api('login', { username: u, password: p }).then(function (res) {
      if (!res.ok) { e.hidden = false; e.textContent = res.error; return; }
      S.token = res.token; S.user = res.user;
      store('bbc_token', res.token); store('bbc_user', JSON.stringify(res.user));
      $('#lg-pass').value = '';
      mulai();
    }).catch(function (err) {
      e.hidden = false; e.textContent = 'Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi. (' + err.message + ')';
    }).finally(function () { btn.disabled = false; btn.textContent = 'Masuk'; });
  });
  function keluar(pesan) {
    if (S.token && !DEMO && !pesan) api('logout').catch(function () {});
    S.token = null; S.user = null; S.data = {}; store('bbc_token', null); store('bbc_user', null);
    tampilLogin(pesan);
  }
  $('#btn-logout').addEventListener('click', function () { keluar(); });

  /* ------------------------------------------------------------ boot */
  function mulai() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#demo-banner').hidden = !DEMO;
    $('#user-name').textContent = S.user ? S.user.nama : '';
    status('Memuat data…');
    api('meta').then(function (m) {
      if (!m.ok) throw new Error(m.error);
      S.meta = m;
      $('#nama-pks').textContent = m.setting.nama_pks || 'PKS Sei Buatan';
      var sel = $('#sel-bulan');
      sel.innerHTML = m.bulan.slice().reverse().map(function (b) { return '<option value="' + b + '">' + namaBulan(b) + '</option>'; }).join('');
      if (!m.bulan.length) { status('Belum ada data. Admin perlu mengisi FOLDER_ID lalu menjalankan sinkronisasi di spreadsheet backend.'); return; }
      var tersimpan = store('bbc_bulan') && m.bulan.indexOf(store('bbc_bulan')) >= 0;
      S.bulan = tersimpan ? store('bbc_bulan') : m.bulan[m.bulan.length - 1];
      sel.value = S.bulan;
      $('#foot').textContent = 'Data diambil dari Google Sheets, terakhir disinkronkan ' + waktu(m.sinkron_terakhir) + '.';
      return muatBulan(S.bulan, !tersimpan);
    }).catch(function (err) { if (err.message !== 'AUTH') status('Gagal memuat data: ' + err.message); });
  }

  /** cariMundur: saat pertama dibuka, lompat ke bulan terakhir yang sudah punya data produksi. */
  function muatBulan(b, cariMundur) {
    S.bulan = b; store('bbc_bulan', b);
    var lanjut = function () {
      var d = S.data[b];
      var iB = S.meta.bulan.indexOf(b);
      if (cariMundur && !d.produksi.length && iB > 0) {
        $('#sel-bulan').value = S.meta.bulan[iB - 1];
        muatBulan(S.meta.bulan[iB - 1], true);
        return;
      }
      var hariAda = {};
      d.produksi.forEach(function (r) { hariAda[r.tanggal] = 1; });
      d.pengiriman.forEach(function (r) { hariAda[r.tanggal] = 1; });
      var list = Object.keys(hariAda).sort();
      var sel = $('#sel-hari');
      sel.innerHTML = list.slice().reverse().map(function (t) { return '<option value="' + t + '">' + tglPendek(t) + '</option>'; }).join('');
      var denganOlah = d.produksi.filter(function (r) { return n(r.tbs_olah); });
      S.hari = denganOlah.length ? denganOlah[denganOlah.length - 1].tanggal : list[list.length - 1];
      if (S.hari) sel.value = S.hari;
      render();
    };
    if (S.data[b]) { lanjut(); return Promise.resolve(); }
    status('Memuat ' + namaBulan(b) + '…');
    return api('data', { bulan: b }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      S.data[b] = d; lanjut();
    }).catch(function (err) { if (err.message !== 'AUTH') status('Gagal memuat data: ' + err.message); });
  }

  $('#sel-bulan').addEventListener('change', function (e) { muatBulan(e.target.value); });
  $('#sel-hari').addEventListener('change', function (e) { S.hari = e.target.value; render(); });
  window.addEventListener('hashchange', function () { render(); });

  function status(msg) { var s = $('#state'); s.hidden = !msg; s.textContent = msg || ''; if (msg) $('#page').innerHTML = ''; }

  /* --------------------------------------------------------- render */
  function render() {
    var page = (location.hash || '#ringkasan').slice(1);
    if (['ringkasan', 'produksi', 'byproduct', 'pengiriman', 'validasi'].indexOf(page) < 0) page = 'ringkasan';
    S.page = page;
    document.querySelectorAll('.nav a').forEach(function (a) { if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    S.charts.forEach(function (c) { c.destroy(); }); S.charts = [];
    if (page === 'validasi') { status(''); halValidasi(); return; }
    var d = S.data[S.bulan];
    if (!d) return;
    status('');
    ({ ringkasan: halRingkasan, produksi: halProduksi, byproduct: halByproduct, pengiriman: halPengiriman })[page](d);
  }

  /** Data bulan berjalan sampai tanggal terpilih (s.d. hari ini). */
  function sd(rows) { return rows.filter(function (r) { return r.tanggal <= S.hari; }); }
  function hi(rows) { return rows.filter(function (r) { return r.tanggal === S.hari; }); }

  function kpi(lbl, val, unit, sub) {
    return '<div class="kpi"><div class="lbl">' + lbl + '</div><div class="val">' + val + (unit ? ' <small>' + unit + '</small>' : '') +
      '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }
  function delta(v, target, d) {
    if (n(v) === null || !n(target)) return '';
    var x = v - target, cls = x >= 0 ? 'delta-good' : 'delta-bad';
    return ' <span class="' + cls + '">' + (x >= 0 ? '+' : '−') + fmt(Math.abs(x), d || 2) + ' dari target</span>';
  }

  /* ------------------------------------------------------ RINGKASAN */
  function halRingkasan(d) {
    var set = S.meta.setting;
    var h = hi(d.produksi)[0] || {};
    var P = sd(d.produksi);
    var kirim = sd(d.pengiriman), kirimHi = hi(d.pengiriman);
    var tk = sd(d.byproduct.filter(function (r) { return r.jenis === 'TANKOS'; })), tkHi = hi(tk)[0] || {};
    var olahSd = sum(P, 'tbs_olah'), cpoSd = sum(P, 'cpo'), pkSd = sum(P, 'pk');
    var jamSd = sum(P, 'jam_olah'), stagSd = sum(P, 'jam_stagnasi');
    var kap = n(h.jam_olah) ? h.tbs_olah / h.jam_olah / 1000 : null;
    var kapSd = jamSd ? olahSd / jamSd / 1000 : null;
    var rcpo = rend(h.cpo, h.tbs_olah), rpk = rend(h.pk, h.tbs_olah);
    function kirimProduk(rows, p) { return sum(rows.filter(function (r) { return r.produk === p; }), 'tonase'); }
    var adaJam = d.produksi.some(function (r) { return n(r.jam_olah); });   // format Real Produksi tidak memuat jam olah

    var html = '<div class="page-head"><h1>' + (S.hari ? tglPanjang(S.hari) : namaBulan(S.bulan)) + '</h1>' +
      '<span class="muted">Hari ini dibanding akumulasi 1–' + (S.hari ? +S.hari.slice(8) : '') + ' ' + BLN[+S.bulan.slice(5) - 1] + '</span></div>';

    // Neraca TBS
    if (h.tanggal) {
      var tersedia = n(h.tersedia) || 0, olahW = tersedia ? Math.max(4, h.tbs_olah / tersedia * 100) : 0;
      var adaSisa = n(h.tersedia) !== null && n(h.sisa_akhir) !== null;
      html += '<section class="flow" aria-label="Neraca TBS hari ini">' +
        '<div class="flow-top">' +
        (adaSisa ? fi('Sisa awal', h.sisa_awal) + '<div class="flow-op">+</div>' + fi('TBS diterima', h.diterima) + '<div class="flow-op">=</div>' + fi('TBS tersedia', h.tersedia)
          : fi('TBS diterima', h.diterima) + '<div class="flow-op hide-sm"></div>' + fi('TBS diolah', h.tbs_olah)) +
        '</div>' +
        (adaSisa ? '<div class="flow-bar" role="img" aria-label="TBS tersedia ' + ton(h.tersedia) + ' ton: diolah ' + ton(h.tbs_olah) + ' ton, sisa ' + ton(h.sisa_akhir) + ' ton">' +
        '<span class="olah" style="flex:0 0 ' + olahW + '%" data-tip="Diolah ' + kg(h.tbs_olah) + ' kg">Diolah ' + ton(h.tbs_olah) + ' t</span>' +
        '<span class="sisa" style="flex:1 1 0" data-tip="Sisa akhir (restan) ' + kg(h.sisa_akhir) + ' kg">Sisa akhir ' + ton(h.sisa_akhir) + ' t</span></div>'
          : '<p class="muted" style="font-size:.85rem;margin-top:10px">Sisa TBS belum terbaca: baris "Awal" di sheet Real Produksi masih berisi #REF!. Lihat halaman Validasi.</p>') +
        (n(h.sisa_real) !== null ? '<div class="muted" style="font-size:.85rem">Sisa TBS hitung fisik ' + kg(h.sisa_real) + ' kg, selisih terhadap buku ' + kg(h.selisih_tbs) + ' kg.</div>' : '') +
        '<div class="flow-out">' +
        outChip('var(--s-cpo)', 'CPO', kg(h.cpo) + ' kg', 'rendemen ' + pct(rcpo)) +
        outChip('var(--s-pk)', 'PK', kg(h.pk) + ' kg', 'rendemen ' + pct(rpk)) +
        (tkHi.produksi ? outChip('var(--s-4)', 'Tankos', kg(tkHi.produksi) + ' kg', pct(rend(tkHi.produksi, tkHi.tbs_olah || h.tbs_olah), 1) + ' dari TBS') : '') +
        '</div></section>';
    }

    html += '<div class="section"><div class="kpis">' +
      kpi('TBS diterima', kg(h.diterima), 'kg', 's.d. hari ini <b>' + kg(sum(P, 'diterima')) + ' kg</b>') +
      kpi('TBS diolah', kg(h.tbs_olah), 'kg', 's.d. hari ini <b>' + kg(olahSd) + ' kg</b>') +
      kpi('Produksi CPO', kg(h.cpo), 'kg', 's.d. hari ini <b>' + kg(cpoSd) + ' kg</b>') +
      kpi('Produksi PK', kg(h.pk), 'kg', 's.d. hari ini <b>' + kg(pkSd) + ' kg</b>') +
      kpi('Rendemen CPO', pct(rcpo), '', 's.d. hari ini <b>' + pct(rend(cpoSd, olahSd)) + '</b>' + delta(rcpo, set.target_rend_cpo)) +
      kpi('Rendemen PK', pct(rpk), '', 's.d. hari ini <b>' + pct(rend(pkSd, olahSd)) + '</b>' + delta(rpk, set.target_rend_pk)) +
      (adaJam
        ? kpi('Kapasitas olah', fmt(kap, 1), 'ton/jam', set.kapasitas ? 'utilitas <b>' + pct(kap / set.kapasitas * 100, 0) + '</b> dari ' + fmt(set.kapasitas) + ' ton/jam' : 's.d. hari ini <b>' + fmt(kapSd, 1) + ' ton/jam</b>') +
          kpi('Stagnasi', fmt(h.jam_stagnasi), 'jam', 'jam olah <b>' + fmt(h.jam_olah) + '</b>, s.d. hari ini <b>' + fmt(stagSd) + ' jam</b>')
        : kpi('Sisa TBS akhir', kg(h.sisa_akhir), 'kg', n(h.sisa_akhir) === null ? 'menunggu angka sisa awal' : 'restan di pabrik') +
          kpi('Stok kernel', kg(h.pk_buku), 'kg', n(h.pk_buku) === null ? 'menunggu angka stok awal' : '')) +
      kpi('CPO dikirim', kg(kirimProduk(kirimHi, 'CPO')), 'kg', 's.d. hari ini <b>' + kg(kirimProduk(kirim, 'CPO')) + ' kg</b>') +
      kpi('PK dikirim', kg(kirimProduk(kirimHi, 'PK')), 'kg', 's.d. hari ini <b>' + kg(kirimProduk(kirim, 'PK')) + ' kg</b>') +
      kpi('Tankos diproduksi', kg(tkHi.produksi), 'kg', 's.d. hari ini <b>' + kg(sum(tk, 'produksi')) + ' kg</b>') +
      kpi('ALB CPO', pct(h.alb_tangki), '', n(h.cpo_buku) !== null ? 'stok CPO <b>' + kg(h.cpo_buku) + ' kg</b>' : '') +
      '</div></div>';

    html += '<div class="section grid-2">' +
      panel('c-olah', 'TBS diolah per hari', 'Kilogram. Tanggal terpilih ditandai warna penuh.') +
      panel('c-rend', 'Rendemen CPO per hari', 'Persen terhadap TBS diolah' + (set.target_rend_cpo ? ', garis putus-putus = target.' : '.'),
        legend([['var(--s-cpo)', 'Rendemen CPO'], set.target_rend_cpo ? ['var(--ink-2)', 'Target', 'dash'] : null])) +
      '</div>';

    // Stagnasi 7 hari terakhir
    var st = P.filter(function (r) { return n(r.jam_stagnasi); }).slice(-7).reverse();
    if (adaJam) html += '<div class="section"><h2>Stagnasi terakhir</h2>' + (st.length ?
      '<div class="table-wrap"><table class="data"><thead><tr><th class="l">Tanggal</th><th>Jam olah</th><th>Stagnasi</th><th class="l">Keterangan</th></tr></thead><tbody>' +
      st.map(function (r) { return '<tr' + (r.tanggal === S.hari ? ' class="sel"' : '') + '><td class="l">' + tglPendek(r.tanggal) + '</td><td>' + fmt(r.jam_olah) + '</td><td>' + fmt(r.jam_stagnasi) + ' jam</td><td class="l wrap">' + esc(r.stagnasi_ket) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="empty">Tidak ada stagnasi tercatat bulan ini.</p>') + '</div>';

    $('#page').innerHTML = html;
    bindTips();

    var all = d.produksi;
    barChart('c-olah', all.map(function (r) { return tglPendek(r.tanggal); }), [{
      label: 'TBS diolah (kg)', data: all.map(function (r) { return r.tbs_olah; }),
      backgroundColor: all.map(function (r) { return r.tanggal === S.hari ? cssVar('--s-tbs') : alpha(cssVar('--s-tbs'), .45); })
    }]);
    var ds = [{ label: 'Rendemen CPO (%)', data: all.map(function (r) { return n(r.tbs_olah) ? rend(r.cpo, r.tbs_olah) : null; }), borderColor: cssVar('--s-cpo') }];
    if (set.target_rend_cpo) ds.push(targetDs(set.target_rend_cpo, all.length));
    lineChart('c-rend', all.map(function (r) { return tglPendek(r.tanggal); }), ds, { pct: true });
  }
  function fi(lbl, v) { return '<div class="flow-item"><div class="lbl">' + lbl + '</div><div class="val">' + kg(v) + '<small>kg</small></div></div>'; }
  function outChip(color, name, val, sub) { return '<div class="out"><i style="background:' + color + '"></i><span>' + name + '</span><b>' + val + '</b><span class="muted">' + sub + '</span></div>'; }

  /* ------------------------------------------------------- PRODUKSI */
  var URUT_SUMBER = ['INTI SBT (TM)', 'INTI SBT (TBM)', 'INTI SBT', 'INTI LDA', 'KBN LDA', 'AMO I', 'AMO,I', 'AMO II', 'AMO,II', 'PLASMA', 'PLSMA', 'PIHAK III'];
  /** Nama sumber unik, diurutkan Inti → AMO → Plasma → Pihak III (bukan urutan kemunculan). */
  function urutSumber(rows) {
    var u = [];
    rows.forEach(function (r) { if (u.indexOf(r.sumber) < 0) u.push(r.sumber); });
    function pos(x) { var i = URUT_SUMBER.indexOf(String(x).toUpperCase()); return i < 0 ? 99 : i; }
    return u.sort(function (a, b) { return pos(a) - pos(b); });
  }
  function halProduksi(d) {
    var set = S.meta.setting;
    var P = sd(d.produksi), all = d.produksi;
    var sHi = hi(d.sumber), sSd = sd(d.sumber);
    var urut = urutSumber(d.sumber);
    function baris(nama) {
      var a = sHi.filter(function (r) { return r.sumber === nama; }), b = sSd.filter(function (r) { return r.sumber === nama; });
      return { nama: nama, t: sum(a, 'tbs'), c: sum(a, 'cpo'), p: sum(a, 'pk'), T: sum(b, 'tbs'), C: sum(b, 'cpo'), Pk: sum(b, 'pk') };
    }
    var rows = urut.map(baris);
    var tot = rows.reduce(function (s, r) { ['t', 'c', 'p', 'T', 'C', 'Pk'].forEach(function (k) { s[k] += r[k]; }); return s; }, { nama: 'Jumlah', t: 0, c: 0, p: 0, T: 0, C: 0, Pk: 0 });
    function tr(r, cls) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="l">' + esc(r.nama) + '</td><td>' + kg(r.t) + '</td><td>' + kg(r.c) + '</td><td>' + pct(rend(r.c, r.t)) + '</td><td>' + kg(r.p) + '</td><td>' + pct(rend(r.p, r.t)) +
        '</td><td>' + kg(r.T) + '</td><td>' + kg(r.C) + '</td><td>' + pct(rend(r.C, r.T)) + '</td><td>' + kg(r.Pk) + '</td><td>' + pct(rend(r.Pk, r.T)) + '</td></tr>';
    }

    var adaJam = all.some(function (r) { return n(r.jam_olah); });
    var adaSisa = all.some(function (r) { return n(r.sisa_akhir) !== null; });
    var html = '<div class="page-head"><h1>Produksi</h1><span class="muted">' + tglPanjang(S.hari) + ', akumulasi dari tanggal 1</span></div>';
    html += '<div class="section" style="margin-top:0"><h2>TBS diolah per sumber</h2>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th class="l" rowspan="2">Sumber</th><th colspan="5" class="l">Hari ini</th><th colspan="5" class="l">s.d. hari ini</th></tr>' +
      '<tr><th>TBS (kg)</th><th>CPO (kg)</th><th>Rend.</th><th>PK (kg)</th><th>Rend.</th><th>TBS (kg)</th><th>CPO (kg)</th><th>Rend.</th><th>PK (kg)</th><th>Rend.</th></tr></thead><tbody>' +
      rows.map(function (r) { return tr(r); }).join('') + tr(tot, 'total') + '</tbody></table></div></div>';

    html += '<div class="section grid-2">' +
      panel('c-masuk', 'TBS diterima dan diolah', 'Kilogram per hari.', legend([['#86b6ef', 'Diterima', 'box'], ['var(--s-tbs)', 'Diolah', 'box']])) +
      (adaJam ? panel('c-jam', 'Jam olah dan stagnasi', 'Jam per hari (total 24 jam).', legend([['var(--s-tbs)', 'Jam olah', 'box'], ['var(--line-strong)', 'Stagnasi', 'box']]))
        : (adaSisa ? panel('c-sisa', 'Sisa TBS akhir hari', 'Kilogram (restan di pabrik).')
          : '<div class="panel"><h3>Sisa TBS akhir hari</h3><p class="hint">Kilogram (restan di pabrik).</p><p class="empty" style="margin-top:12px">Belum bisa ditampilkan: baris "Awal" kolom TBS SISA di sheet Real Produksi masih berisi #REF!. Ketik angka sisa TBS awal bulan di sel itu, lalu sinkron ulang.</p></div>')) +
      panel('c-rcpo', 'Rendemen CPO', 'Persen per hari' + (set.target_rend_cpo ? ', garis putus-putus = target.' : '.')) +
      panel('c-rpk', 'Rendemen PK', 'Persen per hari' + (set.target_rend_pk ? ', garis putus-putus = target.' : '.')) +
      '</div>';
    if (adaJam) html += '<div class="section">' + panel('c-kap', 'Kapasitas olah', 'Ton TBS per jam olah' + (set.kapasitas ? '; garis putus-putus = kapasitas terpasang ' + fmt(set.kapasitas) + ' ton/jam.' : '. Isi KAPASITAS_TERPASANG_TON_JAM di sheet Setting untuk melihat utilitas.')) + '</div>';

    // TBS diterima per sumber
    var tHi = hi(d.terima), tSd = sd(d.terima), tUrut = urutSumber(d.terima);
    var trm = tUrut.map(function (s) { return { s: s, a: sum(tHi.filter(function (r) { return r.sumber === s; }), 'kg'), b: sum(tSd.filter(function (r) { return r.sumber === s; }), 'kg') }; })
      .filter(function (r) { return r.b; });
    // Shift
    var shHi = hi(d.shift), shSd = sd(d.shift), shNo = [];
    d.shift.forEach(function (r) { if (shNo.indexOf(r.shift) < 0) shNo.push(r.shift); });
    shNo.sort();
    var adaShift = d.shift.length > 0;
    html += '<div class="section ' + (adaShift ? 'grid-2' : '') + '"><div><h2>TBS diterima per sumber</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Sumber</th><th>Hari ini (kg)</th><th>s.d. hari ini (kg)</th></tr></thead><tbody>' +
      trm.map(function (r) { return '<tr><td class="l">' + esc(r.s) + '</td><td>' + kg(r.a) + '</td><td>' + kg(r.b) + '</td></tr>'; }).join('') +
      '<tr class="total"><td class="l">Jumlah</td><td>' + kg(sum(trm, 'a')) + '</td><td>' + kg(sum(trm, 'b')) + '</td></tr></tbody></table></div></div>' +
      (!adaShift ? '</div>' : '<div><h2>TBS diolah real per shift</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Shift</th><th>Hari ini (kg)</th><th>Lori</th><th>s.d. hari ini (kg)</th><th>Lori</th></tr></thead><tbody>' +
      shNo.map(function (no) {
        var a = shHi.filter(function (r) { return r.shift === no; }), b = shSd.filter(function (r) { return r.shift === no; });
        return '<tr><td class="l">Shift ' + no + '</td><td>' + kg(sum(a, 'tbs')) + '</td><td>' + fmt(sum(a, 'lori')) + '</td><td>' + kg(sum(b, 'tbs')) + '</td><td>' + fmt(sum(b, 'lori')) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td class="l">Jumlah</td><td>' + kg(sum(shHi, 'tbs')) + '</td><td>' + fmt(sum(shHi, 'lori')) + '</td><td>' + kg(sum(shSd, 'tbs')) + '</td><td>' + fmt(sum(shSd, 'lori')) + '</td></tr></tbody></table></div>' +
      '<p class="section-note" style="margin-top:8px">Hitungan real (lori × berat rata-rata) bisa berbeda dengan TBS diolah buku.</p></div></div>');

    // Sisa TBS real per lokasi
    var lok = hi(d.sisa_real);
    var h = hi(d.produksi)[0] || {};
    if (d.sisa_real.length) html += '<div class="section"><h2>Sisa TBS: buku dan hitung fisik</h2><div class="grid-2"><div class="table-wrap"><table class="data"><thead><tr><th class="l">Lokasi (hari ini)</th><th>kg</th></tr></thead><tbody>' +
      lok.map(function (r) { return '<tr><td class="l">' + esc(r.lokasi) + '</td><td>' + kg(r.kg) + '</td></tr>'; }).join('') +
      '<tr class="total"><td class="l">Sisa real</td><td>' + kg(h.sisa_real) + '</td></tr><tr><td class="l">Sisa buku</td><td>' + kg(h.sisa_akhir) + '</td></tr><tr class="total"><td class="l">Selisih</td><td>' + kg(h.selisih_tbs) + '</td></tr></tbody></table></div>' +
      panel('c-selisih', 'Selisih sisa TBS per hari', 'Sisa real dikurangi sisa buku (kg). Di bawah nol berarti fisik lebih sedikit dari buku.') + '</div></div>';

    // Tabel harian lengkap
    html += '<div class="section"><h2>Rincian harian</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Tanggal</th><th>Diterima</th><th>Diolah</th><th>CPO</th><th>Rend. CPO</th><th>PK</th><th>Rend. PK</th>' + (adaJam ? '<th>Jam olah</th><th>Stagnasi</th><th>Ton/jam</th>' : '') + '<th>Sisa akhir</th><th>ALB</th></tr></thead><tbody>' +
      all.map(function (r) {
        return '<tr' + (r.tanggal === S.hari ? ' class="sel"' : '') + '><td class="l">' + tglPendek(r.tanggal) + '</td><td>' + kg(r.diterima) + '</td><td>' + kg(r.tbs_olah) + '</td><td>' + kg(r.cpo) + '</td><td>' + pct(rend(r.cpo, r.tbs_olah)) +
          '</td><td>' + kg(r.pk) + '</td><td>' + pct(rend(r.pk, r.tbs_olah)) +
          (adaJam ? '</td><td>' + fmt(r.jam_olah) + '</td><td>' + fmt(r.jam_stagnasi) + '</td><td>' + (n(r.jam_olah) ? fmt(r.tbs_olah / r.jam_olah / 1000, 1) : '–') : '') +
          '</td><td>' + kg(r.sisa_akhir) + '</td><td>' + fmt(r.alb_tangki, 2) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td class="l">Jumlah</td><td>' + kg(sum(all, 'diterima')) + '</td><td>' + kg(sum(all, 'tbs_olah')) + '</td><td>' + kg(sum(all, 'cpo')) + '</td><td>' + pct(rend(sum(all, 'cpo'), sum(all, 'tbs_olah'))) +
      '</td><td>' + kg(sum(all, 'pk')) + '</td><td>' + pct(rend(sum(all, 'pk'), sum(all, 'tbs_olah'))) +
      (adaJam ? '</td><td>' + fmt(sum(all, 'jam_olah')) + '</td><td>' + fmt(sum(all, 'jam_stagnasi')) + '</td><td>' +
        (sum(all, 'jam_olah') ? fmt(sum(all, 'tbs_olah') / sum(all, 'jam_olah') / 1000, 1) : '–') : '') + '</td><td></td><td></td></tr></tbody></table></div>' +
      '<p class="section-note" style="margin-top:8px">Rendemen bulanan dihitung dari total CPO ÷ total TBS diolah, bukan rata-rata rendemen harian.</p></div>';

    $('#page').innerHTML = html;

    var lab = all.map(function (r) { return tglPendek(r.tanggal); });
    barChart('c-masuk', lab, [
      { label: 'Diterima (kg)', data: all.map(function (r) { return r.diterima; }), backgroundColor: '#86b6ef' },
      { label: 'Diolah (kg)', data: all.map(function (r) { return r.tbs_olah; }), backgroundColor: cssVar('--s-tbs') }]);
    if (!adaJam && adaSisa) barChart('c-sisa', lab, [{ label: 'Sisa TBS (kg)', data: all.map(function (r) { return r.sisa_akhir; }), backgroundColor: alpha(cssVar('--s-tbs'), .6) }]);
    if (adaJam) barChart('c-jam', lab, [
      { label: 'Jam olah', data: all.map(function (r) { return r.jam_olah; }), backgroundColor: cssVar('--s-tbs') },
      { label: 'Stagnasi', data: all.map(function (r) { return r.jam_stagnasi; }), backgroundColor: cssVar('--line-strong') }], { stacked: true, max: 24 });
    var d1 = [{ label: 'Rendemen CPO (%)', data: all.map(function (r) { return n(r.tbs_olah) ? rend(r.cpo, r.tbs_olah) : null; }), borderColor: cssVar('--s-cpo') }];
    if (set.target_rend_cpo) d1.push(targetDs(set.target_rend_cpo, all.length));
    lineChart('c-rcpo', lab, d1, { pct: true });
    var d2 = [{ label: 'Rendemen PK (%)', data: all.map(function (r) { return n(r.tbs_olah) ? rend(r.pk, r.tbs_olah) : null; }), borderColor: cssVar('--s-pk') }];
    if (set.target_rend_pk) d2.push(targetDs(set.target_rend_pk, all.length));
    lineChart('c-rpk', lab, d2, { pct: true });
    var d3 = [{ label: 'Ton/jam', data: all.map(function (r) { return n(r.jam_olah) ? r.tbs_olah / r.jam_olah / 1000 : null; }), borderColor: cssVar('--s-tbs') }];
    if (set.kapasitas) d3.push(targetDs(set.kapasitas, all.length, 'Kapasitas terpasang'));
    if (adaJam) lineChart('c-kap', lab, d3, { dec: 1 });
    if (d.sisa_real.length) barChart('c-selisih', lab, [{ label: 'Selisih (kg)', data: all.map(function (r) { return r.selisih_tbs; }),
      backgroundColor: all.map(function (r) { return (r.selisih_tbs || 0) < 0 ? alpha(cssVar('--crit'), .75) : alpha(cssVar('--s-tbs'), .75); }) }]);
  }

  /* ----------------------------------------------------- BY PRODUCT */
  var BP = [['TANKOS', 'Tankos'], ['CANGKANG', 'Cangkang'], ['FIBER', 'Fiber'], ['SOLID', 'Solid'], ['ABU JANJANG', 'Abu janjang'], ['ABU BOILER', 'Abu boiler']];
  // Tujuan keluar by product. Hanya kolom yang ada isinya yang ditampilkan, karena tiap laporan berbeda.
  var BP_KELUAR = [['dijual', 'Dijual (dikirim)', '--s-tbs'], ['kbn_inti', 'Ke kebun inti', '--s-cpo'], ['pls_tu', 'Ke plasma / TU', '--s-pk'],
    ['waduk', 'Ke waduk', '#eda100'], ['dibakar', 'Dibakar (bahan bakar)', '--s-4']];
  function warna(w) { return w.charAt(0) === '#' ? w : cssVar(w); }
  function halByproduct(d) {
    var html = '<div class="page-head"><h1>By product</h1><span class="muted">' + tglPanjang(S.hari) + ', akumulasi dari tanggal 1</span></div>';
    html += '<div class="chips" role="group" aria-label="Jenis by product">' + BP.map(function (b) {
      return '<button class="chip" type="button" data-bp="' + b[0] + '" aria-pressed="' + (S.bp === b[0]) + '">' + b[1] + '</button>';
    }).join('') + '</div>';
    var nama = BP.filter(function (b) { return b[0] === S.bp; })[0][1];
    var rows = d.byproduct.filter(function (r) { return r.jenis === S.bp; });
    if (!rows.length) {
      html += '<div class="empty"><b>Belum ada data ' + nama.toLowerCase() + ' untuk ' + namaBulan(S.bulan) + '.</b><br>' +
        'Pastikan file laporan harian ' + nama.toLowerCase() + ' (format Google Spreadsheet) ada di folder data dan punya tab untuk bulan ini.</div>';
      $('#page').innerHTML = html; bindChips(); return;
    }
    var R = sd(rows), h = hi(rows)[0] || {};
    var olah = sum(R, 'tbs_olah'), prod = sum(R, 'produksi');
    var stokAkhir = R.length ? R[R.length - 1].stok : null;
    var keluar = BP_KELUAR.filter(function (k) { return rows.some(function (r) { return n(r[k[0]]); }); });
    html += '<div class="kpis">' +
      kpi('Produksi ' + nama.toLowerCase(), kg(prod), 'kg', 'hari ini <b>' + kg(h.produksi) + ' kg</b>') +
      kpi('Terhadap TBS diolah', pct(rend(prod, olah)), '', 'hari ini <b>' + pct(rend(h.produksi, h.tbs_olah)) + '</b>') +
      kpi('Stok akhir', kg(stokAkhir), 'kg', n(rows[0].stok_awal_bulan) !== null ? 'stok awal bulan <b>' + kg(rows[0].stok_awal_bulan) + ' kg</b>' : 'stok awal bulan belum terbaca') +
      keluar.map(function (k) {
        var sub = 'hari ini <b>' + kg(h[k[0]]) + ' kg</b>';
        if (k[0] === 'dibakar' && (sum(R, 'boiler') || sum(R, 'generator'))) sub = 'boiler <b>' + kg(sum(R, 'boiler')) + '</b>, generator <b>' + kg(sum(R, 'generator')) + '</b>';
        return kpi(k[1], kg(sum(R, k[0])), 'kg', sub);
      }).join('') +
      '</div>';
    html += '<div class="section grid-2">' +
      panel('c-bp-prod', 'Produksi ' + nama.toLowerCase() + ' per hari', 'Kilogram.') +
      (keluar.length ? panel('c-bp-keluar', nama + ' keluar per tujuan', 'Kilogram per hari' + (keluar.length > 1 ? ', ditumpuk.' : '.'),
        legend(keluar.map(function (k) { return [warna(k[2]), k[1], 'box']; })))
        : panel('c-bp-stok', 'Stok ' + nama.toLowerCase(), 'Kilogram di akhir hari.')) +
      '</div>';

    // Rekap tahunan
    var th = S.data[S.bulan].tahunan.byproduct, bulanTh = Object.keys(th).filter(function (k) { return k.split('|')[1] === S.bp; }).sort();
    if (bulanTh.length) {
      var kolTh = BP_KELUAR.filter(function (k) { return bulanTh.some(function (b) { return n(th[b][k[0]]); }); });
      html += '<div class="section"><h2>Rekap ' + S.bulan.slice(0, 4) + '</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Bulan</th><th>TBS diolah</th><th>Produksi</th><th>%</th>' +
        kolTh.map(function (k) { return '<th>' + k[1].replace(' (dikirim)', '').replace(' (bahan bakar)', '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        bulanTh.map(function (k) {
          var x = th[k], b = k.split('|')[0];
          return '<tr' + (b === S.bulan ? ' class="sel"' : '') + '><td class="l">' + namaBulan(b) + '</td><td>' + kg(x.tbs_olah) + '</td><td>' + kg(x.produksi) + '</td><td>' + pct(rend(x.produksi, x.tbs_olah)) + '</td>' +
            kolTh.map(function (c) { return '<td>' + kg(x[c[0]]) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    $('#page').innerHTML = html; bindChips();
    var lab = rows.map(function (r) { return tglPendek(r.tanggal); });
    barChart('c-bp-prod', lab, [{ label: 'Produksi (kg)', data: rows.map(function (r) { return r.produksi; }),
      backgroundColor: rows.map(function (r) { return r.tanggal === S.hari ? cssVar('--s-4') : alpha(cssVar('--s-4'), .45); }) }]);
    if (keluar.length) {
      barChart('c-bp-keluar', lab, keluar.map(function (k) {
        return { label: k[1], data: rows.map(function (r) { return r[k[0]]; }), backgroundColor: warna(k[2]) };
      }), { stacked: true });
    } else {
      barChart('c-bp-stok', lab, [{ label: 'Stok (kg)', data: rows.map(function (r) { return r.stok; }), backgroundColor: alpha(cssVar('--s-4'), .6) }]);
    }
  }
  function bindChips() {
    document.querySelectorAll('[data-bp]').forEach(function (b) { b.addEventListener('click', function () { S.bp = b.dataset.bp; render(); }); });
    document.querySelectorAll('[data-produk]').forEach(function (b) { b.addEventListener('click', function () { S.produk = b.dataset.produk; render(); }); });
  }

  /* ----------------------------------------------------- PENGIRIMAN */
  var WARNA_PRODUK = { CPO: '--s-cpo', PK: '--s-pk', TANKOS: '--s-4' };
  function halPengiriman(d) {
    var produkAda = [];
    d.pengiriman.forEach(function (r) { if (produkAda.indexOf(r.produk) < 0) produkAda.push(r.produk); });
    produkAda.sort(function (a, b) { return (a === 'CPO' ? 0 : a === 'PK' ? 1 : 2) - (b === 'CPO' ? 0 : b === 'PK' ? 1 : 2); });
    if (S.produk !== 'SEMUA' && produkAda.indexOf(S.produk) < 0) S.produk = 'SEMUA';
    var html = '<div class="page-head"><h1>Pengiriman</h1><span class="muted">' + tglPanjang(S.hari) + ', akumulasi dari tanggal 1</span></div>';
    if (!produkAda.length) { $('#page').innerHTML = html + '<p class="empty">Belum ada data pengiriman untuk ' + namaBulan(S.bulan) + '.</p>'; return; }
    html += '<div class="chips" role="group" aria-label="Produk">' + ['SEMUA'].concat(produkAda).map(function (p) {
      return '<button class="chip" type="button" data-produk="' + p + '" aria-pressed="' + (S.produk === p) + '">' + ({ SEMUA: 'Semua produk', CPO: 'CPO', PK: 'PK' }[p] || p.charAt(0) + p.slice(1).toLowerCase()) + '</button>';
    }).join('') + '</div>';
    var tampil = S.produk === 'SEMUA' ? produkAda : [S.produk];
    var R = sd(d.pengiriman).filter(function (r) { return tampil.indexOf(r.produk) >= 0; });

    html += '<div class="kpis kpis-3">' + tampil.map(function (p) {
      var a = R.filter(function (r) { return r.produk === p; }), b = hi(a);
      var trip = sum(a, 'trip'), rspo = sum(a, 'rspo');
      var mutu = ['alb', 'ka', 'kk'].map(function (f) { var v = wavg(a, f, 'tonase'); return v === null ? null : [f.toUpperCase(), fmt(v, 2)]; }).filter(Boolean);
      return kpi(p + ' dikirim', kg(sum(a, 'tonase')), 'kg', 'hari ini <b>' + kg(sum(b, 'tonase')) + ' kg</b>') +
        kpi('Jumlah pengiriman ' + p, fmt(a.length), 'kali', trip ? '<b>' + fmt(trip) + '</b> trip truk' : (rspo ? 'RSPO <b>' + kg(rspo) + ' kg</b>' : '')) +
        kpi('Mutu ' + p + ' rata-rata', mutu.length ? mutu[0][0] + ' ' + mutu[0][1] : '–', '',
          (mutu.slice(1).map(function (m) { return m[0] + ' <b>' + m[1] + '</b>'; }).join(', ') + (mutu.length ? ' (tertimbang tonase)' : '')).trim());
    }).join('') + '</div>';

    html += '<div class="section ' + (tampil.length > 1 ? 'grid-2' : '') + '">' + tampil.map(function (p) {
      return panel('c-kirim-' + p.replace(/\s/g, ''), 'Pengiriman ' + p + ' per hari', 'Kilogram per hari' + (p === 'CPO' ? ', RSPO dan non-RSPO ditumpuk.' : '.'),
        p === 'CPO' ? legend([['var(--s-cpo)', 'Non-RSPO', 'box'], ['#86b6ef', 'RSPO', 'box']]) : '');
    }).join('') + '</div>';

    // Rekap per kontrak & tujuan
    var grp = {};
    R.forEach(function (r) { var k = r.produk + '|' + r.kontrak + '|' + r.tujuan; (grp[k] = grp[k] || []).push(r); });
    html += '<div class="section"><h2>Rekap per kontrak dan tujuan</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Produk</th><th class="l">No. kontrak</th><th class="l">Tujuan</th><th>Kirim</th><th>Tonase (kg)</th><th>RSPO (kg)</th><th>ALB</th><th>KA</th><th>KK</th><th>Sisa DO terakhir</th></tr></thead><tbody>' +
      Object.keys(grp).sort(function (a, b) { return sum(grp[b], 'tonase') - sum(grp[a], 'tonase'); }).map(function (k) {
        var g = grp[k], last = g.filter(function (r) { return n(r.sisa_do) !== null; }).pop();
        return '<tr><td class="l">' + esc(g[0].produk) + '</td><td class="l">' + esc(g[0].kontrak || '–') + '</td><td class="l">' + esc(g[0].tujuan) + '</td><td>' + g.length + '</td><td>' + kg(sum(g, 'tonase')) +
          '</td><td>' + kg(sum(g, 'rspo')) + '</td><td>' + fmt(wavg(g, 'alb', 'tonase'), 2) + '</td><td>' + fmt(wavg(g, 'ka', 'tonase'), 2) + '</td><td>' + fmt(wavg(g, 'kk', 'tonase'), 2) + '</td><td>' + (last ? kg(last.sisa_do) : '–') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    // Detail
    html += '<div class="section"><h2>Detail pengiriman</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Tanggal</th><th class="l">Produk</th><th class="l">No. DO</th><th class="l">No. kontrak</th><th class="l">Tujuan</th><th>RSPO</th><th>Non-RSPO</th><th>ALB</th><th>KA</th><th>KK</th><th>Trip</th><th class="l">Keterangan</th></tr></thead><tbody>' +
      R.slice().reverse().map(function (r) {
        return '<tr' + (r.tanggal === S.hari ? ' class="sel"' : '') + '><td class="l">' + tglPendek(r.tanggal) + '</td><td class="l">' + esc(r.produk) + '</td><td class="l">' + esc(r.no_do || '–') + '</td><td class="l">' + esc(r.kontrak || '–') + '</td><td class="l">' + esc(r.tujuan) +
          '</td><td>' + (r.rspo ? kg(r.rspo) : '–') + '</td><td>' + (r.non_rspo ? kg(r.non_rspo) : '–') + '</td><td>' + fmt(r.alb, 2) + '</td><td>' + fmt(r.ka, 2) + '</td><td>' + fmt(r.kk, 2) + '</td><td>' + fmt(r.trip) + '</td><td class="l">' + esc(r.keterangan) + '</td></tr>';
      }).join('') +
      (tampil.length === 1 ? '<tr class="total"><td class="l" colspan="5">Jumlah</td><td>' + kg(sum(R, 'rspo')) + '</td><td>' + kg(sum(R, 'non_rspo')) + '</td><td colspan="3"></td><td>' + fmt(sum(R, 'trip')) + '</td><td></td></tr>' : '') +
      '</tbody></table></div>' + (tampil.length > 1 ? '<p class="section-note" style="margin-top:8px">Pilih satu produk untuk melihat jumlah tonase di baris terakhir.</p>' : '') + '</div>';

    $('#page').innerHTML = html; bindChips();

    // Grafik per produk (skala masing-masing, tanpa sumbu ganda)
    var hariBulan = [], last = +S.hari.slice(8);
    for (var i = 1; i <= last; i++) hariBulan.push(S.bulan + '-' + (i < 10 ? '0' : '') + i);
    tampil.forEach(function (p) {
      var a = R.filter(function (r) { return r.produk === p; });
      var by = function (f) { return hariBulan.map(function (t) { return sum(a.filter(function (r) { return r.tanggal === t; }), f) || null; }); };
      var ds = p === 'CPO' ? [{ label: 'Non-RSPO (kg)', data: by('non_rspo'), backgroundColor: cssVar('--s-cpo') }, { label: 'RSPO (kg)', data: by('rspo'), backgroundColor: '#86b6ef' }]
        : [{ label: p + ' (kg)', data: by('tonase'), backgroundColor: cssVar(WARNA_PRODUK[p] || '--s-tbs') }];
      barChart('c-kirim-' + p.replace(/\s/g, ''), hariBulan.map(tglPendek), ds, { stacked: p === 'CPO' });
    });
  }

  /* ------------------------------------------------------- VALIDASI */
  function halValidasi() {
    status('Memuat validasi…');
    api('validasi').then(function (v) {
      status('');
      if (!v.ok) throw new Error(v.error);
      var err = v.peringatan.filter(function (x) { return x.level === 'error'; }).length;
      var badge = $('#badge-val'); badge.hidden = !v.peringatan.length; badge.textContent = v.peringatan.length;
      var admin = S.user && S.user.role === 'admin';
      var html = '<div class="page-head"><h1>Validasi data</h1><span class="muted">Sinkron terakhir ' + waktu(v.sinkron_terakhir) + '</span></div>' +
        '<p class="section-note" style="margin:0 0 14px">Halaman ini menunjukkan file yang dibaca dan hal-hal di spreadsheet yang perlu diperiksa. Perbaikan dilakukan di file aslinya, lalu sinkron ulang.</p>' +
        (admin ? '<p style="margin-bottom:18px"><button class="btn btn-line" id="btn-sync" type="button">Sinkron sekarang</button> <span class="muted" id="sync-msg"></span></p>' : '') +
        '<h2>Peringatan (' + v.peringatan.length + (err ? ', ' + err + ' error' : '') + ')</h2>' +
        (v.peringatan.length ? '<ul class="list" style="margin-top:10px">' + v.peringatan.map(function (p) {
          var cls = p.level === 'error' ? 'st-err' : p.level === 'warn' ? 'st-warn' : 'st-info';
          var lbl = p.level === 'error' ? 'Error' : p.level === 'warn' ? 'Periksa' : 'Info';
          return '<li><span class="status ' + cls + '">' + lbl + '</span><div>' + esc(p.pesan) + '<div class="src">' + esc(p.file) + '</div></div></li>';
        }).join('') + '</ul>' : '<p class="empty" style="margin-top:10px">Tidak ada peringatan. Semua file terbaca dengan baik.</p>') +
        '<div class="section"><h2>File yang dibaca</h2><div class="table-wrap"><table class="data"><thead><tr><th class="l">Nama file</th><th class="l">Jenis</th><th class="l">Status</th><th>Baris data</th><th class="l">Terakhir diubah</th></tr></thead><tbody>' +
        v.file.map(function (f) {
          var cls = f.status === 'ok' ? 'st-ok' : f.status === 'dilewati' ? 'st-info' : 'st-err';
          return '<tr><td class="l">' + esc(f.nama) + '</td><td class="l">' + esc({ TANKOS_HARIAN: 'BY PRODUCT', PRODUKSI: 'PRODUKSI' }[f.jenis] || f.jenis) + '</td><td class="l"><span class="status ' + cls + '">' + esc(f.status) + '</span></td><td>' + fmt(f.baris) + '</td><td class="l">' + esc(f.diperbarui) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      $('#page').innerHTML = html;
      var b = $('#btn-sync');
      if (b) b.addEventListener('click', function () {
        b.disabled = true; $('#sync-msg').textContent = 'Sinkronisasi berjalan, biasanya kurang dari satu menit…';
        api('sync').then(function (r) {
          if (!r.ok) throw new Error(r.error);
          S.data = {};
          $('#sync-msg').textContent = 'Selesai: ' + r.hasil.file_dibaca + ' file dibaca ulang, ' + r.hasil.file_tidak_berubah + ' tidak berubah.';
          return api('meta').then(function (m) { S.meta = m; $('#foot').textContent = 'Data diambil dari Google Sheets, terakhir disinkronkan ' + waktu(m.sinkron_terakhir) + '.'; return muatBulan(S.bulan); });
        }).catch(function (e) { if (e.message !== 'AUTH') $('#sync-msg').textContent = 'Sinkronisasi gagal: ' + e.message; })
          .finally(function () { b.disabled = false; });
      });
    }).catch(function (e) { if (e.message !== 'AUTH') status('Gagal memuat validasi: ' + e.message); });
  }

  /* --------------------------------------------------------- charts */
  function panel(id, title, hint, extra) {
    return '<div class="panel"><h3>' + title + '</h3><p class="hint">' + hint + '</p>' + (extra || '') + '<div class="chart"><canvas id="' + id + '"></canvas></div></div>';
  }
  function legend(items) {
    return '<div class="legend">' + items.filter(Boolean).map(function (i) {
      return '<span><i class="' + (i[2] || '') + '" style="background:' + i[0] + '"></i>' + i[1] + '</span>';
    }).join('') + '</div>';
  }
  function alpha(hex, a) {
    var m = hex.replace('#', ''); if (m.length !== 6) return hex;
    return 'rgba(' + parseInt(m.slice(0, 2), 16) + ',' + parseInt(m.slice(2, 4), 16) + ',' + parseInt(m.slice(4, 6), 16) + ',' + a + ')';
  }
  function targetDs(v, len, label) {
    return { label: label || 'Target', data: new Array(len).fill(v), borderColor: cssVar('--ink-2'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 };
  }
  function base(opts) {
    opts = opts || {};
    var grid = cssVar('--grid'), muted = cssVar('--muted'), axis = cssVar('--axis');
    var tickFmt = function (v) { return opts.pct ? fmt(v, 1) + '%' : (Math.abs(v) >= 1000 ? fmt(v / 1000, 0) + ' rb' : fmt(v, opts.dec || 0)); };
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--ink'), titleColor: cssVar('--surface'), bodyColor: cssVar('--surface'), padding: 8, boxPadding: 4,
          callbacks: { label: function (c) { if (c.raw === null) return null; return ' ' + c.dataset.label + ': ' + (opts.pct ? fmt(c.raw, 2) + '%' : fmt(c.raw, opts.dec || 0)); } }
        }
      },
      scales: {
        x: { stacked: !!opts.stacked, grid: { display: false }, border: { color: axis }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 10, font: { size: 11 } } },
        y: { stacked: !!opts.stacked, max: opts.max, beginAtZero: !opts.pct, grid: { color: grid }, border: { display: false }, ticks: { color: muted, callback: tickFmt, maxTicksLimit: 6, font: { size: 11 } } }
      }
    };
  }
  function barChart(id, labels, datasets, opts) {
    var el = document.getElementById(id); if (!el || !window.Chart) return;
    datasets.forEach(function (d) { d.borderRadius = 4; d.borderSkipped = 'start'; d.maxBarThickness = 22; d.categoryPercentage = 0.8; d.barPercentage = 0.9; });
    S.charts.push(new Chart(el, { type: 'bar', data: { labels: labels, datasets: datasets }, options: base(opts) }));
  }
  function lineChart(id, labels, datasets, opts) {
    var el = document.getElementById(id); if (!el || !window.Chart) return;
    datasets.forEach(function (d) {
      if (d.borderWidth === undefined) d.borderWidth = 2;
      if (d.pointRadius === undefined) { d.pointRadius = 0; d.pointHoverRadius = 5; d.pointHoverBorderWidth = 2; d.pointHoverBorderColor = cssVar('--surface'); d.pointHoverBackgroundColor = d.borderColor; }
      d.spanGaps = true; d.tension = 0.2; d.backgroundColor = d.borderColor;
    });
    S.charts.push(new Chart(el, { type: 'line', data: { labels: labels, datasets: datasets }, options: base(opts) }));
  }

  /* Tooltip untuk elemen HTML (neraca TBS) */
  function bindTips() {
    var tip = $('#tip');
    document.querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) { tip.hidden = false; tip.textContent = el.dataset.tip; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; });
      el.addEventListener('mouseleave', function () { tip.hidden = true; });
    });
  }

  /* ----------------------------------------------------------- start */
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (S.data[S.bulan]) render(); });
  S.token = store('bbc_token');
  try { S.user = JSON.parse(store('bbc_user') || 'null'); } catch (e) { S.user = null; }
  if (S.token) mulai(); else tampilLogin();
})();
