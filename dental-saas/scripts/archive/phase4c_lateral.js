const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let lines = fs.readFileSync(f, 'utf8').split('\n');

console.log('Initial lines:', lines.length);

// Find the lateral sidebar comment
const lateralStart = lines.findIndex(l => l.includes('{/* Analysis Sidebar - Lateral Analysis */}'));
if (lateralStart === -1) { console.error('Lateral sidebar not found!'); process.exit(1); }

// Find the end: the closing ")}""  followed by blank line + {/* Analysis Sidebar - Profile Rest */}
const profileStart = lines.findIndex(l => l.includes('{/* Analysis Sidebar - Profile Rest */}'));
if (profileStart === -1) { console.error('Profile sidebar not found!'); process.exit(1); }

// The lateral sidebar ends at profileStart - 1 (blank line) -> profileStart - 2 should be the closing
// Let's go back from profileStart to find the closing
let lateralEnd = profileStart - 1;
// Skip blank lines
while (lateralEnd > lateralStart && lines[lateralEnd].trim() === '') lateralEnd--;
// lateralEnd should now be at ")}" line

console.log('Lateral sidebar: lines', lateralStart + 1, 'to', lateralEnd + 1);
console.log('Start:', lines[lateralStart].trim().substring(0, 50));
console.log('End:', lines[lateralEnd].trim());

const replacement = [
  '              {/* Analysis Sidebar - Lateral Analysis (Extracted) */}',
  "              {(selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') && (",
  '                <LateralAnalysisSidebar',
  '                  selectedPhoto={selectedPhoto}',
  '                  records={records}',
  '                  onUpdateAnalysis={updateAnalysis}',
  '                  onClose={() => setIsFullscreenOpen(false)}',
  '                />',
  '              )}',
];

lines = [...lines.slice(0, lateralStart), ...replacement, ...lines.slice(lateralEnd + 1)];
console.log('After replacement:', lines.length, 'lines');

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done.');
