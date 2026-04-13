const path = require("path");
const mod = require(path.join(__dirname, "..", "src", "core", "rls", "aggregateSecurity"));
console.log("Module loaded successfully");
console.log("Exports:", Object.keys(mod).join(", "));

// Test 1: clonePipeline
const orig = [{ $match: { status: "active" } }];
const cloned = mod.clonePipeline(orig);
cloned[0].$match.status = "inactive";
console.log("clonePipeline: " + (orig[0].$match.status === "active" ? "PASS" : "FAIL"));

// Test 2: hashPipeline  
const h1 = mod.hashPipeline([{$match:{a:1}}]);
const h2 = mod.hashPipeline([{$match:{a:1}}]);
console.log("hashPipeline: " + (h1 === h2 && h1.length === 16 ? "PASS" : "FAIL"));

// Test 3: secureLookup (simple)
const s = mod.secureLookup({$lookup:{from:"patients",localField:"pId",foreignField:"_id",as:"p"}});
console.log("secureLookup (simple): " + (s.$lookup.pipeline ? "PASS" : "FAIL"));

// Test 4: secureLookup (exempt)
const e = mod.secureLookup({$lookup:{from:"roles",localField:"rId",foreignField:"_id",as:"r"}});
console.log("secureLookup (exempt): " + (!e.$lookup.pipeline ? "PASS" : "FAIL"));

// Test 5: deepSecurePipeline
const d = mod.deepSecurePipeline([{$match:{a:1}},{$lookup:{from:"patients",localField:"pId",foreignField:"_id",as:"p"}}]);
console.log("deepSecurePipeline: " + (d[1].$lookup.pipeline ? "PASS" : "FAIL"));

// Test 6: hardenPipeline
const o = [{$lookup:{from:"x",localField:"a",foreignField:"b",as:"c"}}];
const oCopy = JSON.stringify(o);
const r = mod.hardenPipeline(o);
console.log("hardenPipeline immutable: " + (JSON.stringify(o) === oCopy ? "PASS" : "FAIL"));
console.log("hardenPipeline hash: " + (r.hash.length === 16 ? "PASS" : "FAIL"));

console.log("\nDone.");
process.exit(0);
