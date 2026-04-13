
import * as fs from 'fs';
import { createExtractorFromData } from 'node-unrar-js';

async function extract() {
  try {
    const data = fs.readFileSync('ortho chart.rar');
    const extractor = await createExtractorFromData({ data });
    const list = extractor.getFileList();
    console.log('Files in rar:', [...list.fileHeaders].map(h => h.name));
    
    const extracted = extractor.extract();
    for (const file of extracted.files) {
      if (file.fileHeader.name === 'ortho chart.svg') {
        fs.writeFileSync('ortho-chart.svg', file.extraction as Uint8Array);
        console.log('Extracted ortho-chart.svg');
      }
    }
  } catch (err) {
    console.error('Extraction failed:', err);
  }
}

extract();
