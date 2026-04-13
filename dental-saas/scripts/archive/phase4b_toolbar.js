const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let lines = fs.readFileSync(f, 'utf8').split('\n');

console.log('Initial lines:', lines.length);

// Toolbar starts at line containing "absolute bottom-12 left-0 right-0"
const toolbarStart = lines.findIndex(l => l.includes('absolute bottom-12 left-0 right-0'));

// Toolbar ends at the </div> that is followed by </div> then {/* Analysis Sidebar
// We know it's at line 1241 (0-indexed 1240) — the </div> indented at 16 spaces
// Let's find it by looking for the closing </div> right before "Analysis Sidebar"
const analysisSidebarIdx = lines.findIndex(l => l.includes('{/* Analysis Sidebar'));
// The toolbar closing </div> is 2 lines before that (accounting for </div> and blank line)
let toolbarEnd = analysisSidebarIdx - 3; // line 1241 is the </div>

// Verify
console.log('Toolbar start line:', toolbarStart + 1, '- content:', lines[toolbarStart].trim().substring(0, 60));
console.log('Toolbar end line:', toolbarEnd + 1, '- content:', lines[toolbarEnd].trim());
console.log('After end:', lines[toolbarEnd + 1].trim());

if (lines[toolbarEnd].trim() !== '</div>') {
  // Try alternative: look for </div> right before </div> before Analysis Sidebar
  for (let i = analysisSidebarIdx - 1; i > toolbarStart; i--) {
    if (lines[i].trim() === '</div>' && lines[i].match(/^\s{16}<\/div>/)) {
      toolbarEnd = i;
      break;
    }
  }
  console.log('Corrected toolbar end line:', toolbarEnd + 1, '- content:', lines[toolbarEnd].trim());
}

const replacement = [
  '                {/* Records Toolbar (Extracted) */}',
  '                <RecordsToolbar',
  '                  selectedPhoto={selectedPhoto}',
  '                  overlayState={overlayState}',
  '                  updateOverlay={updateOverlay}',
  '                  onFlipH={() => toggleFlipH(selectedPhoto.id)}',
  '                  onFlipV={() => toggleFlipV(selectedPhoto.id)}',
  '                  onUpdateAnalysis={updateAnalysis}',
  '                />',
];

lines = [...lines.slice(0, toolbarStart), ...replacement, ...lines.slice(toolbarEnd + 1)];
console.log('After replacement:', lines.length, 'lines');

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done.');
