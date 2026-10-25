// Uji ketahanan: sisipkan baris & kolom kosong, hasil harus sama.
const path = require('path');
process.argv = [process.argv[0], 'x'];
const XLSX = require(process.env.XLSX_PATH || 'xlsx');
const P = require(path.join(__dirname, '../backend-apps-script/Parser.gs'));
const src = require('fs').readFileSync(path.join(__dirname, 'run-parser.js'), 'utf8');
const toWorkbook = eval('(' + src.match(/function toWorkbook[\s\S]*?\n}\n/)[0] + ')');
const wb = toWorkbook(process.env.FILE);
const base = P.bbcParseProduksiWorkbook(wb).hari.find(h => h.tab === '23');
const mut = wb.map(t => {
  const v = t.values.map(r => [''].concat(r));          // sisip kolom di depan
  v.splice(14, 0, []); v.splice(28, 0, ['', '', 'catatan']);  // sisip 2 baris
  return { name: t.name, values: v };
});
const got = P.bbcParseProduksiWorkbook(mut).hari.find(h => h.tab === '23');
const keys = ['tbs_olah','cpo','pk','sisa_awal','diterima','sisa_akhir','jam_olah','jam_stagnasi','tbs_olah_real','sisa_real','alb_tangki'];
let ok = true;
keys.forEach(k => { if (base[k] !== got[k]) { ok = false; console.log('BEDA', k, base[k], got[k]); } });
console.log(ok ? 'OK: hasil sama setelah baris/kolom disisipkan' : 'GAGAL');
