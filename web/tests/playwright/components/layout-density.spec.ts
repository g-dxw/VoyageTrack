import { randomUUID } from "node:crypto";
import { expect, test } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
test.use({ baseURL });

test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
});

for (const mobile of [false, true]) {
    const device = mobile ? "mobile" : "desktop";
    test(`${device} public pages use compact controls and retain all content`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 375, height: 812 });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
        expect((await page.locator("[data-app-header]").boundingBox())?.height).toBe(mobile ? 72 : 80);
        const hero = await page.locator(".hero").boundingBox();
        const trails = await page.locator("#trails").boundingBox();
        const about = await page.locator("#about").boundingBox();
        expect(trails!.y).toBeGreaterThanOrEqual(hero!.y + hero!.height - 1);
        expect(about!.y).toBeGreaterThan(trails!.y);
        const search = page.locator('input[name="q"]');
        expect((await search.boundingBox())?.height).toBe(mobile ? 52 : 48);
        if (mobile) expect((await page.locator("footer").boundingBox())?.height).toBeLessThan(380);
        await page.screenshot({ path: `test-results/density-home-${device}.png` });

        for (const route of ["/login", "/register"]) {
            await page.goto(route);
            await expect(page.locator('input[type="password"]')).toBeVisible();
            const form = await page.locator(".login-panel").boundingBox();
            expect(form!.y + form!.height).toBeLessThan(mobile ? 760 : 720);
            const username = await page.locator('input[name="username"]').boundingBox();
            expect(username?.height).toBeGreaterThanOrEqual(mobile ? 44 : 36);
            expect(username?.height).toBeLessThanOrEqual(mobile ? 46 : 38);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        await page.screenshot({ path: `test-results/density-register-${device}.png` });
        for (const route of ["/trails", "/lists", "/map"]) {
            await page.goto(route);
            await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
            await expect(page.locator("main")).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        const map = await page.locator("#trail-map").boundingBox();
        expect(map!.y).toBeGreaterThanOrEqual(mobile ? 72 : 80);
        expect(map!.y + map!.height).toBeLessThanOrEqual(mobile ? 812 : 720);
        await page.screenshot({ path: `test-results/density-map-${device}.png` });
    });

    test(`${device} signed-in settings are reachable without a navigation wall`, async ({ page, context }) => {
        if (mobile) await page.setViewportSize({ width: 375, height: 812 });
        const username = `density${randomUUID().replaceAll("-", "").slice(0, 12)}`;
        const password = randomUUID();
        let userId: string | undefined;
        const settingsWrites: string[] = [];
        page.on("request", request => {
            if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/v1/settings")) {
                settingsWrites.push(request.url());
            }
        });
        try {
            // This unique account is owned by this test only. Never reuse/delete
            // the project's Test account or any human's session/records.
            const created = await context.request.put("/api/v1/user", {
                data: { username, email: `${username}@example.com`, password, passwordConfirm: password },
            });
            expect(created.ok(), "Create an isolated local UI review account").toBeTruthy();
            const record = await created.json();
            expect(record.username).toBe(username);
            userId = record.id;
            await page.goto("/login");
            await expect(page.locator('input[type="password"]')).toBeVisible();
            await page.locator('input[name="username"]').fill(username);
            await page.locator('input[name="password"]').fill(password);
            await page.getByRole("button", { name: "登录", exact: true }).click();
            await page.waitForURL(new URL("/", baseURL).href);
            await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
            const authenticated = await context.request.get(`/api/v1/user/${userId}`);
            expect(authenticated.ok()).toBeTruthy();
            expect((await authenticated.json()).id).toBe(userId);
            if (!mobile) await expect(page.getByRole("button", { name: "打开用户菜单", exact: true })).toBeVisible();

            const metrics: { route: string; contentTop: number; contentHeight: number }[] = [];
            await page.goto("/settings/profile");
            await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
            for (const route of ["profile", "account", "privacy", "language", "notifications", "map", "export", "categories", "plugins"]) {
                if (route !== "profile") {
                    if (mobile) {
                        await page.getByRole("combobox", { name: "设置", exact: true }).selectOption(`/settings/${route}`);
                    } else {
                        await page.locator(`nav[aria-label="设置"] a[href="/settings/${route}"]`).click();
                    }
                    await expect(page).toHaveURL(new URL(`/settings/${route}`, baseURL).href);
                }
                const content = page.locator(".settings-content");
                await expect(content).toBeVisible();
                await expect(content.locator("h2, h3").first()).toBeVisible();
                const bounds = await content.boundingBox();
                metrics.push({ route, contentTop: bounds!.y, contentHeight: bounds!.height });
                expect(bounds!.y).toBeLessThan(mobile ? 240 : 130);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
                if (route === "language") await page.screenshot({ path: `test-results/density-settings-${device}.png` });
            }
            console.log(`density-${device}: ${JSON.stringify(metrics)}`);
            if (mobile) {
                const navigation = page.getByRole("combobox", { name: "设置", exact: true });
                await navigation.selectOption("/settings/profile");
                await expect(page).toHaveURL(/\/settings\/profile$/);
            }
            await page.goto("/trail/edit/new");
            await expect(page.locator("main")).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.goto("/lists/edit/new");
            await expect(page.locator("main")).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            expect(settingsWrites).toEqual([]);
        } finally {
            if (userId) {
                const login = await context.request.post("/api/v1/auth/login", { data: { username, password } });
                expect(login.ok(), "Authenticate only the test-owned account for cleanup").toBeTruthy();
                const deleted = await context.request.delete(`/api/v1/user/${userId}`);
                expect(deleted.ok(), "Delete only the temporary local review account").toBeTruthy();
            }
        }
    });
}
