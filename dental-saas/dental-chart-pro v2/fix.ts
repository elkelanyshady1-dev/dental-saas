import fs from 'fs';

const data = JSON.parse(fs.readFileSync('teeth_data_refined.json', 'utf8'));
const body26 = data['26'].body;
if (!body26.endsWith('</g>\n        ')) {
  data['26'].body = body26 + '</g>\n        ';
  fs.writeFileSync('teeth_data_refined.json', JSON.stringify(data, null, 2));
  console.log('Fixed tooth 26');
} else {
  console.log('Already fixed');
}
