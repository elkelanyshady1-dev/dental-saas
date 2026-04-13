const d = require('./dental-chart-pro/src/assets/data/teeth_data_refined.json');
const keys = Object.keys(d).sort((a,b) => Number(a) - Number(b));
console.log('Teeth in dental-chart-pro:', keys.join(','));
console.log('Count:', keys.length);

const d2 = require('./frontend/src/org/modules/patients/components/orthodontic-chart/data/teeth_data_refined.json');
const keys2 = Object.keys(d2).sort((a,b) => Number(a) - Number(b));
console.log('\nTeeth in frontend:', keys2.join(','));
console.log('Count:', keys2.length);

console.log('\nMissing in frontend:', keys.filter(k => !keys2.includes(k)).join(','));
console.log('Extra in frontend:', keys2.filter(k => !keys.includes(k)).join(','));
