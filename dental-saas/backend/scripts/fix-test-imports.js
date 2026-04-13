#!/usr/bin/env node
/**
 * fix-test-imports.js — Fix test file model imports to use .default
 */
"use strict";

const fs = require("fs");
const path = require("path");

const testDir = path.resolve(__dirname, "../src/tests");
const files = fs.readdirSync(testDir).filter(f => f.endsWith(".test.js"));

let totalChanges = 0;

files.forEach(f => {
    const fp = path.join(testDir, f);
    let content = fs.readFileSync(fp, "utf-8");
    const re = /require\(\s*(["'`][^"'`]*\/models\/[^"'`]*["'`])\s*\)(?!\.default)/g;
    let n = 0;
    const newContent = content.replace(re, (match, p1) => {
        n++;
        return `require(${p1}).default`;
    });
    if (n > 0) {
        fs.writeFileSync(fp, newContent, "utf-8");
        console.log(`  ✅ ${f}: ${n} imports fixed`);
        totalChanges += n;
    }
});

console.log(`\n  Total: ${totalChanges} test imports fixed`);
