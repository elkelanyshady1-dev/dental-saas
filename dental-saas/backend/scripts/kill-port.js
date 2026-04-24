#!/usr/bin/env node
/**
 * kill-port.js — surgical port-holder kill.
 *
 * Finds the PID listening on a given port (default 5000) and terminates
 * ONLY that process. Unlike `taskkill /F /IM node.exe`, this will not
 * touch Vite, VS Code, Electron apps, test watchers, or any other Node
 * process on the machine.
 *
 * Usage:
 *   node scripts/kill-port.js            # kills whatever holds 5000
 *   node scripts/kill-port.js 5001       # custom port
 */
"use strict";

const { execSync } = require("child_process");

const port = parseInt(process.argv[2] || process.env.PORT || "5000", 10);
const isWin = process.platform === "win32";

function findPidsWindows(p) {
    const out = execSync(`netstat -ano | findstr :${p} | findstr LISTENING`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid)) pids.add(pid);
    }
    return [...pids];
}

function findPidsUnix(p) {
    const out = execSync(`lsof -ti :${p} -sTCP:LISTEN`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(/\s+/).filter(Boolean);
}

let pids = [];
try {
    pids = isWin ? findPidsWindows(port) : findPidsUnix(port);
} catch {
    console.log(`Port ${port} is free (nothing listening).`);
    process.exit(0);
}

if (pids.length === 0) {
    console.log(`Port ${port} is free (nothing listening).`);
    process.exit(0);
}

for (const pid of pids) {
    try {
        if (isWin) execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
        else execSync(`kill -9 ${pid}`);
        console.log(`✔ Killed PID ${pid} (was holding port ${port}).`);
    } catch (err) {
        console.error(`✗ Failed to kill PID ${pid}: ${err.message}`);
        process.exitCode = 1;
    }
}
