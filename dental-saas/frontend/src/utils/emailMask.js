/**
 * emailMask.js — Consistent email masking helper.
 *
 * Shows the first character of the local-part plus the full domain:
 *   j••@example.com       (john@example.com)
 *   m••@hospital.com      (m@hospital.com)
 *   a••@example.co.uk     (abc@example.co.uk)
 *
 * Unlike a percentage-based mask, this hides length, so a 2-letter and
 * a 20-letter address look the same. Safe to show on public signup /
 * verify screens where we don't want to leak much about the account.
 */
export function maskEmail(email) {
    if (!email || typeof email !== "string") return "";
    const at = email.indexOf("@");
    if (at < 1) return email; // no "@" or starts with "@" — nothing useful to mask
    const local = email.slice(0, at);
    const domain = email.slice(at); // includes the "@"
    const head = local[0] || "";
    return `${head}\u2022\u2022${domain}`;
}

export default maskEmail;
