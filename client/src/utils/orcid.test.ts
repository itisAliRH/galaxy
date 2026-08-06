import { describe, expect, it } from "vitest";

import { ORCID_FORMAT, orcidUrl, validateOrcid } from "./orcid";

const FORMAT_MESSAGE = "ORCID iD must have the format 0000-0000-0000-0000.";
const CHECKSUM_MESSAGE = "Invalid ORCID iD: checksum mismatch.";

describe("ORCID_FORMAT", () => {
    it("is the canonical placeholder format", () => {
        expect(ORCID_FORMAT).toBe("0000-0000-0000-0000");
    });
});

describe("orcidUrl", () => {
    it("builds the orcid.org profile URL", () => {
        expect(orcidUrl("0000-0002-1825-0097")).toBe("https://orcid.org/0000-0002-1825-0097");
    });
});

describe("validateOrcid", () => {
    it("accepts a valid ORCID iD", () => {
        expect(validateOrcid("0000-0002-1825-0097")).toBeNull();
    });

    it("accepts a valid ORCID iD with an X checksum", () => {
        expect(validateOrcid("0000-0002-9079-593X")).toBeNull();
    });

    it("treats an empty string as valid", () => {
        expect(validateOrcid("")).toBeNull();
    });

    it("treats a whitespace-only string as valid", () => {
        expect(validateOrcid("   ")).toBeNull();
    });

    it("rejects a value that is not ORCID-shaped", () => {
        expect(validateOrcid("not-an-orcid")).toBe(FORMAT_MESSAGE);
    });

    it("rejects an unhyphenated digit string", () => {
        expect(validateOrcid("0000000218250097")).toBe(FORMAT_MESSAGE);
    });

    it("rejects a well-formatted iD with a wrong checksum", () => {
        expect(validateOrcid("0000-0002-1825-0098")).toBe(CHECKSUM_MESSAGE);
    });
});
