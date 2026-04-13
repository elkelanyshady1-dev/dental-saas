const fs = require('fs');
const path = require('path');

const base = 'c:\\Clinic system project\\dental-saas';

const files = [
  { name: 'OrthoRecordsTab.tsx' },
  { name: 'OrthoCasesTab.tsx' }
];

const srcDir = path.join(base, 'dental-chart-pro v2', 'src', 'components', 'orthodontics', 'patient');
const dstDir = path.join(base, 'frontend', 'src', 'org', 'modules', 'patients', 'components', 'orthodontic-chart', 'components', 'cases');

for (const f of files) {
  const src = path.join(srcDir, f.name);
  const dst = path.join(dstDir, f.name);
  
  let content = fs.readFileSync(src, 'utf8');
  content = content.replace(/from 'framer-motion'/g, "from 'motion/react'");
  content = content.replace(/from '\.\.\/\.\.\/\.\.\/types'/g, "from '../../types'");
  
  fs.writeFileSync(dst, content, 'utf8');
  console.log('Copied: ' + f.name + ' (' + content.length + ' bytes)');
}

console.log('ALL DONE');
