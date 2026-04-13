const fs = require('fs');
const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
let content = fs.readFileSync(f, 'utf8');

// ========================================
// STEP 1: Replace overlay useState declarations (lines 351-371)
// ========================================
const oldState = `  const [showMidline, setShowMidline] = useState(false);
  const [showProfileLine, setShowProfileLine] = useState(false);`;

const oldState2 = `  const [midlineX, setMidlineX] = useState(50);
  const [midlineY, setMidlineY] = useState(40);
  const [profileLineX, setProfileLineX] = useState(50);
  const [profileLineRotation, setProfileLineRotation] = useState(0);
  const [facialMidlineX, setFacialMidlineX] = useState(50);
  const [upperMidlineX, setUpperMidlineX] = useState(50);
  const [lowerMidlineX, setLowerMidlineX] = useState(50);
  const [showDentalMidlines, setShowDentalMidlines] = useState(false);
  const [rightCanineUpperX, setRightCanineUpperX] = useState(60);
  const [rightCanineLowerX, setRightCanineLowerX] = useState(60);
  const [rightMolarUpperX, setRightMolarUpperX] = useState(40);
  const [rightMolarLowerX, setRightMolarLowerX] = useState(40);
  const [leftCanineUpperX, setLeftCanineUpperX] = useState(40);
  const [leftCanineLowerX, setLeftCanineLowerX] = useState(40);
  const [leftMolarUpperX, setLeftMolarUpperX] = useState(60);
  const [leftMolarLowerX, setLeftMolarLowerX] = useState(60);
  const [showLateralLines, setShowLateralLines] = useState(false);`;

const newState = `  // Overlay state — consolidated
  const [overlayState, setOverlayState] = useState({
    midline: { visible: false, x: 50, y: 40 },
    profileLine: { visible: false, x: 50, rotation: 0 },
    dentalMidlines: { visible: false, facial: 50, upper: 50, lower: 50 },
    lateralLines: {
      visible: false,
      right: { canineUpper: 60, canineLower: 60, molarUpper: 40, molarLower: 40 },
      left: { canineUpper: 40, canineLower: 40, molarUpper: 60, molarLower: 60 },
    },
  });

  const updateOverlay = (path: string[], value: any) => {
    setOverlayState(prev => {
      const newState = structuredClone(prev);
      let ref: any = newState;
      for (let i = 0; i < path.length - 1; i++) {
        ref = ref[path[i]];
      }
      ref[path[path.length - 1]] = value;
      return newState;
    });
  };`;

// Replace the two blocks
if (!content.includes(oldState)) {
  console.error('Could not find oldState block!');
  process.exit(1);
}
content = content.replace(oldState, newState);

if (!content.includes(oldState2)) {
  console.error('Could not find oldState2 block!');
  process.exit(1);
}
content = content.replace(oldState2, '');

console.log('Step 1: Replaced state declarations');

// ========================================
// STEP 2: Replace all setter calls
// ========================================
// Map of old setter -> new updateOverlay call
const setterReplacements = [
  // showMidline
  ['setShowMidline(false)', "updateOverlay(['midline', 'visible'], false)"],
  ['setShowMidline(true)', "updateOverlay(['midline', 'visible'], true)"],
  ['setShowMidline(!showMidline)', "updateOverlay(['midline', 'visible'], !overlayState.midline.visible)"],
  ['setShowMidline(prev => !prev)', "updateOverlay(['midline', 'visible'], !overlayState.midline.visible)"],

  // showProfileLine
  ['setShowProfileLine(false)', "updateOverlay(['profileLine', 'visible'], false)"],
  ['setShowProfileLine(true)', "updateOverlay(['profileLine', 'visible'], true)"],
  ['setShowProfileLine(!showProfileLine)', "updateOverlay(['profileLine', 'visible'], !overlayState.profileLine.visible)"],
  ['setShowProfileLine(prev => !prev)', "updateOverlay(['profileLine', 'visible'], !overlayState.profileLine.visible)"],

  // showDentalMidlines
  ['setShowDentalMidlines(false)', "updateOverlay(['dentalMidlines', 'visible'], false)"],
  ['setShowDentalMidlines(true)', "updateOverlay(['dentalMidlines', 'visible'], true)"],
  ['setShowDentalMidlines(!showDentalMidlines)', "updateOverlay(['dentalMidlines', 'visible'], !overlayState.dentalMidlines.visible)"],
  ['setShowDentalMidlines(prev => !prev)', "updateOverlay(['dentalMidlines', 'visible'], !overlayState.dentalMidlines.visible)"],

  // showLateralLines
  ['setShowLateralLines(false)', "updateOverlay(['lateralLines', 'visible'], false)"],
  ['setShowLateralLines(true)', "updateOverlay(['lateralLines', 'visible'], true)"],
  ['setShowLateralLines(!showLateralLines)', "updateOverlay(['lateralLines', 'visible'], !overlayState.lateralLines.visible)"],
  ['setShowLateralLines(prev => !prev)', "updateOverlay(['lateralLines', 'visible'], !overlayState.lateralLines.visible)"],
];

