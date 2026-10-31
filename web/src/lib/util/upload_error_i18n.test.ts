import { describe, expect, it } from "vitest";
import en from "$lib/i18n/locales/en.json";
import zh from "$lib/i18n/locales/zh.json";
import { uploadErrorMessageKey } from "./upload_error_i18n";

describe("uploadErrorMessageKey", () => {
    it.each([
        ["Missing file", "error-reading-file"],
        ["Empty file", "error-reading-file"],
        ["Invalid file", "error-reading-file"],
        ["Unauthorized", "error-sign-in-required"],
        ["Forbidden", "error-forbidden"],
        ["invalid_params", "error-invalid-request"],
        ["Failed to create record.", "error-saving-trail"],
        ["Failed to update record.", "error-saving-trail"],
        ["Error checking for duplicates", "error-checking-upload-duplicates"],
    ])("maps the known upload response %s", (message, key) => {
        expect(uploadErrorMessageKey(message)).toBe(key);
    });

    it("normalizes incidental casing, whitespace and trailing punctuation", () => {
        expect(uploadErrorMessageKey("  INVALID FILE.  ")).toBe("error-reading-file");
    });

    it.each([
        undefined,
        null,
        "",
        "Upload failed",
        "Internal Server Error",
        "Private diagnostic: token=secret",
        "Invalid file /private/source.gpx",
        "toString",
        "constructor",
        "__proto__",
    ])("uses a generic localized fallback for %s without leaking diagnostics", (message) => {
        expect(uploadErrorMessageKey(message)).toBe("error-uploading-file");
    });

    it("provides readable Chinese and English for known responses and the fallback", () => {
        for (const message of [
            "Invalid file",
            "Unauthorized",
            "Forbidden",
            "invalid_params",
            "Failed to create record.",
            "Error checking for duplicates",
            "Unknown backend diagnostic",
        ]) {
            const key = uploadErrorMessageKey(message);
            expect((en as Record<string, unknown>)[key]).toEqual(expect.any(String));
            expect((zh as Record<string, unknown>)[key]).toMatch(/\p{Script=Han}/u);
        }
    });
});
