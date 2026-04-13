/**
 * routerTopologyAudit.js
 * v19.3 — Startup Router Topology Self-Audit
 *
 * Reads the router registry and:
 * 1. Prints all mount paths to the boot log
 * 2. Detects nested mounts (e.g. /api/platform/users under /api/platform)
 * 3. In STRICT mode, throws on detected nesting — preventing server start
 *
 * Call once in app.js AFTER all app.use() router mounts.
 * Zero runtime overhead — runs only on boot.
 */

const { getRegisteredRouters } = require("./routerRegistry");
const STRICT_TOPOLOGY = process.env.ROUTE_TOPOLOGY_STRICT === "true";

function auditRouterTopology() {
    const routers = getRegisteredRouters();

    console.log("\n[ROUTE TOPOLOGY AUDIT]");
    routers.forEach(r => {
        console.log(`  - ${r.name.padEnd(40)} @ ${r.mountPath}`);
    });

    // Detect nested mount paths (e.g. /api/platform/users under /api/platform)
    const conflicts = [];
    const mountPaths = routers.map(r => r.mountPath);

    routers.forEach(r => {
        mountPaths.forEach(base => {
            if (r.mountPath !== base && r.mountPath.startsWith(base + "/")) {
                conflicts.push({ router: r.name, mount: r.mountPath, nestedUnder: base });
            }
        });
    });

    if (conflicts.length > 0) {
        conflicts.forEach(c => {
            const msg = `[TopologyWarning] "${c.router}" @ ${c.mount} is nested under ${c.nestedUnder}`;
            if (STRICT_TOPOLOGY) {
                throw new Error(`[ROUTE TOPOLOGY] Nested mount conflict detected: ${c.mount} under ${c.nestedUnder}`);
            }
            console.warn(msg);
        });
    } else {
        console.log("  [No nested mount conflicts detected]");
    }

    console.log("[ROUTE TOPOLOGY AUDIT COMPLETE]\n");
}

module.exports = { auditRouterTopology };
