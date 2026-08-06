/**
 * Helpers for turning FastAPI/Pydantic validation error messages into user-facing text.
 *
 * Galaxy's API layer serializes Pydantic validation errors into `err_msg` strings like
 * `Value error, ORCID iD must have the format 0000-0000-0000-0000. in ('body', 'orcid')`.
 * The `Value error, ` prefix and the trailing ` in ('<loc>', ...)` location tuple are
 * internal noise that should not leak into the UI.
 */
import { errorMessageAsString } from "@/utils/simple-error";

/** Matches a trailing Pydantic location tuple such as ` in ('body', 'orcid')` or ` in ('body', 'links', 0, 'url')`. */
const LOCATION_TAIL_PATTERN = /\s+in \(\s*'[^']*'(?:\s*,\s*(?:'[^']*'|\d+))*\s*,?\s*\)$/;

const VALUE_ERROR_PREFIX = "Value error, ";

/**
 * Strip internal Pydantic noise from a validation error message.
 *
 * Removes a trailing ` in ('<loc>', ...)` location tuple and a leading
 * `Value error, ` prefix. Other strings are returned unchanged.
 *
 * @param message - The raw error message, typically from an API `err_msg` field.
 * @returns The condensed, user-facing message.
 */
export function condenseValidationMessage(message: string): string {
    let condensed = message.replace(LOCATION_TAIL_PATTERN, "");
    if (condensed.startsWith(VALUE_ERROR_PREFIX)) {
        condensed = condensed.slice(VALUE_ERROR_PREFIX.length);
    }
    return condensed;
}

/**
 * Extract a user-facing message from an API error, condensing Pydantic validation noise.
 *
 * Delegates to {@link errorMessageAsString} and condenses the result via
 * {@link condenseValidationMessage}. When `errorMessageAsString` yields a
 * non-string (its `err_msg` source can be an object), the default message is returned.
 *
 * @param e - The caught error (axios error, API response, `Error`, string, ...).
 * @param defaultMessage - Fallback when no usable string message can be extracted.
 * @returns A condensed, user-facing error message.
 */
export function validationErrorMessage(e: unknown, defaultMessage = "Request failed."): string {
    const message = errorMessageAsString(e, defaultMessage);
    if (typeof message !== "string") {
        return defaultMessage;
    }
    return condenseValidationMessage(message);
}
