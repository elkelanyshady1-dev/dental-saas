const d = require('./frontend/src/org/modules/patients/components/orthodontic-chart/data/teeth_data_refined.json');

// Upper teeth: 18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28
const upperIds = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
console.log('=== Upper Teeth BBox Analysis ===');
for (const id of upperIds) {
    const t = d[id.toString()];
    if (t && t.bbox) {
        const b = t.bbox;
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        console.log(`Tooth ${id}: minY=${b.minY.toFixed(1)} maxY=${b.maxY.toFixed(1)} height=${h.toFixed(1)} width=${w.toFixed(1)}`);
    } else {
        console.log(`Tooth ${id}: NO SVG DATA`);
    }
}

// Check how tooth 23 compares with neighbors
console.log('\n=== Scale Analysis for Upper Teeth ===');
const targetW = 56, targetH = 112;
for (const id of upperIds) {
    const t = d[id.toString()];
    if (t && t.bbox) {
        const b = t.bbox;
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        const scale = Math.min(targetW / w, targetH / h);
        const offsetY = (targetH - h * scale) / 2;
        console.log(`Tooth ${id}: scale=${scale.toFixed(4)} offsetY=${offsetY.toFixed(1)} (bracket Y will shift by offsetY)`);
    }
}
