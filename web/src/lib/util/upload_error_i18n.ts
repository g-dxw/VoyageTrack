const uploadErrorKeys = new Map<string, string>([
    ["missing file", "error-reading-file"],
    ["empty file", "error-reading-file"],
    ["invalid file", "error-reading-file"],
    ["unauthorized", "error-sign-in-required"],
    ["forbidden", "error-forbidden"],
    ["invalid_params", "error-invalid-request"],
    ["failed to create record", "error-saving-trail"],
    ["failed to update record", "error-saving-trail"],
    ["error checking for duplicates", "error-checking-upload-duplicates"],
]);

// Keep raw server diagnostics in the upload store. The UI only renders known
// messages or a localized fallback, so unexpected backend text stays out of it.
export function uploadErrorMessageKey(message?: string | null): string {
    const normalized = message?.trim().replace(/\.$/, "").toLowerCase() ?? "";
    return uploadErrorKeys.get(normalized) ?? "error-uploading-file";
}
