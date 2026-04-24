/**
 * escapeRegex.js — ReDoS Protection Utility
 *
 * Escapes special regex characters in user input before passing to MongoDB $regex.
 * Prevents catastrophic backtracking (ReDoS) from malicious patterns.
 *
 * @param {string} input — Raw user input
 * @returns {string} Escaped string safe for use in RegExp / $regex
 */
"use strict";

function escapeRegex(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = escapeRegex;
