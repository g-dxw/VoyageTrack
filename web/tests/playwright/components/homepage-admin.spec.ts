import { randomUUID } from "node:crypto";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { expect, test as base, type Page } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://127.0.0.1:4176";
const pocketbaseURL = process.env.WANDERER_TEST_POCKETBASE_URL ?? "http://127.0.0.1:8092";
const enabled = process.env.WANDERER_TEST_HOMEPAGE_ADMIN_FIXTURES === "true";

type FixtureUser = { id: string; username: string; password: string; token: string; actorID: string; native: APIRequestContext; trails: string[] };
type FixtureTrail = { id: string; name: string };
type Fixture = {
    admin: APIRequestContext;
    editor: FixtureUser;
    ordinary: FixtureUser;
    grantID: string;
    first: FixtureTrail;
    second: FixtureTrail;
    privateTrail: FixtureTrail;
    prefix: string;
    configID: string;
};

function assertDedicatedEnvironment() {
    expect(enabled, "Global homepage fixtures require the explicit disposable-environment flag").toBe(true);
    for (const url of [new URL(baseURL), new URL(pocketbaseURL)]) {
        expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    }
    expect(new URL(pocketbaseURL).port, "Never use the existing 8090/8091 databases").toBe("8092");
    expect(new URL(baseURL).port, "Use only the dedicated admin-fixture web process").toBe("4176");
    expect(Boolean(process.env.WANDERER_TEST_ADMIN_EMAIL && process.env.WANDERER_TEST_ADMIN_PASSWORD), "Disposable PB admin credentials are supplied only to native fixture requests").toBe(true);
}

