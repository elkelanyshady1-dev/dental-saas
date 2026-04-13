const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
const lines = fs.readFileSync(f, 'utf8').split('\n');

// ========================================
// STEP 2-4: Replace ClinicalRecordsPanel + QuickActionsPanel (lines 728-893)
// Also remove audio recording state + handlers (lines 434-490)
// ========================================

// First, remove voice note state + handlers (0-indexed: 433-489)
const voiceStart = lines.findIndex(l => l.includes('// Voice Note State'));
const deleteAudioEnd = lines.findIndex((l, i) => i > voiceStart && l.trim() === '};' && lines[i-1]?.includes('setIsPlaying(false)'));

if (voiceStart === -1 || deleteAudioEnd === -1) {
  console.error('Could not find voice note state boundaries!', voiceStart, deleteAudioEnd);
  process.exit(1);
}

console.log('Voice Note State: lines', voiceStart + 1, 'to', deleteAudioEnd + 1);

// Remove voice state (replace with blank)
const afterVoiceRemoval = [...lines.slice(0, voiceStart), '', ...lines.slice(deleteAudioEnd + 1)];
console.log('After voice removal:', afterVoiceRemoval.length, 'lines');

// Now find the clinical + quick actions panel in the new array
// Looking for: {/* Header & General Info */}
const gridStart = afterVoiceRemoval.findIndex(l => l.includes('{/* Header & General Info */}'));
// Looking for: </div> after the quick actions panel closing
// The panel ends at </div> then </div> before {/* Hidden File Inputs */}
const hiddenInputsStart = afterVoiceRemoval.findIndex(l => l.includes('{/* Hidden File Inputs */}'));

if (gridStart === -1 || hiddenInputsStart === -1) {
  console.error('Could not find panel boundaries!', gridStart, hiddenInputsStart);
  process.exit(1);
}

console.log('Clinical+Quick Actions: lines', gridStart + 1, 'to', hiddenInputsStart);

const replacement = [
  '',
  '    {/* Clinical Records + Quick Actions */}',
  '      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">',
  '        {activeSubTab === \'records\' ? (',
  '          <ClinicalRecordsPanel',
  '            patientId={patientId}',
  '            chiefComplaint={chiefComplaint}',
  '            onChiefComplaintChange={setChiefComplaint}',
  '            audioUrl={audioUrl}',
  '            onAudioChange={setAudioUrl}',
  '          />',
  '        ) : (',
  '          <div className="lg:col-span-2" />',
  '        )}',
  '',
  '        <QuickActionsPanel',
  '          activeSubTab={activeSubTab}',
  '          onTabChange={setActiveSubTab}',
  '          stlFiles={stlFiles}',
  '          onStlUpload={() => stlInputRef.current?.click()}',
  '          onOpenStl={(file) => { setSelectedStl(file); setIsStlViewerOpen(true); }}',
  '          onOpenExtraoral={() => setIsExtraoralModalOpen(true)}',
  '          onOpenIntraoral={() => setIsIntraoralModalOpen(true)}',
  '        />',
  '      </div>',
  '',
];

const afterPanelReplacement = [...afterVoiceRemoval.slice(0, gridStart), ...replacement, ...afterVoiceRemoval.slice(hiddenInputsStart)];
console.log('After panel replacement:', afterPanelReplacement.length, 'lines');

fs.writeFileSync(f, afterPanelReplacement.join('\n'), 'utf8');
console.log('Done. File saved.');
