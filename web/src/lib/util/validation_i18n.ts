type Translate = (key: string, options?: { values: Record<string, number> }) => string;

/** Translate framework-generated validation at the UI boundary, leaving API schemas unchanged. */
export function translateValidationError(error: string | string[] | null | undefined, translate: Translate): string {
    const message = Array.isArray(error) ? error[0] : error;
    if (!message) return "";

    const simple: Record<string, string> = {
        Required: "required",
        "Invalid email": "not-a-valid-email-address",
        "Invalid url": "not-a-valid-url",
        "Invalid date": "invalid-date",
        "Invalid datetime": "invalid-date",
        "Invalid input": "validation-invalid-value",
        Invalid: "validation-invalid-value",
    };
    if (Object.hasOwn(simple, message)) return translate(simple[message]);

    const length = /^String must contain (at least|at most|exactly) (\d+) character\(s\)$/.exec(message);
    if (length) {
        const key = length[1] === "at least" ? "must-be-at-least-n-characters-long" :
            length[1] === "at most" ? "must-be-at-most-n-characters-long" : "validation-text-exact-length";
        return translate(key, { values: { n: Number(length[2]) } });
    }

    const number = /^Number must be (greater|less) than( or equal to)? (-?\d+(?:\.\d+)?)$/.exec(message);
    if (number) {
        const bound = number[1] === "greater" ? "min" : "max";
        const comparison = number[2] ? "inclusive" : "exclusive";
        return translate(`validation-number-${bound}-${comparison}`, { values: { n: Number(number[3]) } });
    }

    if (/^Expected number, received /.test(message)) return translate("validation-invalid-number");
    if (/^Expected .+, received |^Invalid enum value\./.test(message)) return translate("validation-invalid-value");

    // Existing form messages may already be translated, while schemas also supply i18n keys.
    return /\s|\p{Script=Han}/u.test(message) ? message : translate(message);
}
