/**
 * assertLabDTO.js — Lab Domain Frontend Runtime DTO Guard
 *
 * Mirrors assertDTO.js pattern for patient domain.
 * Validates that lab responses conform to the DTO contract.
 *
 * PLANE: Org only. No cross-plane imports.
 */

const IS_DEV = import.meta.env?.DEV ?? false;

/**
 * assertLabCaseDTO — validates lab case objects have required fields.
 * @param {object|null} raw — lab case from API
 * @param {string} [caller] — component name for debugging
 * @returns {object|null}
 */
export function assertLabCaseDTO(raw, caller = "unknown") {
    if (!raw) return null;

    // INV-LAB-DTO-1: Must have caseCode
    if (!raw.caseCode) {
        const msg = `[assertLabCaseDTO] caseCode missing in ${caller}`;
        if (IS_DEV) console.error(msg, raw);
    }

    // INV-LAB-DTO-3: cost must be numeric
    if (typeof raw.cost !== "number") {
        const msg = `[assertLabCaseDTO] cost is not numeric in ${caller}`;
        if (IS_DEV) console.warn(msg, raw);
    }

    return raw;
}

/**
 * assertLabPartnerDTO — validates lab partner objects.
 */
export function assertLabPartnerDTO(raw, caller = "unknown") {
    if (!raw) return null;

    if (!raw.displayName && !raw.name) {
        const msg = `[assertLabPartnerDTO] displayName/name missing in ${caller}`;
        if (IS_DEV) console.error(msg, raw);
    }

    return raw;
}

/**
 * assertLabClaimDTO — validates lab claim objects.
 */
export function assertLabClaimDTO(raw, caller = "unknown") {
    if (!raw) return null;

    if (typeof raw.cost !== "number") {
        const msg = `[assertLabClaimDTO] cost is not numeric in ${caller}`;
        if (IS_DEV) console.warn(msg, raw);
    }

    return raw;
}