for (const [old, replacement] of setterReplacements) {
  if (content.includes(old)) {
    content = content.replaceAll(old, replacement);
    console.log('Replaced:', old);
  }
}

// ========================================
// STEP 3: Replace value setters (slider onChange handlers)
// These are trickier - need to replace setXxx(Number(e.target.value)) patterns
// and also setXxx(val) patterns inside compound handlers
// ========================================

// Simple numeric setters
const numericSetters = [
  // midline
  ['setMidlineX(Number(e.target.value))', "updateOverlay(['midline', 'x'], Number(e.target.value))"],
  ['setMidlineY(Number(e.target.value))', "updateOverlay(['midline', 'y'], Number(e.target.value))"],
  // profile line
  ['setProfileLineX(Number(e.target.value))', "updateOverlay(['profileLine', 'x'], Number(e.target.value))"],
  ['setProfileLineRotation(Number(e.target.value))', "updateOverlay(['profileLine', 'rotation'], Number(e.target.value))"],

  // dental midlines (compound handlers - need to replace setFacialMidlineX(val), setUpperMidlineX(val), setLowerMidlineX(val))
  ['setFacialMidlineX(val)', "updateOverlay(['dentalMidlines', 'facial'], val)"],
  ['setUpperMidlineX(val)', "updateOverlay(['dentalMidlines', 'upper'], val)"],
  ['setLowerMidlineX(val)', "updateOverlay(['dentalMidlines', 'lower'], val)"],

  // lateral lines - right side
  ['setRightCanineUpperX(Number(e.target.value))', "updateOverlay(['lateralLines', 'right', 'canineUpper'], Number(e.target.value))"],
  ['setRightCanineLowerX(Number(e.target.value))', "updateOverlay(['lateralLines', 'right', 'canineLower'], Number(e.target.value))"],
  ['setRightMolarUpperX(Number(e.target.value))', "updateOverlay(['lateralLines', 'right', 'molarUpper'], Number(e.target.value))"],
  ['setRightMolarLowerX(Number(e.target.value))', "updateOverlay(['lateralLines', 'right', 'molarLower'], Number(e.target.value))"],

  // lateral lines - left side
  ['setLeftCanineUpperX(Number(e.target.value))', "updateOverlay(['lateralLines', 'left', 'canineUpper'], Number(e.target.value))"],
  ['setLeftCanineLowerX(Number(e.target.value))', "updateOverlay(['lateralLines', 'left', 'canineLower'], Number(e.target.value))"],
  ['setLeftMolarUpperX(Number(e.target.value))', "updateOverlay(['lateralLines', 'left', 'molarUpper'], Number(e.target.value))"],
  ['setLeftMolarLowerX(Number(e.target.value))', "updateOverlay(['lateralLines', 'left', 'molarLower'], Number(e.target.value))"],
];

for (const [old, replacement] of numericSetters) {
  if (content.includes(old)) {
    content = content.replaceAll(old, replacement);
    console.log('Replaced setter:', old);
  }
}

// ========================================
// STEP 4: Replace state READ access
// ========================================
// Order matters! Replace longer names first to avoid partial matches

const readReplacements = [
  // Lateral lines
  ['showLateralLines', 'overlayState.lateralLines.visible'],
  ['rightCanineUpperX', 'overlayState.lateralLines.right.canineUpper'],
  ['rightCanineLowerX', 'overlayState.lateralLines.right.canineLower'],
  ['rightMolarUpperX', 'overlayState.lateralLines.right.molarUpper'],
  ['rightMolarLowerX', 'overlayState.lateralLines.right.molarLower'],
  ['leftCanineUpperX', 'overlayState.lateralLines.left.canineUpper'],
  ['leftCanineLowerX', 'overlayState.lateralLines.left.canineLower'],
  ['leftMolarUpperX', 'overlayState.lateralLines.left.molarUpper'],
  ['leftMolarLowerX', 'overlayState.lateralLines.left.molarLower'],
  
  // Dental midlines (longer names first)
  ['showDentalMidlines', 'overlayState.dentalMidlines.visible'],
  ['facialMidlineX', 'overlayState.dentalMidlines.facial'],
  ['upperMidlineX', 'overlayState.dentalMidlines.upper'],
  ['lowerMidlineX', 'overlayState.dentalMidlines.lower'],

  // Profile line (longer names first)
  ['showProfileLine', 'overlayState.profileLine.visible'],
  ['profileLineRotation', 'overlayState.profileLine.rotation'],
  ['profileLineX', 'overlayState.profileLine.x'],

  // Midline (longer to shorter)
  ['showMidline', 'overlayState.midline.visible'],
  ['midlineY', 'overlayState.midline.y'],
  ['midlineX', 'overlayState.midline.x'],
];

for (const [old, replacement] of readReplacements) {
  const before = content;
  content = content.replaceAll(old, replacement);
  if (content !== before) {
    // Count replacements
    const count = (before.split(old).length - 1);
    console.log('Read replacement:', old, '->', replacement, '('+count+' occurrences)');
  }
}

// ========================================
// Write result
// ========================================
fs.writeFileSync(f, content, 'utf8');

const lines = content.split('\n');
console.log('\nFinal lines:', lines.length);
console.log('Done.');
