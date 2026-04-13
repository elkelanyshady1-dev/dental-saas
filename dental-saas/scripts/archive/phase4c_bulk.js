const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let lines = fs.readFileSync(f, 'utf8').split('\n');

console.log('Initial lines:', lines.length);

// Find the first sidebar block: "Analysis Sidebar - Lateral Analysis (Extracted)"
const firstSidebar = lines.findIndex(l => l.includes('Analysis Sidebar - Lateral Analysis (Extracted)'));
if (firstSidebar === -1) { console.error('First sidebar not found!'); process.exit(1); }

// Find the last sidebar end: after "Analysis Sidebar - Occlusal Analysis"
// The occlusal sidebar ends with ")}" 
// After all sidebars there's the "Close button for non-analysis photos" block
const closeButton = lines.findIndex(l => l.includes('Close button for non-analysis photos'));
if (closeButton === -1) { console.error('Close button not found!'); process.exit(1); }

// Everything from firstSidebar to closeButton-1 is sidebar blocks
// We need to find the line before the close button that ends the last sidebar
let lastSidebarEnd = closeButton - 1;
// Skip blank lines
while (lastSidebarEnd > firstSidebar && lines[lastSidebarEnd].trim() === '') lastSidebarEnd--;

console.log('Sidebars: lines', firstSidebar + 1, 'to', lastSidebarEnd + 1);
console.log('First:', lines[firstSidebar].trim().substring(0, 60));
console.log('Last:', lines[lastSidebarEnd].trim());

const replacement = [
  '              {/* Analysis Sidebar (Dispatched) */}',
  '              <AnalysisSidebar',
  '                selectedPhoto={selectedPhoto}',
  '                records={records}',
  '                onUpdateAnalysis={updateAnalysis}',
  '                onClose={() => setIsFullscreenOpen(false)}',
  '                occlusalViewMode={occlusalViewMode}',
  '                setOcclusalViewMode={setOcclusalViewMode}',
  '                onSelectPhoto={setSelectedPhoto}',
  '              />',
  '',
];

lines = [...lines.slice(0, firstSidebar), ...replacement, ...lines.slice(lastSidebarEnd + 1)];
console.log('After replacement:', lines.length, 'lines');

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done.');
