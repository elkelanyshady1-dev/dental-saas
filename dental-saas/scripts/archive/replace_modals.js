const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
const lines = fs.readFileSync(f, 'utf8').split('\n');

// Lines 2998-3253 (1-indexed) contain the 3 modals: Extraoral, Intraoral, PhotoViewer
// 0-indexed: 2997-3252
// Replace them with the extracted component calls
const replacement = [
  '',
  '      {/* Extraoral Upload Modal */}',
  '      <ExtraoralUploadModal',
  '        isOpen={isExtraoralModalOpen}',
  '        onClose={() => setIsExtraoralModalOpen(false)}',
  '        records={records}',
  '        getAspectRatioClass={getAspectRatioClass}',
  '        onSelectPhoto={setSelectedPhoto}',
  '        onTriggerUpload={() => fileInputRef.current?.click()}',
  '      />',
  '',
  '      {/* Intraoral Upload Modal */}',
  '      <IntraoralUploadModal',
  '        isOpen={isIntraoralModalOpen}',
  '        onClose={() => setIsIntraoralModalOpen(false)}',
  '        records={records}',
  '        getAspectRatioClass={getAspectRatioClass}',
  '        onSelectPhoto={setSelectedPhoto}',
  '        onTriggerUpload={() => fileInputRef.current?.click()}',
  '      />',
  '',
  '      {/* Photo Viewer Modal */}',
  '      <PhotoViewerModal',
  '        isOpen={isPhotoViewerOpen}',
  '        onClose={() => setIsPhotoViewerOpen(false)}',
  '        records={records}',
  '        patientName={patientName}',
  '        onSelectPhoto={setSelectedPhoto}',
  '        onFullscreen={(r) => { setSelectedPhoto(r); setIsFullscreenOpen(true); }}',
  '      />',
  '',
];

const out = [...lines.slice(0, 2997), ...replacement, ...lines.slice(3253)];
fs.writeFileSync(f, out.join('\n'), 'utf8');
console.log('Done. Replaced', 3253 - 2997, 'modal lines with', replacement.length, 'lines. Total:', out.length);
