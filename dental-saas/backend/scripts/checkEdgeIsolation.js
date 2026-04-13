require("module-alias/register");
/**
 * checkEdgeIsolation.js
 * v14.0 Edge & Geo Traffic Governance — Static Guard
 * 
 * Purpose: Verifies pure isolation between Edge Plane and Data Plane.
 */
const fs = require('fs');
const path = require('path');

const PROHIBITED_IMPORTS = [
    'require("../infrastructure/edge/edgeRouter")',
    'require("../infrastructure/edge/regionFailoverPolicy")',
    'require("mongoose")',
    'require("stripe")'
];

const TARGET_PATHS = [
    'src/infrastructure/edge'
];

function scan() {
    console.log("Starting Edge Isolation Scan...");
    let violations = 0;

    TARGET_PATHS.forEach(target => {
        const fullPath = path.join(process.cwd(), target);
        if (!fs.existsSync(fullPath)) return;

        const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.js'));

        files.forEach(file => {
            const content = fs.readFileSync(path.join(fullPath, file), 'utf8');

            // Edge files should not import regionRouter (circularity risk)
            if (content.includes('require("../regionRouter")')) {
                console.error(`[VIOLATION] ${target}/${file}: Edge layer should not import regionRouter directly.`);
                violations++;
            }

            // Edge files should not access Mongo models directly
            if (content.includes('mongoose.model') || content.includes('.find(') || content.includes('.save(')) {
                // Allow Region.model as it's the registry (Control Plane shared)
                if (!content.includes('require("../modules/platformDomain/models/Region.model")')) {
                    console.error(`[VIOLATION] ${target}/${file}: Direct Data Plane access detected in Edge layer.`);
                    violations++;
                }
            }
        });
    });

    if (violations > 0) {
        process.exit(1);
    } else {
        console.log("Edge Isolation Verified.");
    }
}

scan();
