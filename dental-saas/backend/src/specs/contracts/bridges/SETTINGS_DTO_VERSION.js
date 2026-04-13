/**
 * SETTINGS_DTO_VERSION.js — DTO Contract Version Lock
 * @bridge-layer (LOCKED)
 *
 * Immutable version identifier for the Settings Hub DTO contracts.
 * Every bridge response MUST include this version in the response envelope.
 *
 * RULES:
 *   - DTO structure MUST NOT change without version bump
 *   - Breaking changes require minor/major bump
 *   - Additive (non-breaking) changes require patch bump
 *   - This file is the SSOT for contract versioning
 *
 * @module specs/contracts/bridges/SETTINGS_DTO_VERSION
 */

"use strict";

const SETTINGS_DTO_VERSION = "v1.0.0";

module.exports = { SETTINGS_DTO_VERSION };
