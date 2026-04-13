// Quick smoke test for rlsExemptionRegistry
try {
    const r = require('../src/core/rls/rlsExemptionRegistry.js');
    console.log('OK: loaded', r.EXEMPTIONS.length, 'entries');
    console.log(JSON.stringify(r.getStats(), null, 2));
} catch(e) {
    console.error('FAIL:', e.message);
    console.error(e.stack);
}
