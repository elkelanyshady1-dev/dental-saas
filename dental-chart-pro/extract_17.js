const fs = require('fs');

const svg = fs.readFileSync('./src/assets/svg/ortho-chart-v2.svg', 'utf8');

function extractGroup(id) {
  const start = svg.indexOf(`id="${id}">`);
  if (start === -1) { console.log('NOT FOUND:', id); return ''; }
  const contentStart = start + id.length + 5; // after id="...">
  // Find closing </g>
  let depth = 1;
  let i = contentStart;
  while (i < svg.length && depth > 0) {
    const nextOpen = svg.indexOf('<g', i);
    const nextClose = svg.indexOf('</g>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 2;
    } else {
      depth--;
      if (depth === 0) {
        const inner = svg.slice(contentStart, nextClose);
        return inner;
      }
      i = nextClose + 4;
    }
  }
  return '';
}

const band = extractGroup('tooth_17_band');
const tube = extractGroup('tooth_17_tube');

console.log('BAND_LENGTH:', band.length);
console.log('TUBE_LENGTH:', tube.length);

// Write them out for inspection
fs.writeFileSync('./tooth_17_band.txt', band);
fs.writeFileSync('./tooth_17_tube.txt', tube);
console.log('Done. Check tooth_17_band.txt and tooth_17_tube.txt');
