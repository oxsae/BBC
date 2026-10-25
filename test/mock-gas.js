// Simulasi Apps Script di Node untuk menguji Code.gs + Sync.gs + Setup.gs end-to-end.
// Pakai: XLSX_PATH=... node test/mock-gas.js file1.xlsx file2.xlsx ...
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const XLSX = require(process.env.XLSX_PATH || 'xlsx');
const src = fs.readFileSync(path.join(__dirname, 'run-parser.js'), 'utf8');
const toWorkbook = eval('(' + src.match(/function toWorkbook[\s\S]*?\n}\n/)[0] + ')');

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(((this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]) ?? '');
      out.push(row);
    }
    return out;
  }
  setValues(v) {
    v.forEach((row, i) => row.forEach((x, j) => {
      const R = this.r - 1 + i;
      this.sh.data[R] = this.sh.data[R] || [];
      // Format teks: simpan sebagai string
      const fmt = this.sh.fmt[this.c - 1 + j];
      this.sh.data[R][this.c - 1 + j] = fmt === '@' && x !== '' ? String(x) : x;
    }));
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sh.fmt[this.c - 1 + j] = f; return this; }
  setFontWeight() { return this; }
}
class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; this.fmt = {}; }
  getName() { return this.name; }
  getLastRow() { let n = 0; this.data.forEach((r, i) => { if (r && r.some((x) => x !== '' && x !== undefined)) n = i + 1; }); return n; }
  getLastColumn() { let n = 0; this.data.forEach((r) => r && r.forEach((x, j) => { if (x !== '' && x !== undefined) n = Math.max(n, j + 1); })); return n; }
  getMaxRows() { return 1000; } getMaxColumns() { return 40; }
  insertRowsAfter() {} insertColumnsAfter() {} setFrozenRows() {} setColumnWidth() {}
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(a, b, c, d) { return new Range(this, a, b, c || 1, d || 1); }
  clearContents() { this.data = []; }
  appendRow(row) { this.data[this.getLastRow()] = row.slice(); }
  deleteRows(s, n) { this.data.splice(s - 1, n); }
}
class SS {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  getSpreadsheetTimeZone() { return 'Asia/Jakarta'; }
  setSpreadsheetTimeZone() {}
}

// Folder data: tiap xlsx jadi satu "Google Sheet".
const files = process.argv.slice(2).map((f, i) => ({
  id: 'F' + i, name: path.basename(f, '.xlsx'), wb: new SS(toWorkbook(f).map((t) => new Sheet(t.name, t.values))),
  updated: new Date(2026, 9, 24, 10, i)
}));
files.push({ id: 'X', name: 'Abu Boiler 2026.xlsx', mime: 'xlsx', updated: new Date() });
const backend = new SS([]);
const cache = new Map(); const props = new Map();
let alerts = [];

const ctx = {
  console, JSON, Math, Date, Object, String, Number, Array, RegExp, isFinite, parseInt, Error,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => backend,
    openById: (id) => files.find((f) => f.id === id).wb,
    getUi: () => ({ alert: (m) => alerts.push(m) })
  },
  DriveApp: {
    getFolderById: () => ({
      getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => {
        const f = files[i++];
        return { getId: () => f.id, getName: () => f.name, getMimeType: () => (f.mime ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'GS'), getLastUpdated: () => f.updated };
      } }; },
      getFolders: () => ({ hasNext: () => false })
    })
  },
  MimeType: { GOOGLE_SHEETS: 'GS' },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: { createTextOutput: (s) => ({ setMimeType: () => ({ body: s }) }), MimeType: { JSON: 'json' } },
  Utilities: {
    computeDigest: (_a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()],
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, _tz, f) => {
      const p = (n) => String(n).padStart(2, '0');
      return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
        .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
    },
    DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }
  },
  ScriptApp: {}
};
vm.createContext(ctx);
for (const f of ['Parser.gs', 'Sync.gs', 'Code.gs', 'Setup.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend-apps-script', f), 'utf8'), ctx, { filename: f });
}

const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
ctx.bbcSetupAwal();
backend.getSheetByName('Setting').data[1][1] = 'folder123';
backend.getSheetByName('Setting').data[3][1] = 45;
ctx.bbcSimpanUser('admin', 'Admin BBC', 'admin', 'rahasia123');
ctx.bbcSimpanUser('manajer', 'Manajer', 'viewer', 'rahasia456');

let t0 = Date.now();
console.log('sync 1:', JSON.stringify(ctx.bbcSync(false).ringkas), (Date.now() - t0) + 'ms');
console.log('sync 2 (tanpa perubahan):', JSON.stringify(ctx.bbcSync(false).ringkas));
files[0].updated = new Date(2026, 9, 24, 12, 0);
console.log('sync 3 (1 file berubah):', JSON.stringify(ctx.bbcSync(false).ringkas));

console.log('login salah:', call({ action: 'login', username: 'admin', password: 'x' }).error);
console.log('tanpa token:', call({ action: 'data', bulan: '2026-10' }).error);
const viewer = call({ action: 'login', username: 'manajer', password: 'rahasia456' });
console.log('login viewer:', viewer.ok, viewer.user);
console.log('viewer sync:', call({ action: 'sync', token: viewer.token }).error);
const adm = call({ action: 'login', username: 'ADMIN', password: 'rahasia123' });
console.log('login admin:', adm.ok, adm.user.role);
const meta = call({ action: 'meta', token: adm.token });
console.log('meta:', JSON.stringify(meta));
const data = call({ action: 'data', token: adm.token, bulan: process.env.BULAN || '2026-10' });
console.log('data:', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).map(x => x + ':' + Object.keys(v[x]).length).join(',') : v])));
console.log('contoh produksi:', JSON.stringify(data.produksi[data.produksi.length - 1]));
console.log('tanggal teks utuh?', data.produksi.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.tanggal)), typeof data.produksi[0].tbs_olah);
const val = call({ action: 'validasi', token: adm.token });
console.log('validasi:', val.file.length, 'file;', val.peringatan.length, 'peringatan');
val.peringatan.forEach((p) => console.log('  -', p.level, p.file, '|', p.pesan.slice(0, 110)));
console.log('sync via API:', JSON.stringify(call({ action: 'sync', token: adm.token, paksa: true })));
console.log('logout:', call({ action: 'logout', token: adm.token }).ok, '→ data:', call({ action: 'data', token: adm.token, bulan: '2026-10' }).kode);
for (let i = 0; i < 6; i++) call({ action: 'login', username: 'manajer', password: 'salah' });
console.log('kunci setelah 6x gagal:', call({ action: 'login', username: 'manajer', password: 'rahasia456' }).error);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ meta, data }));
