const f = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx`;
const c = require('fs').readFileSync(f, 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);
console.log('useCallback usages:', (c.match(/useCallback/g) || []).length);
console.log('debounceRef:', c.includes('debounceRef') ? 'YES' : 'NO');
console.log('setTimeout in sync:', c.includes('debounceRef.current = setTimeout') ? 'YES' : 'NO');

const p = String.raw`c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\ProblemListTab.tsx`;
const pc = require('fs').readFileSync(p, 'utf8');
console.log('\nProblemListTab lines:', pc.split('\n').length);
console.log('handleAutoGenerateAll:', pc.includes('handleAutoGenerateAll') ? 'YES' : 'NO');
console.log('generateProblemsFromAnalysis import:', pc.includes('generateProblemsFromAnalysis') ? 'YES' : 'NO');
console.log('Zap import:', pc.includes('Zap') ? 'YES' : 'NO');
