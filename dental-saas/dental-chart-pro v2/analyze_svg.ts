
import * as fs from 'fs';

const svg = fs.readFileSync('ortho-chart.svg', 'utf8');

const toothRegex = /<g id="tooth_(\d+)">([\s\S]*?)<\/g>\s*<\/g>/g;
const pathRegex = /d="([\s\S]*?)"/g;

const teethData: Record<string, { bbox: { minX: number, minY: number, maxX: number, maxY: number }, content: string }> = {};

let match;
while ((match = toothRegex.exec(svg)) !== null) {
  const id = match[1];
  const content = match[2];
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  let pathMatch;
  while ((pathMatch = pathRegex.exec(content)) !== null) {
    const d = pathMatch[1];
    const coords = d.match(/-?\d+\.?\d*/g);
    if (coords) {
      for (let i = 0; i < coords.length; i += 2) {
        const x = parseFloat(coords[i]);
        const y = parseFloat(coords[i+1]);
        if (!isNaN(x) && !isNaN(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  
  if (minX !== Infinity) {
    teethData[id] = {
      bbox: { minX, minY, maxX, maxY },
      content: content.trim()
    };
  }
}

console.log(JSON.stringify(teethData, null, 2));
