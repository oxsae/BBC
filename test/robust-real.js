// Uji ketahanan parser Real Produksi: sisipkan kolom di depan dan baris kosong, total harus sama.
const path = require('path');
const XLSX = require(process.env.XLSX_PATH || 'xlsx');
const P = require(path.join(__dirname, '../backend-apps-script/Parser.gs'));
const src = require('fs').readFileSync(path.join(__dirname, 'run-parser.js'), 'utf8');
const toWorkbook = eval('(' + src.match(/function toWorkbook[\s\S]*?\n}\n/)[0] + ')');
const wb = toWorkbook(process.env.FILE);
const tot = (o) => ['diterima', 'tbs_olah', 'cpo', 'pk'].map((k) => o.hari.reduce((s, h) => s + (h[k] || 0), 0)).join('/') + ' sumber ' + o.sumber.length;
const base = tot(P.bbcParseProduksiWorkbook(wb));
const mut = wb.map((t) => {
  const v = t.values.map((r) => [''].concat(r));
  v.splice(3, 0, []); v.splice(15, 0, ['', '', 'catatan']);
  return { name: t.name, values: v };
});
const got = tot(P.bbcParseProduksiWorkbook(mut));
console.log(base === got ? 'OK: ' + base : 'GAGAL: ' + base + ' vs ' + got);
