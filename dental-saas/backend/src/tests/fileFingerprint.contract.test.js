/**
 * fileFingerprint.contract.test.js — Content-addressed per-file dedup key (H1 final).
 *
 * Verifies that the fingerprint is sha256 of the file BUFFER (not metadata),
 * which is what makes rename-based retries impossible to smuggle past the
 * dedup gate.
 */

"use strict";

const crypto = require("crypto");
const { computeFileFingerprint } = require("../modules/orthodontics/core/utils/fileFingerprint");

function makeFile(buffer, extras = {}) {
    return { buffer, ...extras };
}

describe("computeFileFingerprint — content-hashed (H1 final)", () => {
    test("returns a hex sha256 (64 chars) of the buffer", () => {
        const buf = Buffer.from("hello world");
        const fp = computeFileFingerprint(makeFile(buf));
        expect(fp).toMatch(/^[a-f0-9]{64}$/);
        // exact match to the known sha256 of "hello world"
        const expected = crypto.createHash("sha256").update(buf).digest("hex");
        expect(fp).toBe(expected);
    });

    test("is deterministic — same bytes → same fingerprint", () => {
        const a = computeFileFingerprint(makeFile(Buffer.from("xyz")));
        const b = computeFileFingerprint(makeFile(Buffer.from("xyz")));
        expect(a).toBe(b);
    });

    test("rename does NOT change the fingerprint (H1 intent)", () => {
        const bytes = Buffer.from([1, 2, 3, 4, 5]);
        const a = computeFileFingerprint(makeFile(bytes, { originalname: "front.jpg", mimetype: "image/jpeg", size: 5 }));
        const b = computeFileFingerprint(makeFile(bytes, { originalname: "other.png", mimetype: "image/png",  size: 5 }));
        expect(a).toBe(b);
    });

    test("different bytes → different fingerprint", () => {
        const a = computeFileFingerprint(makeFile(Buffer.from("alpha")));
        const b = computeFileFingerprint(makeFile(Buffer.from("beta")));
        expect(a).not.toBe(b);
    });

    test("throws FINGERPRINT_NO_BUFFER when buffer is absent (no metadata fallback)", () => {
        expect(() => computeFileFingerprint({})).toThrow(/buffer missing/i);
        try { computeFileFingerprint({}); } catch (err) {
            expect(err.code).toBe("FINGERPRINT_NO_BUFFER");
        }
    });

    test("throws when passed null", () => {
        expect(() => computeFileFingerprint(null)).toThrow();
    });

    test("rejects non-Buffer buffer-alikes", () => {
        // A Uint8Array is not a Node Buffer — reject rather than silently accept.
        expect(() => computeFileFingerprint({ buffer: new Uint8Array([1, 2, 3]) })).toThrow(/buffer missing/i);
    });
});
