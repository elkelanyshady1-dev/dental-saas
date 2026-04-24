/**
 * imagePoolPhoto.schema.test.js — Contract tests for the new photo-subdocument
 * fields added by the bulk-upload hardening pass (TDS H1 + observability).
 *
 * Verifies that:
 *   - fingerprint    (per-file dedup key)
 *   - uploadedBy     (actor — for post-hoc attribution)
 *   - uploadTraceId  (cross-reference with request logs)
 * are all present on every photo record the OrthodonticCase model can hold.
 */

"use strict";

describe("OrthodonticCase.imagePool photo subdoc — new bulk-upload fields", () => {
    const OrthodonticCase = require("../modules/orthodontics/models/orthodonticCase.model").default;
    const schema = OrthodonticCase.schema;

    // Resolve the nested path: workflowData → recordSets → imagePool → photo
    function photoPath(field) {
        return `workflowData.recordSets.imagePool.${field}`;
    }

    test("fingerprint field exists, string, indexed, null default", () => {
        const f = schema.path(photoPath("fingerprint"));
        expect(f).toBeDefined();
        expect(f.instance).toBe("String");
        expect(f.options.index).toBe(true);
        expect(f.defaultValue).toBe(null);
    });

    test("uploadedBy field exists, string, null default", () => {
        const f = schema.path(photoPath("uploadedBy"));
        expect(f).toBeDefined();
        expect(f.instance).toBe("String");
        expect(f.defaultValue).toBe(null);
    });

    test("uploadTraceId field exists, string, null default", () => {
        const f = schema.path(photoPath("uploadTraceId"));
        expect(f).toBeDefined();
        expect(f.instance).toBe("String");
        expect(f.defaultValue).toBe(null);
    });

    test("storageKey field is still present (delete-path locator)", () => {
        const f = schema.path(photoPath("storageKey"));
        expect(f).toBeDefined();
        expect(f.instance).toBe("String");
    });

    test("deletedAt is still present (soft-delete guard)", () => {
        const f = schema.path("workflowData.recordSets.imagePool.deletedAt");
        expect(f).toBeDefined();
        expect(f.instance).toBe("Date");
        expect(f.defaultValue).toBe(null);
    });
});
