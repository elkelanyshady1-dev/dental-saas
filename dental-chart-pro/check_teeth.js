const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./src/assets/data/teeth_data_refined.json', 'utf8'));

const molars = ['16','17','18','26','27','28','36','37','38','46','47','48'];

molars.forEach(id => {
  const t = data[id];
  if (!t) { console.log(`${id}: NOT FOUND`); return; }
  const keys = Object.keys(t);
  const hasBand = !!t.band;
  const hasTube = !!t.tube;
  console.log(`${id}: keys=[${keys.join(',')}] band=${hasBand}(${t.band?.length??0}) tube=${hasTube}(${t.tube?.length??0})`);
});
