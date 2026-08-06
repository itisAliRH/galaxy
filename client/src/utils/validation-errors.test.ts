import { describe, expect, it } from "vitest";

import { condenseValidationMessage, validationErrorMessage } from "./validation-errors";

describe("condenseValidationMessage", () => {
    it("strips the Value error prefix and the location tuple", () => {
        expect(
            condenseValidationMessage(
                "Value error, ORCID iD must have the format 0000-0000-0000-0000. in ('body', 'orcid')",
            ),
        ).toBe("ORCID iD must have the format 0000-0000-0000-0000.");
    });

    it("strips a multi-element location tuple with numeric indices", () => {
        expect(condenseValidationMessage("Value error, Invalid URL. in ('body', 'links', 0, 'url')")).toBe(
            "Invalid URL.",
        );
    });

    it("leaves a normal message untouched", () => {
        expect(condenseValidationMessage("History is not accessible.")).toBe("History is not accessible.");
    });
});

describe("validationErrorMessage", () => {
    it("condenses a string err_msg", () => {
        expect(validationErrorMessage({ err_msg: "Value error, X in ('body', 'orcid')" })).toBe("X");
    });

    it("falls back to the default message for a non-string err_msg", () => {
        expect(validationErrorMessage({ err_msg: { nested: true } })).toBe("Request failed.");
    });
});