async function createUser(registry: FixtureUser[]) {
    const username = `feature${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    const password = randomUUID();
    const native = await playwrightRequest.newContext({ baseURL: pocketbaseURL });
    // Native signup has no requestVerification action and sends no email.
    const created = await native.post("/api/collections/users/records", {
        data: { username, email: `${username}@example.invalid`, password, passwordConfirm: password },
    });
    expect(created.ok(), "Create only a unique disposable test-owned user").toBe(true);
    const record = await created.json();
    const user: FixtureUser = { id: record.id, username, password, token: "", actorID: "", native, trails: [] };
    registry.push(user);
    const auth = await native.post("/api/collections/users/auth-with-password", { data: { identity: username, password } });
    expect(auth.ok()).toBe(true);
    user.token = (await auth.json()).token;
    const actors = await native.get("/api/collections/activitypub_actors/records", {
        params: { filter: `user="${user.id}"` }, headers: { Authorization: user.token },
    });
    expect(actors.ok()).toBe(true);
    const actorRecords = (await actors.json()).items;
    expect(actorRecords).toHaveLength(1);
    expect(actorRecords[0].user).toBe(user.id);
    user.actorID = actorRecords[0].id;
    return user;
}

async function createTrail(user: FixtureUser, name: string, publicTrail: boolean): Promise<FixtureTrail> {
    const response = await user.native.post("/api/collections/trails/records", {
        headers: { Authorization: user.token },
        data: { name, author: user.actorID, public: publicTrail, completed: false, photos: [], distance: 4200, elevation_gain: 240, difficulty: "easy" },
    });
    expect(response.ok(), "Create only synthetic metadata routes owned by this fixture user").toBe(true);
    const record = await response.json();
    user.trails.push(record.id);
    return { id: record.id, name };
}

const test = base.extend<{ fixture: Fixture }>({
    fixture: async ({ page }, use, testInfo) => {
        assertDedicatedEnvironment();
        const accounts: FixtureUser[] = [];
        const grants: string[] = [];
        const login = await playwrightRequest.newContext({ baseURL: pocketbaseURL });
        const authenticated = await login.post("/api/collections/_superusers/auth-with-password", {
            data: { identity: process.env.WANDERER_TEST_ADMIN_EMAIL, password: process.env.WANDERER_TEST_ADMIN_PASSWORD },
        });
        expect(authenticated.ok(), "Authenticate only the disposable native PB fixture administrator").toBe(true);
        const adminToken = (await authenticated.json()).token;
        const admin = await playwrightRequest.newContext({ baseURL: pocketbaseURL, extraHTTPHeaders: { Authorization: adminToken } });
        await login.dispose();
        const snapshotResponse = await admin.get("/api/collections/homepage_featured/records", { params: { filter: 'key="homepage"' } });
        expect(snapshotResponse.ok()).toBe(true);
        const snapshots = (await snapshotResponse.json()).items;
        expect(snapshots).toHaveLength(1);
        const snapshot = snapshots[0];
        const failures: string[] = [];
        try {
            const cleared = await admin.patch(`/api/collections/homepage_featured/records/${snapshot.id}`, { data: { items: [], revision: snapshot.revision + 1 } });
            expect(cleared.ok()).toBe(true);
            const editor = await createUser(accounts);
            const ordinary = await createUser(accounts);
            const granted = await admin.post("/api/collections/homepage_editors/records", { data: { user: editor.id } });
            expect(granted.ok()).toBe(true);
            const grantID = (await granted.json()).id;
            grants.push(grantID);
            const prefix = `featured-fixture-${randomUUID().slice(0, 8)}`;
            const first = await createTrail(ordinary, `${prefix} public ridge`, true);
            const second = await createTrail(ordinary, `${prefix} public forest`, true);
            const privateTrail = await createTrail(ordinary, `${prefix} private route`, false);
            await use({ admin, editor, ordinary, grantID, first, second, privateTrail, prefix, configID: snapshot.id });
        } finally {
            if (testInfo.status !== testInfo.expectedStatus) {
                try { await page.screenshot({ path: testInfo.outputPath("admin-failure.png"), fullPage: true }); } catch { /* Cleanup still takes priority. */ }
            }
            try { await page.goto("about:blank"); } catch { /* Continue fixture cleanup after page failure. */ }
            const restored = await admin.patch(`/api/collections/homepage_featured/records/${snapshot.id}`, {
                data: { key: snapshot.key, items: snapshot.items, revision: snapshot.revision },
            });
            if (!restored.ok()) failures.push("restore disposable homepage configuration");
            for (const id of grants) {
                const response = await admin.delete(`/api/collections/homepage_editors/records/${id}`);
                if (![204, 404].includes(response.status())) failures.push("remove fixture editor grant");
            }
            for (const account of accounts.reverse()) {
                const headers = { Authorization: account.token };
                for (const id of account.trails) {
                    const removed = await account.native.delete(`/api/collections/trails/records/${id}`, { headers });
                    if (!removed.ok()) failures.push("remove test-owned route");
                }
                const removed = await account.native.delete(`/api/collections/users/records/${account.id}`, { headers });
                if (!removed.ok()) failures.push("remove test-owned user");
                await account.native.dispose();
            }
            await admin.dispose();
            expect(failures, "Restore only this disposable environment and remove test-owned entities").toEqual([]);
        }
    },
});

test.skip(!enabled, "Requires an explicitly provisioned disposable PB8092/Web4176 admin-fixture environment");
test.use({ browserErrorAllowlist: [{
    source: "console.error",
    message: /Failed to load resource: the server responded with a status of (?:403|409|503)/,
    url: /\/(?:api\/v1\/)?admin\/featured(?:\b|\/)/,
    issue: "https://github.com/g-dxw/VoyageTrack/issues/33",
}] });
test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    page.setDefaultTimeout(10000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://api.dicebear.com/**", route => route.fulfill({
        contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#555"/></svg>',
    }));
});

async function loginUI(page: Page, user: FixtureUser) {
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.locator('input[name="username"]').fill(user.username);
    await page.locator('input[name="password"]').fill(user.password);
    const response = page.waitForResponse("**/api/v1/auth/login");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    // The server-rendered user-menu button exists before Svelte listeners are
    // installed. The layout sets this language attribute in its client effect.
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
}
async function assertAdminChrome(page: Page, english = false) {
    await expect(page.locator('[data-app-header] > a[href="/"]')).toHaveAttribute("aria-label", "VoyageTrack");
    const about = page.locator("footer.home-footer").getByRole("link", { name: english ? "About" : "关于", exact: true });
    await expect(about).toBeVisible();
    await expect(about).toHaveAttribute("href", "/#about");
    const contrast = await about.evaluate(element => {
        const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
        const luminance = (values: number[]) => values.slice(0, 3).map(value => {
            const channel = value / 255;
            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        let parent: Element | null = element;
        let background = [255, 255, 255];
        while (parent) {
            const candidate = channels(getComputedStyle(parent).backgroundColor);
            if (candidate.length >= 3 && (candidate.length === 3 || candidate[3] > 0)) { background = candidate; break; }
            parent = parent.parentElement;
        }
        const levels = [luminance(channels(getComputedStyle(element).color)), luminance(background)].sort((a, b) => b - a);
        return (levels[0] + .05) / (levels[1] + .05);
    });
    expect(contrast, "The admin footer remains readable in the current theme").toBeGreaterThanOrEqual(4.5);
}
async function openManager(page: Page, fixture: Fixture) {
    const nativePermission = await fixture.editor.native.get("/homepage/editor", { headers: { Authorization: fixture.editor.token } });
    expect(nativePermission.ok()).toBe(true);
    expect(await nativePermission.json()).toEqual({ canManageHomepage: true });
    await page.getByRole("button", { name: "打开用户菜单", exact: true }).click();
    const entry = page.getByRole("link", { name: "首页精选管理", exact: true });
    await expect(entry).toBeVisible();
    await entry.focus();
    await expect(entry).toBeFocused();
    await entry.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("首页精选管理");
    await assertAdminChrome(page);
}
async function searchFixture(page: Page, fixture: Fixture) {
    await page.getByRole("searchbox", { name: "按名称搜索公开路线", exact: true }).fill(fixture.prefix);
    const response = page.waitForResponse(url => url.url().includes("/api/v1/admin/featured/candidates?") && url.request().method() === "GET");
    await page.getByRole("button", { name: "搜索路线", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByTestId("featured-candidate")).toHaveCount(2);
    await expect(page.getByTestId("featured-candidates")).not.toContainText(fixture.privateTrail.name);
}
async function addCandidate(page: Page, name: string, english = false) {
    await page.getByTestId("featured-candidate").filter({ has: page.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: english ? "Add to featured" : "加入精选", exact: true }).click();
}
const selected = (page: Page, id: string) => page.locator(`[data-testid="featured-selected-item"][data-trail-id="${id}"]`);
async function saveSelection(page: Page, english = false, status = 200) {
    const button = page.getByRole("button", { name: english ? "Save featured selection" : "保存精选名单", exact: true });
    await expect(button).toBeEnabled();
    const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/v1/admin/featured" && result.request().method() === "PUT");
    await button.click();
    expect((await response).status()).toBe(status);
}

test("an editor publishes an ordered bilingual selection and private routes disappear from the real homepage", async ({ page, fixture, browser }) => {
    test.setTimeout(120000);
    await loginUI(page, fixture.editor);
    await openManager(page, fixture);
    await searchFixture(page, fixture);
    await addCandidate(page, fixture.first.name);
    await addCandidate(page, fixture.second.name);
    const first = selected(page, fixture.first.id);
    const second = selected(page, fixture.second.id);
    await second.getByRole("button", { name: `上移${fixture.second.name}`, exact: true }).click();
    await first.getByLabel("中文推荐理由（可选）", { exact: true }).fill("用于自动验收的公开山脊路线。");
    await first.getByLabel("英文推荐理由（可选）", { exact: true }).fill("A public ridge route created for automated acceptance.");
    const privateReason = "用于自动验收的公开林间路线。";
    await second.getByLabel("中文推荐理由（可选）", { exact: true }).fill(privateReason);
    await second.getByLabel("英文推荐理由（可选）", { exact: true }).fill("A public forest route created for automated acceptance.");
    await expect(page.getByTestId("featured-selected-item").locator("h3")).toHaveText([fixture.second.name, fixture.first.name]);
    await saveSelection(page);
    await expect(page.getByTestId("featured-draft-status")).toHaveText("精选名单已保存。");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByTestId("featured-selected-item").locator("h3")).toHaveText([fixture.second.name, fixture.first.name]);
    await expect(selected(page, fixture.first.id).getByLabel("英文推荐理由（可选）", { exact: true })).toHaveValue("A public ridge route created for automated acceptance.");
    await page.screenshot({ path: "/Users/wangzai/.codex/visualizations/2026/10/31/01a1906f-424e-7563-9af5-f3038b2e2968/homepage-admin-desktop.png", fullPage: true });
    const publicContext = await browser.newContext({ baseURL, reducedMotion: "reduce" });
    try {
        await publicContext.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
        const publicPage = await publicContext.newPage();
        await publicPage.goto("/");
        await expect(publicPage.getByTestId("home-featured-card").locator("h3")).toHaveText([fixture.second.name, fixture.first.name]);
        await expect(publicPage.getByTestId("home-featured-card").first()).toContainText(privateReason);
        const hidden = await fixture.ordinary.native.patch(`/api/collections/trails/records/${fixture.second.id}`, {
            headers: { Authorization: fixture.ordinary.token }, data: { public: false },
        });
        expect(hidden.ok()).toBe(true);
        await publicPage.reload();
        await expect(publicPage.getByTestId("home-featured-card").locator("h3")).toHaveText([fixture.first.name]);
        await expect(publicPage.locator("body")).not.toContainText(privateReason);
        const published = await publicContext.request.get("/api/v1/trail/featured");
        expect(published.ok()).toBe(true);
        expect(JSON.stringify(await published.json())).not.toContain(fixture.second.id);
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
        await expect(selected(page, fixture.second.id)).toContainText("已无法公开展示");
        await selected(page, fixture.second.id).getByRole("button", { name: `从精选移除${fixture.second.id}`, exact: true }).click();
        await saveSelection(page);
    } finally { await publicContext.close(); }
});

test("anonymous and ordinary users cannot manage, and a revoked editor cannot save an already open draft", async ({ page, fixture, context }) => {
    test.setTimeout(120000);
    await page.goto("/admin/featured");
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("r")).toBe("/admin/featured");
    const deniedAnonymous = await context.request.get("/api/v1/admin/featured");
    expect(deniedAnonymous.status()).toBe(401);
    await page.goto("/");
    await loginUI(page, fixture.ordinary);
    await page.getByRole("button", { name: "打开用户菜单", exact: true }).click();
    await expect(page.locator(".menu-item").getByText("首页精选管理", { exact: true })).toHaveCount(0);
    const deniedOrdinary = await context.request.put("/api/v1/admin/featured", {
        headers: { Origin: baseURL }, data: { revision: 0, items: [] },
    });
    expect(deniedOrdinary.status()).toBe(403);
    const deniedNative = await fixture.ordinary.native.post("/api/collections/homepage_editors/records", {
        headers: { Authorization: fixture.ordinary.token }, data: { user: fixture.ordinary.id },
    });
    expect(deniedNative.status()).toBe(403);
    const deniedNativeConfig = await fixture.ordinary.native.patch(`/api/collections/homepage_featured/records/${fixture.configID}`, {
        headers: { Authorization: fixture.ordinary.token }, data: { items: [], revision: 0 },
    });
    expect(deniedNativeConfig.status()).toBe(403);
    const ordinaryPage = await page.goto("/admin/featured");
    expect(ordinaryPage?.status()).toBe(403);
    await page.goto("/");
    await page.getByRole("button", { name: "打开用户菜单", exact: true }).click();
    await page.locator(".menu-item").getByText("登出", { exact: true }).click();
    await expect(page.locator('[data-app-header] a[href="/login"]')).toBeVisible();
    await loginUI(page, fixture.editor);
    await openManager(page, fixture);
    await searchFixture(page, fixture);
    await addCandidate(page, fixture.first.name);
    await fixture.admin.delete(`/api/collections/homepage_editors/records/${fixture.grantID}`);
    await saveSelection(page, false, 403);
    await expect(page.getByTestId("featured-save-error")).toContainText("你已没有精选管理权限");
    await expect(page.getByTestId("featured-draft-status")).toHaveText("有尚未保存的更改。");
    await expect(page.getByTestId("featured-selected-item")).toHaveCount(1);
    const published = await context.request.get("/api/v1/trail/featured");
    expect(await published.json()).toEqual([]);
});

test("mobile English dark mode keeps failed and conflicting drafts until an explicit refresh", async ({ page, fixture }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginUI(page, fixture.editor);
    await page.getByRole("button", { name: "展开或收起导航", exact: true }).click();
    await page.getByRole("button", { name: "切换主题", exact: true }).click();
    await page.getByRole("button", { name: "展开或收起导航", exact: true }).first().click();
    await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("link", { name: "Homepage featured trails", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Homepage featured trails");
    await assertAdminChrome(page, true);
    await page.getByRole("searchbox", { name: "Search public trails by name", exact: true }).fill(fixture.prefix);
    await page.getByRole("button", { name: "Search trails", exact: true }).click();
    await expect(page.getByTestId("featured-candidate")).toHaveCount(2);
    await addCandidate(page, fixture.first.name, true);
    const note = "This draft survives a failed request and a concurrent editor.";
    await selected(page, fixture.first.id).getByLabel("English note (optional)", { exact: true }).fill(note);
    let failedWrites = 0;
    await page.route("**/api/v1/admin/featured", route => {
        if (route.request().method() !== "PUT") return route.continue();
        failedWrites++;
        return route.fulfill({ status: 503, json: { message: "homepage_unavailable" } });
    });
    await saveSelection(page, true, 503);
    expect(failedWrites).toBe(1);
    await expect(page.getByTestId("featured-save-error")).toContainText("service is unavailable");
    await expect(selected(page, fixture.first.id).getByLabel("English note (optional)", { exact: true })).toHaveValue(note);
    await page.unroute("**/api/v1/admin/featured");
    const current = await fixture.editor.native.get("/homepage/admin/featured", { headers: { Authorization: fixture.editor.token } });
    expect(current.ok()).toBe(true);
    const saved = await current.json();
    const concurrent = await fixture.editor.native.put("/homepage/admin/featured", {
        headers: { Authorization: fixture.editor.token }, data: { revision: saved.revision, items: [] },
    });
    expect(concurrent.ok()).toBe(true);
    let refreshes = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/v1/admin/featured" && request.method() === "GET") refreshes++; });
    await saveSelection(page, true, 409);
    await expect(page.getByTestId("featured-save-error")).toContainText("Another editor has saved a newer version");
    await expect(selected(page, fixture.first.id).getByLabel("English note (optional)", { exact: true })).toHaveValue(note);
    expect(refreshes).toBe(0);
    await page.getByRole("button", { name: "Discard draft and load latest selection", exact: true }).click();
    await expect(page.getByTestId("featured-selected-item")).toHaveCount(0);
    expect(refreshes).toBe(1);
    await expect(page.getByRole("button", { name: "Save featured selection", exact: true })).toBeDisabled();
    await addCandidate(page, fixture.first.name, true);
    await saveSelection(page, true);
    await expect(page.getByTestId("featured-draft-status")).toHaveText("The featured selection has been saved.");
    await selected(page, fixture.first.id).getByRole("button", { name: `Remove ${fixture.first.name} from featured`, exact: true }).click();
    await saveSelection(page, true);
    const empty = await page.context().request.get("/api/v1/trail/featured");
    expect(empty.ok()).toBe(true);
    expect(await empty.json()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/homepage-admin-mobile-dark.png", fullPage: true });
    await page.screenshot({ path: "/Users/wangzai/.codex/visualizations/2026/10/31/01a1906f-424e-7563-9af5-f3038b2e2968/homepage-admin-mobile.png", fullPage: true });
});

test("an empty verified candidate page still offers later pages and keeps the current draft", async ({ page, fixture }) => {
    test.setTimeout(90000);
    await loginUI(page, fixture.editor);
    await openManager(page, fixture);
    await searchFixture(page, fixture);
    await addCandidate(page, fixture.first.name);
    const note = "候选分页变化时仍保留的验收草稿。";
    await selected(page, fixture.first.id).getByLabel("中文推荐理由（可选）", { exact: true }).fill(note);
    const actualResponse = await page.context().request.get(`/api/v1/admin/featured/candidates?${new URLSearchParams({ q: fixture.prefix })}`);
    expect(actualResponse.ok()).toBe(true);
    const actual = await actualResponse.json();
    const realCandidate = actual.items.find((item: { trail: { id: string } }) => item.trail.id === fixture.second.id);
    expect(realCandidate).toBeTruthy();
    const pages: string[] = [];
    // The backend rechecks ViewRule after native PB pagination, so a page can
    // become empty while later pages still exist. Reuse real fixture metadata.
    await page.route("**/api/v1/admin/featured/candidates?*", route => {
        const pageNumber = new URL(route.request().url()).searchParams.get("page") ?? "1";
        pages.push(pageNumber);
        return route.fulfill({ json: {
            ...actual, page: Number(pageNumber), totalPages: 2, totalItems: 21,
            items: pageNumber === "1" ? [] : [realCandidate],
        } });
    });
    await page.getByRole("button", { name: "搜索路线", exact: true }).click();
    await expect(page.getByTestId("featured-candidate")).toHaveCount(0);
    const navigation = page.getByRole("navigation", { name: "公开路线搜索分页", exact: true });
    await expect(navigation).toBeVisible();
    await navigation.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.getByTestId("featured-candidate").locator("h3")).toHaveText([fixture.second.name]);
    expect(pages).toEqual(["1", "2"]);
    await expect(page.getByTestId("featured-selected-item")).toHaveCount(1);
    await expect(selected(page, fixture.first.id).getByLabel("中文推荐理由（可选）", { exact: true })).toHaveValue(note);
    await expect(page.getByTestId("featured-draft-status")).toHaveText("有尚未保存的更改。");
});
