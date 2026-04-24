"use strict";
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("model-ownership.json", "utf8"));

console.log("─── 1 UNKNOWN ───");
for (const [f, v] of Object.entries(m.models)) {
    if (v.plane === "unknown") console.log("   " + v.modelName + " <= " + f);
}

console.log("\n─── " + m.warnings.length + " WARNINGS (no modelName extracted) ───");
for (const w of m.warnings) {
    const parts = w.file.split(/[\/\\]src[\/\\]/);
    const rel = "src/" + (parts[1] || w.file);
    console.log("   " + w.reason + " <= " + rel);
}

console.log("\n─── Last 40 path-inferred ───");
const inferred = Object.entries(m.models).filter(e => !e[1].rule.startsWith("explicit:"));
for (const [f, v] of inferred.slice(-40)) {
    const rel = f.replace(/^backend\//, "").replace(/^src\//, "");
    console.log("   [" + v.plane.padEnd(8) + "] " + v.modelName.padEnd(32) + " <= " + rel);
}
