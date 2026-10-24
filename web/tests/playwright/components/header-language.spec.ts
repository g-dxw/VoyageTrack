import { expect, test } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
test.use({ baseURL });

test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
});

test("switches immediately, keeps the browser preference across refresh and navigation, and makes no account writes", async ({ page, context }) => {
    const accountWrites: string[] = [];
    page.on("request", request => {
        if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/v1/settings")) {
            accountWrites.push(request.url());
        }
    });
    await page.goto("/");
    await expect(page).toHaveTitle("主页 | wanderer");
    // The initial title is server-rendered. Wait for the layout's client
    // locale effect before interacting with the native select.
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    const selector = page.getByRole("combobox", { name: "语言", exact: true });
    await expect(selector).toHaveValue("zh");
    await selector.selectOption("en");
    await expect(page).toHaveTitle("Home | wanderer");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle("Home | wanderer");
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("en");
    const renderedEnglish = await context.request.get("/");
    expect(await renderedEnglish.text()).toContain("<title>Home | wanderer</title>");
    await page.goto("/login");
    await expect(page).toHaveTitle("Login | wanderer");
    // The password type is applied by TextField's client action, unlike the
    // initial SSR title. Wait for hydration before changing another control.
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh");
    await expect(page).toHaveTitle("登录 | wanderer");
    await page.reload();
    await expect(page).toHaveTitle("登录 | wanderer");
    const cookie = (await context.cookies()).find(cookie => cookie.name === "wanderer_locale");
    expect(cookie).toMatchObject({ value: "zh", path: "/", sameSite: "Lax", httpOnly: false });
    expect(accountWrites).toEqual([]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.screenshot({ path: "test-results/header-language-desktop.png" });
});

test("keeps language selection visible and usable in the mobile header", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    const selector = page.getByRole("combobox", { name: "语言", exact: true });
    await expect(selector).toBeVisible();
    const bounds = await selector.boundingBox();
    expect(bounds?.y).toBeLessThan(120);
    expect(bounds?.height).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await selector.selectOption("en");
    await expect(page).toHaveTitle("Home | wanderer");
    await expect(page.getByRole("button", { name: "Toggle navigation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh");
    await page.screenshot({ path: "test-results/header-language-mobile.png" });
});

test("serializes a switch while a new language bundle loads", async ({ page, context }) => {
    let releaseLanguage = () => {};
    const pendingLanguage = new Promise<void>(resolve => { releaseLanguage = resolve; });
    let requestedLanguage = false;
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    // Inspect lazy script responses after hydration, rather than a Vite-only
    // source URL: production JSON imports have opaque hashed chunk names.
    await page.route(url => url.origin === new URL(baseURL).origin && /\.(?:js|json)$/.test(url.pathname), async route => {
        if (route.request().resourceType() !== "script") return route.continue();
        const response = await route.fetch();
        const body = await response.text();
        if (!["Langue", "Accueil", "Créer un compte"].every(message => body.includes(message))) {
            return route.fulfill({ response });
        }
        requestedLanguage = true;
        await pendingLanguage;
        await route.fulfill({ response });
    });
    const selector = page.getByRole("combobox", { name: "语言", exact: true });
    try {
        await selector.selectOption("fr");
        await expect.poll(() => requestedLanguage, { message: "French locale script was intercepted before delivery" }).toBe(true);
        await expect(selector).toBeDisabled();
        expect((await context.cookies()).find(cookie => cookie.name === "wanderer_locale")?.value).toBe("zh");
    } finally {
        releaseLanguage();
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("combobox", { name: "Langue", exact: true })).toBeEnabled();
    expect((await context.cookies()).find(cookie => cookie.name === "wanderer_locale")?.value).toBe("fr");
    await page.getByRole("combobox", { name: "Langue", exact: true }).selectOption("en");
    await expect(page).toHaveTitle("Home | wanderer");
});
