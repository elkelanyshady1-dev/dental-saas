/**
 * supportSettings.dto.js — DTO for SupportSettings (Plan E14)
 */

"use strict";

const { DEFAULT_SLA_HOURS } = require("../models/SupportSettings.model");

const SUPPORT_SETTINGS_DTO_VERSION = "1.0.0";

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

function _slaHours(src) {
    if (!src) return { ...DEFAULT_SLA_HOURS };
    return {
        CRITICAL: src.CRITICAL ?? DEFAULT_SLA_HOURS.CRITICAL,
        HIGH:     src.HIGH ?? DEFAULT_SLA_HOURS.HIGH,
        MEDIUM:   src.MEDIUM ?? DEFAULT_SLA_HOURS.MEDIUM,
        LOW:      src.LOW ?? DEFAULT_SLA_HOURS.LOW,
    };
}

function _escalationTarget(t) {
    if (!t) return null;
    return {
        level: t.level,
        role: t.role ?? null,
        email: t.email ?? null,
    };
}

function buildSupportSettingsDTO(settings) {
    if (!settings) return null;
    return {
        slaHoursByPriority: _slaHours(settings.slaHoursByPriority),
        escalationTargets: Array.isArray(settings.escalationTargets)
            ? settings.escalationTargets.map(_escalationTarget).filter(Boolean)
            : [],
        allowedCategories: Array.isArray(settings.allowedCategories)
            ? [...settings.allowedCategories]
            : [],
        autoCloseAfterDays: settings.autoCloseAfterDays ?? 14,
        ticketsPerDayCap: settings.ticketsPerDayCap ?? 100,
        reopenWindowDays: settings.reopenWindowDays ?? 7,
        version: settings.version ?? 0,
        createdAt: iso(settings.createdAt),
        updatedAt: iso(settings.updatedAt),
    };
}

function envelope(data) {
    return {
        success: true,
        version: SUPPORT_SETTINGS_DTO_VERSION,
        data,
    };
}

module.exports = {
    SUPPORT_SETTINGS_DTO_VERSION,
    buildSupportSettingsDTO,
    envelope,
};
