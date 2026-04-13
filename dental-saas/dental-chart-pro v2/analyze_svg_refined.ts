
import * as fs from 'fs';

const svg = fs.readFileSync('src/assets/svg/ortho-chart-v2.svg', 'utf8');

function getBoundingBox(content: string) {
  const pathRegex = /d="([\s\S]*?)"/g;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    const d = match[1];
    // Match absolute M or L commands: M x,y or L x,y or M x y
    const absoluteCommands = d.match(/[ML]\s*-?\d+(\.\d+)?[\s,]+-?\d+(\.\d+)?/g);
    if (absoluteCommands) {
      absoluteCommands.forEach(cmd => {
        const parts = cmd.substring(1).trim().split(/[\s,]+/).map(Number);
        if (parts.length >= 2) {
          const x = parts[0];
          const y = parts[1];
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      });
    }
  }
  
  // Also check for rect, circle, etc. if needed
  const rectRegex = /<rect[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*width="([\d.-]+)"[^>]*height="([\d.-]+)"/g;
  while ((match = rectRegex.exec(content)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const w = parseFloat(match[3]);
    const h = parseFloat(match[4]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  return { minX, minY, maxX, maxY };
}

const teeth: Record<string, any> = {};

// Find all tooth groups
const toothIds = svg.match(/id="tooth_(\d+)"/g)?.map(m => m.match(/\d+/)?.[0]) || [];
const uniqueToothIds = Array.from(new Set(toothIds));

for (const id of uniqueToothIds) {
  const startTag = `<g id="tooth_${id}">`;
  const startIndex = svg.indexOf(startTag);
  if (startIndex === -1) continue;
  
  // Find matching closing tag
  let depth = 0;
  let currentIndex = startIndex;
  let endIndex = -1;
  
  while (currentIndex < svg.length) {
    const nextOpen = svg.indexOf('<g', currentIndex + 1);
    const nextClose = svg.indexOf('</g>', currentIndex + 1);
    
    if (nextClose === -1) break;
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      currentIndex = nextOpen;
    } else {
      depth--;
      currentIndex = nextClose;
      if (depth === -1) {
        endIndex = nextClose + 4;
        break;
      }
    }
  }
  
  if (endIndex !== -1) {
    const content = svg.substring(startIndex, endIndex);
    
    // Extract bracket, body, band, and tube
    const bracketMatch = content.match(/<g id="tooth_\d+_bracket">([\s\S]*?)<\/g>/);
    const bodyMatch = content.match(/<g id="tooth_\d+_body">([\s\S]*?)<\/g>/);
    const bandMatch = content.match(/<g id="tooth_\d+_band">([\s\S]*?)<\/g>/);
    const tubeMatch = content.match(/<g id="tooth_\d+_tube">([\s\S]*?)<\/g>/);
    
    const bracketContent = bracketMatch ? bracketMatch[1] : '';
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    const bandContent = bandMatch ? bandMatch[1] : '';
    const tubeContent = tubeMatch ? tubeMatch[1] : '';
    
    const bodyBBox = getBoundingBox(bodyContent);
    
    teeth[id] = {
      body: bodyContent,
      bracket: bracketContent,
      band: bandContent,
      tube: tubeContent,
      bbox: bodyBBox
    };
  }
}

fs.writeFileSync('teeth_data_refined.json', JSON.stringify(teeth, null, 2));
console.log('Refined data saved to teeth_data_refined.json');
