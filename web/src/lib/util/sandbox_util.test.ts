import { describe, expect, it } from "vitest";
import { padSandboxBounds } from "./sandbox_util";

describe("padSandboxBounds", () => {
    it("adds proportional padding around a route", () => {
        expect(padSandboxBounds([10, 20, 12, 24])).toEqual([
            9.6, 19.2, 12.4, 24.8,
        ]);
    });

    it("adds minimum padding to a point-sized route", () => {
        expect(padSandboxBounds([10, 20, 10, 20])).toEqual([
            9.99, 19.99, 10.01, 20.01,
        ]);
    });
});
