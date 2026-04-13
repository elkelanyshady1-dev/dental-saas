#!/usr/bin/env node

const { spawn } = require("child_process");

const args = process.argv.slice(2);

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["gemini", ...args],
  {
    stdio: "inherit",
    shell: true,
  }
);

child.on("exit", (code) => {
  process.exit(code);
});
