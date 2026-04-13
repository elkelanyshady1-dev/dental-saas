const fs = require('fs');
const path = require('path');

const src = path.join('c:', 'Clinic system project', 'dental-saas', 'dental-chart-pro v2', 'src', 'components', 'orthodontics', 'patient', 'OrthoRecordsTab.tsx');
const dst = path.join('c:', 'Clinic system project', 'dental-saas', 'frontend', 'src', 'org', 'modules', 'patients', 'components', 'orthodontic-chart', 'components', 'cases', 'OrthoRecordsTab.tsx');

let content = fs.readFileSync(src, 'utf8');
content = content.replace(/from 'framer-motion'/g, "from 'motion/react'");
content = content.replace(/from '\.\.\/\.\.\/\.\.\/types'/g, "from '../../types'");

fs.writeFileSync(dst, content, 'utf8');
console.log('DONE_RECORDS');
