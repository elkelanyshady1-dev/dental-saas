const fs = require('fs');

// Read original file with all 32 teeth
const original = require('./dental-chart-pro/src/assets/data/teeth_data_refined.json');

// Read frontend copy (missing 18, 28, 38, 48)
const frontend = require('./frontend/src/org/modules/patients/components/orthodontic-chart/data/teeth_data_refined.json');

// Add missing teeth
const missing = ['18', '28', '38', '48'];
for (const id of missing) {
    if (original[id] && !frontend[id]) {
        frontend[id] = original[id];
        console.log(`Added tooth ${id}`);
    } else if (!original[id]) {
        console.log(`ERROR: Tooth ${id} not in original!`);
    } else {
        console.log(`Tooth ${id} already exists in frontend`);
    }
}

// Verify
const keys = Object.keys(frontend).sort((a,b) => Number(a) - Number(b));
console.log('\nFinal teeth:', keys.join(','));
console.log('Count:', keys.length);

// Write back
fs.writeFileSync(
    './frontend/src/org/modules/patients/components/orthodontic-chart/data/teeth_data_refined.json',
    JSON.stringify(frontend, null, 2),
    'utf-8'
);
console.log('\nFile written successfully!');
