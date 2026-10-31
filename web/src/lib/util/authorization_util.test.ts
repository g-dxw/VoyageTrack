import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ env: { PUBLIC_PRIVATE_INSTANCE: "false" } }));
vi.mock("$app/environment", () => ({ browser: false }));
vi.mock("$env/dynamic/public", () => ({ env: state.env }));
import { isRouteProtected } from "./authorization_util";
const url = (path: string) => new URL(path, "https://voyagetrack.example");

describe("dashboard authorization boundary", () => {
    beforeEach(() => { state.env.PUBLIC_PRIVATE_INSTANCE = "false"; });
    it("protects the dashboard and its child routes on a public instance", () => {
        expect(isRouteProtected(url("/dashboard"))).toBe(true);
        expect(isRouteProtected(url("/dashboard/trails"))).toBe(true);
        expect(isRouteProtected(url("/dashboardish"))).toBe(false);
    });
    it("protects admin pages without matching similarly prefixed public paths", () => {
        expect(isRouteProtected(url("/admin"))).toBe(true);
        expect(isRouteProtected(url("/admin/featured"))).toBe(true);
        expect(isRouteProtected(url("/administrator"))).toBe(false);
    });
    it("keeps homepage and public trail browsing open", () => {
        expect(isRouteProtected(url("/"))).toBe(false);
        expect(isRouteProtected(url("/trails"))).toBe(false);
        expect(isRouteProtected(url("/trail/view/@hiker/publictrail0001"))).toBe(false);
    });
    it("keeps dashboard protected on a private instance while allowing the login page", () => {
        state.env.PUBLIC_PRIVATE_INSTANCE = "true";
        expect(isRouteProtected(url("/dashboard"))).toBe(true);
        expect(isRouteProtected(url("/login"))).toBe(false);
        expect(isRouteProtected(url("/"))).toBe(false);
    });
});
