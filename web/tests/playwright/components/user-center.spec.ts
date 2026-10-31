import { randomUUID } from "node:crypto";
import { request as playwrightRequest, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { expect, test, type Page } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
const pocketbaseURL = process.env.WANDERER_TEST_POCKETBASE_URL ?? "http://127.0.0.1:8090";

type FixtureAccount = {
    id: string;
    username: string;
    password: string;
    token: string;
    actorID: string;
    native: APIRequestContext;
    trailIDs: string[];
};

// These tests own every account/record they create and never use the legacy
// shared Test account. Native PB signup avoids the web verification-mail action.
function assertLocalTarget() {
    for (const origin of [baseURL, pocketbaseURL]) {
        expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(origin).hostname);
    }
}

async function createAccount(accounts: FixtureAccount[]): Promise<FixtureAccount> {
    assertLocalTarget();
    const username = `center${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    const password = randomUUID();
    const native = await playwrightRequest.newContext({ baseURL: pocketbaseURL });
    const created = await native.post("/api/collections/users/records", {
        data: { username, email: `${username}@example.invalid`, password, passwordConfirm: password },
    });
    expect(created.ok(), "Create only a unique local test-owned account without sending verification mail").toBe(true);
    const record = await created.json();
    expect(record.username).toBe(username);
    expect(record.id).toMatch(/^[a-zA-Z0-9]{15}$/);
    const account: FixtureAccount = { id: record.id, username, password, native, token: "", actorID: "", trailIDs: [] };
    accounts.push(account);
    const auth = await native.post("/api/collections/users/auth-with-password", { data: { identity: username, password } });
    expect(auth.ok(), "Authenticate the test-owned native account for fixture cleanup").toBe(true);
    account.token = (await auth.json()).token;
    const actors = await native.get("/api/collections/activitypub_actors/records", {
        params: { filter: `user="${account.id}"` }, headers: { Authorization: account.token },
    });
    expect(actors.ok()).toBe(true);
    const actorRecords = (await actors.json()).items;
    expect(actorRecords).toHaveLength(1);
    expect(actorRecords[0].user).toBe(account.id);
    account.actorID = actorRecords[0].id;
    return account;
}

async function createTrail(account: FixtureAccount, api: APIRequestContext, name: string, publicTrail: boolean, category?: string) {
    const response = await api.put("/api/v1/trail", {
        data: {
            name, public: publicTrail, completed: false, author: account.actorID,
            ...(category ? { category } : {}),
            photos: [], tags: [], difficulty: "easy", distance: 4200, elevation_gain: 240,
        },
    });
    expect(response.ok(), "Create a test-owned metadata-only route, without GPX or real hiking claims").toBe(true);
    const record = await response.json();
    expect(record.author).toBe(account.actorID);
    account.trailIDs.push(record.id);
    return record;
}

async function cleanupAccounts(accounts: FixtureAccount[]) {
    const failures: string[] = [];
    for (const account of accounts.reverse()) {
        try {
            // Refresh only this account's token; no human/shared identity is used.
            const auth = await account.native.post("/api/collections/users/auth-with-password", {
                data: { identity: account.username, password: account.password },
            });
            if (!auth.ok()) { failures.push("test account cleanup authentication"); continue; }
            account.token = (await auth.json()).token;
            const headers = { Authorization: account.token };
            for (const id of account.trailIDs) {
                const removed = await account.native.delete(`/api/collections/trails/records/${id}`, { headers });
                if (!removed.ok()) failures.push("test-owned trail cleanup");
            }
            const removed = await account.native.delete(`/api/collections/users/records/${account.id}`, { headers });
            if (!removed.ok()) failures.push("test-owned account cleanup");
        } finally {
            await account.native.dispose();
        }
    }
    expect(failures, "Remove only entities created by this test").toEqual([]);
}

async function loginThroughUI(page: Page, account: FixtureAccount) {
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.locator('input[name="username"]').fill(account.username);
    await page.locator('input[name="password"]').fill(account.password);
    const response = page.waitForResponse("**/api/v1/auth/login");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
}

async function openUserCenter(page: Page, mobile: boolean) {
    if (mobile) {
        await page.getByRole("button", { name: "展开或收起导航", exact: true }).click();
        await page.getByRole("link", { name: "用户中心", exact: true }).click();
    } else {
        await page.getByRole("button", { name: "打开用户菜单", exact: true }).click();
        await page.locator(".menu-item").getByText("用户中心", { exact: true }).click();
    }
    await expect(page).toHaveURL(new URL("/dashboard", baseURL).href);
    await expect(page.getByRole("heading", { name: "用户中心", level: 1, exact: true })).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Deterministic external avatars keep these ownership tests independent of
    // third-party network availability. Actual page/components still render.
    await page.route("https://api.dicebear.com/**", route => route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#365c43"/></svg>',
    }));
});

test("anonymous visitors must sign in before opening the user center", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?r=\/dashboard$/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByTestId("dashboard-trail")).toHaveCount(0);
});

for (const mobile of [false, true]) {
    test(`${mobile ? "mobile" : "desktop"} public home stays public and user center lists every owned route`, async ({ page, context, browser }) => {
        test.setTimeout(120000);
        const accounts: FixtureAccount[] = [];
        let otherContext: BrowserContext | undefined;
        const feedRequests: string[] = [];
        page.on("request", request => {
            if (new URL(request.url()).pathname.startsWith("/api/v1/feed")) feedRequests.push(request.url());
        });
        if (mobile) await page.setViewportSize({ width: 375, height: 812 });
        try {
            await page.goto("/");
            await expect(page.locator(".hero h1")).toHaveText("把路线留住，把风景分享。");
            const publicHeading = await page.locator(".hero h1").textContent();
            const publicDescription = await page.locator(".hero p").first().textContent();
            const owner = await createAccount(accounts);
            const outsider = await createAccount(accounts);
            await loginThroughUI(page, owner);
            await expect(page.locator(".hero h1")).toHaveText(publicHeading ?? "");
            await expect(page.locator(".hero p").first()).toHaveText(publicDescription ?? "");
            await expect(page.getByRole("link", { name: "探索公开轨迹", exact: true })).toHaveAttribute("href", "/trails");
            await expect(page.getByTestId("home-floating-island")).toHaveCount(1);
            await expect(page.locator('#get-started a[href="/dashboard"]')).toHaveText("进入用户中心");
            await expect(page.locator("#home-featured-heading")).toHaveText("从一条路线，开始探索");
            const categoriesResponse = await context.request.get("/api/v1/category?perPage=-1");
            expect(categoriesResponse.ok()).toBe(true);
            const category = (await categoriesResponse.json()).items[0];
            expect(category?.id, "The local test database has a seeded activity category").toBeTruthy();
            const hidden = await context.request.put("/api/v1/user-category-preference", { data: { category: category.id, visible: false } });
            expect(hidden.ok(), "Hide only this test account's category preference").toBe(true);
            const names: string[] = [];
            for (let index = 0; index < 13; index++) {
                const name = `${owner.username} test route ${String(index + 1).padStart(2, "0")}`;
                names.push(name);
                await createTrail(owner, context.request, name, index % 2 === 0, category.id);
            }
            otherContext = await browser.newContext({ baseURL });
            const otherLogin = await otherContext.request.post("/api/v1/auth/login", { data: { username: outsider.username, password: outsider.password } });
            expect(otherLogin.ok()).toBe(true);
            const outsiderName = `${outsider.username} excluded test route`;
            await createTrail(outsider, otherContext.request, outsiderName, true, category.id);
            await page.reload();
            await expect(page.locator(".hero h1")).toHaveText(publicHeading ?? "");
            await expect(page.locator("body")).not.toContainText(names[0]);
            await openUserCenter(page, mobile);
            const cards = page.getByTestId("dashboard-trail");
            await expect(cards).toHaveCount(12);
            await expect(page.locator("body")).not.toContainText(outsiderName);
            await expect(page.getByTestId("dashboard-visibility").filter({ hasText: /^\s*公开\s*$/ }).first()).toBeVisible();
            await expect(page.getByTestId("dashboard-visibility").filter({ hasText: "非公开的" }).first()).toBeVisible();
            const firstNames = await cards.locator("h4").allTextContents();
            const pages = page.getByRole("navigation", { name: "我的轨迹分页", exact: true });
            await expect(pages).toBeVisible();
            await pages.getByRole("button", { name: "下一页", exact: true }).click();
            await expect(page).toHaveURL(/\/dashboard\?page=2$/);
            await expect(cards).toHaveCount(1);
            const secondNames = await cards.locator("h4").allTextContents();
            expect([...firstNames, ...secondNames].map(name => name.trim()).sort()).toEqual([...names].sort());
            await expect(page.locator("body")).not.toContainText(outsiderName);
            // Caller-provided ownership cannot escape the authenticated actor.
            await page.goto(`/dashboard?author=${outsider.actorID}`);
            await expect(cards).toHaveCount(12);
            await expect(page.locator("body")).not.toContainText(outsiderName);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            expect(feedRequests).toEqual([]);
            if (!mobile) {
                await page.getByRole("button", { name: "打开用户菜单", exact: true }).click();
                await page.locator(".menu-item").getByText("我的轨迹", { exact: true }).click();
                await expect(page).toHaveURL(new URL("/dashboard", baseURL).href);
                await expect(cards).toHaveCount(12);
                await page.getByRole("button", { name: "切换主题", exact: true }).click();
                await expect(page.locator("html")).toHaveClass(/dark/);
                const detail = cards.first().locator('a[href^="/trail/view/"]');
                const contrast = await detail.evaluate(element => {
                    const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
                    const luminance = (values: number[]) => values.slice(0, 3).map(value => {
                        const component = value / 255;
                        return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
                    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
                    const foreground = channels(getComputedStyle(element).color);
                    let parent: Element | null = element;
                    let background = [255, 255, 255];
                    while (parent) {
                        const candidate = channels(getComputedStyle(parent).backgroundColor);
                        if (candidate.length >= 3 && (candidate.length === 3 || candidate[3] > 0)) { background = candidate; break; }
                        parent = parent.parentElement;
                    }
                    const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
                    return (levels[0] + 0.05) / (levels[1] + 0.05);
                });
                expect(contrast, "Route detail links remain readable in dark mode").toBeGreaterThanOrEqual(4.5);
            }
            await page.screenshot({ path: `test-results/user-center-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
        } finally {
            try {
                // Tear down this test page's realtime subscriptions before its
                // own authenticated records disappear during native cleanup.
                await page.goto("about:blank");
            } finally {
                await otherContext?.close();
                await cleanupAccounts(accounts);
            }
        }
    });
}
