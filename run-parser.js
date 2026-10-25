// Uji parser dengan file .xlsx asli (meniru getValues() Apps Script).
// Pakai: node test/run-parser.js <file.xlsx> [...]  -> mencetak ringkasan + menulis out.json
const path = require('path');
const fs = require('fs');
const XLSX = require(process.env.XLSX_PATH || 'xlsx');
const P = require(path.join(__dirname, '../backend-apps-script/Parser.gs'));

function toWorkbook(file) {
  const wb = XLSX.readFile(file, { cellDates: false, cellNF: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) return { name, values: [] };
    const rg = XLSX.utils.decode_range(ws['!ref']);
    const values = [];
    for (let r = 0; r <= rg.e.r; r++) {
      const row = [];
      for (let c = 0; c <= rg.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) row.push('');
        else if (cell.t === 'e') row.push(cell.w || '#ERR');
        else if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          const d = XLSX.SSF.parse_date_code(cell.v);
          row.push(String(d.d).padStart(2, '0') + '.' + String(d.m).padStart(2, '0') + '.' + d.y);
        }
        else row.push(cell.v);
      }
      values.push(row);
    }
    return { name, values };
  });
}

const all = { produksi: null, pengiriman: [], tankos: [], warnings: [] };
for (const f of process.argv.slice(2)) {
  const wb = toWorkbook(f);
  const type = P.bbcDetectType(wb);
  console.log('\n==', path.basename(f), '->', type);
  if (type === 'PRODUKSI') {
    const p = P.bbcParseProduksiWorkbook(wb);
    all.produksi = p;
    all.warnings.push(...p.warnings);
    console.log('hari:', p.hari.length, 'sumber:', p.sumber.length, 'shift:', p.shift.length, 'sisaReal:', p.sisaReal.length);
    for (const h of p.hari) {
      console.log(h.tanggal, 'olah', h.tbs_olah, 'cpo', h.cpo && h.cpo.toFixed(0), 'pk', h.pk, 'rend', h.tbs_olah ? (h.cpo / h.tbs_olah * 100).toFixed(2) : '-',
        'jam', h.jam_olah, '/', h.jam_stagnasi, 'real', h.tbs_olah_real, 'lori', h.lori, 'sisa', h.sisa_akhir, 'alb', h.alb_tangki, '|', h.stagnasi_ket.slice(0, 40));
    }
  } else if (type === 'PENGIRIMAN') {
    const p = P.bbcParsePengirimanWorkbook(wb);
    all.pengiriman.push(...p.rows);
    all.warnings.push(...p.warnings);
    const tot = p.rows.reduce((s, r) => s + r.tonase, 0);
    const rspo = p.rows.reduce((s, r) => s + r.rspo, 0);
    const trip = p.rows.reduce((s, r) => s + (r.trip || 0), 0);
    console.log('baris:', p.rows.length, 'produk:', [...new Set(p.rows.map((r) => r.produk))], 'total', tot, 'rspo', rspo, 'trip', trip);
    p.rows.slice(0, 3).forEach((r) => console.log(JSON.stringify(r)));
  } else if (type === 'TANKOS_HARIAN') {
    const p = P.bbcParseTankosWorkbook(wb);
    all.tankos.push(...p.rows);
    all.warnings.push(...p.warnings);
    const byMonth = {};
    p.rows.forEach((r) => {
      const m = r.tanggal.slice(0, 7);
      byMonth[m] = byMonth[m] || { produksi: 0, dijual: 0, inti: 0, plstu: 0, waduk: 0, tbs: 0 };
      byMonth[m].produksi += r.produksi || 0; byMonth[m].dijual += r.dijual || 0; byMonth[m].inti += r.kbn_inti || 0;
      byMonth[m].plstu += r.pls_tu || 0; byMonth[m].waduk += r.waduk || 0; byMonth[m].tbs += r.tbs_olah || 0;
    });
    console.table(byMonth);
  }
}
console.log('\n== PERINGATAN (' + all.warnings.length + ')');
all.warnings.forEach((w) => console.log('[' + w.level + ']', w.pesan));
fs.writeFileSync(process.env.OUT || 'out.json', JSON.stringify(all));
