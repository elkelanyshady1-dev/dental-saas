const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
const lines = fs.readFileSync(f, 'utf8').split('\n');

// ========================================
// STEP 1: Remove STLModel component (lines 52-65, 0-indexed: 51-64)
// ========================================
// Remove lines 52-65 (inline STLModel)
const afterStlModel = [...lines.slice(0, 51), '', ...lines.slice(65)];

console.log('Step 1a: Removed STLModel. Lines:', afterStlModel.length);

// ========================================
// STEP 1b: Remove STL viewer modal (lines 926-1032, but shifted by removal above)
// The shift is: 65-52+1 = 14 lines removed, -1 for blank = 13 net removal
// Original line 926 → now line 926 - 13 = 913
// Original line 1032 → now line 1032 - 13 = 1019
// 0-indexed: 912 to 1018
// ========================================
// Let's find the exact boundaries by content
const stlModalStart = afterStlModel.findIndex(l => l.includes('{/* STL Viewer Modal */}'));
const stlModalEndContent = '      </AnimatePresence>';
// Find the AnimatePresence closing tag after the STL modal start
let stlModalEnd = -1;
for (let i = stlModalStart + 1; i < afterStlModel.length; i++) {
  if (afterStlModel[i].trim() === '</AnimatePresence>') {
    stlModalEnd = i;
    break;
  }
}

if (stlModalStart === -1 || stlModalEnd === -1) {
  console.error('Could not find STL modal boundaries!', stlModalStart, stlModalEnd);
  process.exit(1);
}

console.log('STL Modal: lines', stlModalStart + 1, 'to', stlModalEnd + 1);

// Replace with lazy-loaded component call
const stlReplacement = [
  '',
  '      {/* STL Viewer Modal (Lazy Loaded) */}',
  '      <React.Suspense fallback={null}>',
  '        <STLViewerModal',
  '          isOpen={isStlViewerOpen}',
  '          selectedStl={selectedStl}',
  '          onClose={() => setIsStlViewerOpen(false)}',
  '        />',
  '      </React.Suspense>',
  '',
];

const afterStlModal = [...afterStlModel.slice(0, stlModalStart), ...stlReplacement, ...afterStlModel.slice(stlModalEnd + 1)];
console.log('Step 1b: Replaced STL modal. Lines:', afterStlModal.length);

fs.writeFileSync(f, afterStlModal.join('\n'), 'utf8');
console.log('Done. File saved.');
