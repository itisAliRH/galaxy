/**
 * Client-side ORCID iD validation.
 *
 * Mirrors the backend validator `_validate_orcid` in `lib/galaxy/schema/schema.py`:
 * format check via `^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$` plus the ISO 7064 11,2 checksum.
 */

/** Canonical ORCID iD format, for use in input placeholders and hint text. */
export const ORCID_FORMAT = "0000-0000-0000-0000";

const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/**
 * Build the public orcid.org URL for an ORCID iD.
 *
 * @param orcid - An ORCID iD in `0000-0000-0000-0000` format.
 * @returns The `https://orcid.org/...` profile URL for the iD.
 */
export function orcidUrl(orcid: string): string {
    return `https://orcid.org/${orcid}`;
}

/**
 * Validate an ORCID iD, mirroring the backend validator so users get the same
 * feedback before submitting.
 *
 * An empty or whitespace-only value is considered valid (the field is optional).
 *
 * @param value - The raw user input.
 * @returns A user-facing error message, or `null` when the value is valid.
 */
export function validateOrcid(value: string): string | null {
    if (!value.trim()) {
        return null;
    }
    if (!ORCID_PATTERN.test(value)) {
        return `ORCID iD must have the format ${ORCID_FORMAT}.`;
    }
    const digits = value.replace(/-/g, "");
    let total = 0;
    for (const char of digits.slice(0, -1)) {
        total = (total + Number(char)) * 2;
    }
    const checksum = (12 - (total % 11)) % 11;
    const expected = checksum === 10 ? "X" : String(checksum);
    if (digits[digits.length - 1] !== expected) {
        return "Invalid ORCID iD: checksum mismatch.";
    }
    return null;
}
