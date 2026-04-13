const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
const lines = fs.readFileSync(f, 'utf8').split('\n');
// Remove lines 596-673 (0-indexed: 595-672) — the orphaned PhotoBox body
const out = [...lines.slice(0, 595), '', ...lines.slice(673)];
fs.writeFileSync(f, out.join('\n'), 'utf8');
console.log('Done. Removed', lines.length - out.length, 'lines. Total:', out.length);
