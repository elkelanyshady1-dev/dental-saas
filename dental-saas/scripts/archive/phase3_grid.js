const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let lines = fs.readFileSync(f, 'utf8').split('\n');

console.log('Initial lines:', lines.length);

// ========================================
// Replace RecordsPhotoGrid inline JSX (lines 522-604)
// The block starts at {/* Photo Grid Layout...
// and ends at </> before the ternary
// ========================================

// Find: {/* Photo Grid Layout - Seamless, X-rays on Right */}
const gridStart = lines.findIndex(l => l.includes('{/* Photo Grid Layout'));
// Find the </> that closes the records fragment
// It should be right before ") : activeSubTab === 'problem-list'"
const problemListIdx = lines.findIndex(l => l.includes("activeSubTab === 'problem-list'"));
// The </> is 1 line before that
const fragmentEnd = problemListIdx - 1; // The ) : line

// Actually the fragment starts at <> (line 522) and ends at </> 
// Let's find the exact <> and </>
const fragmentStartIdx = lines.findIndex((l, i) => i > 520 && l.trim() === '<>');
const fragmentEndIdx = lines.findIndex((l, i) => i > fragmentStartIdx && l.trim() === '</>' && i < problemListIdx);

if (gridStart === -1 || fragmentEndIdx === -1) {
  console.error('RecordsPhotoGrid not found!', gridStart, fragmentEndIdx);
  process.exit(1);
}

console.log('RecordsPhotoGrid: lines', fragmentStartIdx + 1, 'to', fragmentEndIdx + 1);

const replacement = [
  '        <RecordsPhotoGrid',
  '          records={records}',
  "          patientName={patientName || 'Patient Records'}",
  '          chiefComplaint={chiefComplaint}',
  "          date={initialData?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}",
  '          showLabels={showLabels}',
  '          blurPatientName={blurPatientName}',
  '          getAspectRatioClass={getAspectRatioClass}',
  '          onToggleLabels={() => setShowLabels(prev => !prev)}',
  '          onToggleBlurName={() => setBlurPatientName(prev => !prev)}',
  '          onOpenFullscreen={() => setIsGridFullscreenOpen(true)}',
  '          onSelectPhoto={setSelectedPhoto}',
  '          onTriggerUpload={() => fileInputRef.current?.click()}',
  '          onFullscreen={(r) => { setSelectedPhoto(r); setIsFullscreenOpen(true); }}',
  '          onEdit={(r) => { setSelectedPhoto(r); setIsEditModalOpen(true); }}',
  '        />',
];

lines = [...lines.slice(0, fragmentStartIdx), ...replacement, ...lines.slice(fragmentEndIdx + 1)];
console.log('After RecordsPhotoGrid replacement:', lines.length, 'lines');

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done.');
