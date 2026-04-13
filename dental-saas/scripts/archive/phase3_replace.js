const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let lines = fs.readFileSync(f, 'utf8').split('\n');

console.log('Initial lines:', lines.length);

// ========================================
// STEP 1: Replace Grid Fullscreen Modal (lines 726-806)
// ========================================
const gridStart = lines.findIndex(l => l.includes('{/* Grid Fullscreen Modal */}'));
// Find the second </AnimatePresence> after gridStart (end of grid fullscreen modal)
let gridEnd = -1;
let aeCount = 0;
for (let i = gridStart; i < lines.length; i++) {
  if (lines[i].trim() === '</AnimatePresence>') {
    gridEnd = i;
    break;
  }
}

if (gridStart === -1 || gridEnd === -1) {
  console.error('Grid modal not found!', gridStart, gridEnd);
  process.exit(1);
}
console.log('Grid Fullscreen Modal: lines', gridStart + 1, 'to', gridEnd + 1);

const gridReplacement = [
  '',
  '      {/* Grid Fullscreen Modal (Extracted) */}',
  '      <GridFullscreenModal',
  '        isOpen={isGridFullscreenOpen}',
  '        records={records}',
  "        patientName={patientName || 'Patient Records'}",
  '        chiefComplaint={chiefComplaint}',
  "        date={initialData?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}",
  '        showLabels={showLabels}',
  '        blurPatientName={blurPatientName}',
  '        getAspectRatioClass={getAspectRatioClass}',
  '        onClose={() => setIsGridFullscreenOpen(false)}',
  '        onSelectPhoto={setSelectedPhoto}',
  '        onTriggerUpload={() => fileInputRef.current?.click()}',
  '        onFullscreen={(r) => { setSelectedPhoto(r); setIsFullscreenOpen(true); }}',
  '        onEdit={(r) => { setSelectedPhoto(r); setIsEditModalOpen(true); }}',
  '      />',
  '',
];

lines = [...lines.slice(0, gridStart), ...gridReplacement, ...lines.slice(gridEnd + 1)];
console.log('After grid replacement:', lines.length, 'lines');

// ========================================
// STEP 2: Replace Edit Modal
// ========================================
const editStart = lines.findIndex(l => l.includes('{/* Edit Modal */}'));
// Find </AnimatePresence> after editStart
let editEnd = -1;
for (let i = editStart + 1; i < lines.length; i++) {
  if (lines[i].trim() === '</AnimatePresence>') {
    editEnd = i;
    break;
  }
}

if (editStart === -1 || editEnd === -1) {
  console.error('Edit modal not found!', editStart, editEnd);
  process.exit(1);
}
console.log('Edit Modal: lines', editStart + 1, 'to', editEnd + 1);

const editReplacement = [
  '',
  '      {/* Image Editor Modal (Extracted) */}',
  '      <ImageEditorModal',
  '        isOpen={isEditModalOpen}',
  '        selectedPhoto={selectedPhoto}',
  '        getAspectRatioClass={getAspectRatioClass}',
  '        onClose={() => setIsEditModalOpen(false)}',
  '        onFlipH={(id) => toggleFlipH(id)}',
  '        onFlipV={(id) => toggleFlipV(id)}',
  '        onRemove={removePhoto}',
  '        onUpload={() => fileInputRef.current?.click()}',
  '        onSaveCrop={(photoId, croppedUrl) => {',
  '          setRecords(prev => prev.map(r => r.id === photoId ? { ...r, url: croppedUrl } : r));',
  '          setSelectedPhoto(prev => prev ? { ...prev, url: croppedUrl } : null);',
  '        }}',
  '        onUpdateAnalysis={updateAnalysis}',
  '        cephMeasurements={CEPH_MEASUREMENTS}',
  '      />',
  '',
];

lines = [...lines.slice(0, editStart), ...editReplacement, ...lines.slice(editEnd + 1)];
console.log('After edit replacement:', lines.length, 'lines');

// ========================================
// STEP 3: Remove crop state + handlers that moved to ImageEditorModal
// Remove: getAspectRatioNumber, onCropComplete, saveCroppedImage
// Remove: crop, zoom, isCropping, croppedAreaPixels state
// ========================================

// Remove getAspectRatioNumber function
const ratioNumStart = lines.findIndex(l => l.includes('const getAspectRatioNumber'));
if (ratioNumStart !== -1) {
  let ratioNumEnd = ratioNumStart;
  for (let i = ratioNumStart + 1; i < lines.length; i++) {
    if (lines[i].trim() === '};') { ratioNumEnd = i; break; }
  }
  lines = [...lines.slice(0, ratioNumStart), ...lines.slice(ratioNumEnd + 1)];
  console.log('Removed getAspectRatioNumber');
}

// Remove onCropComplete
const cropCompStart = lines.findIndex(l => l.includes('const onCropComplete'));
if (cropCompStart !== -1) {
  let cropCompEnd = cropCompStart;
  for (let i = cropCompStart + 1; i < lines.length; i++) {
    if (lines[i].trim() === '};') { cropCompEnd = i; break; }
  }
  lines = [...lines.slice(0, cropCompStart), ...lines.slice(cropCompEnd + 1)];
  console.log('Removed onCropComplete');
}

// Remove saveCroppedImage
const saveCropStart = lines.findIndex(l => l.includes('const saveCroppedImage'));
if (saveCropStart !== -1) {
  let saveCropEnd = saveCropStart;
  for (let i = saveCropStart + 1; i < lines.length; i++) {
    if (lines[i].trim() === '};') { saveCropEnd = i; break; }
  }
  lines = [...lines.slice(0, saveCropStart), ...lines.slice(saveCropEnd + 1)];
  console.log('Removed saveCroppedImage');
}

// Remove crop state variables
const stateVars = ['const [crop, setCrop]', 'const [zoom, setZoom]', 'const [isCropping, setIsCropping]', 'const [croppedAreaPixels, setCroppedAreaPixels]'];
for (const sv of stateVars) {
  const idx = lines.findIndex(l => l.includes(sv));
  if (idx !== -1) {
    lines.splice(idx, 1);
    console.log('Removed state:', sv);
  }
}

console.log('Final lines:', lines.length);
fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done.');
