import { expect, test } from "../fixtures";
import { OAUTH_PROVIDER_STORAGE_KEY } from "../../../src/lib/util/oauth_callback";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
test.use({ baseURL });

const transaction = { name: "oidc", state: "synthetic-state", codeVerifier: "synthetic-verifier" };

for (const language of ["zh", "en"]) {
    test(`${language} incomplete callbacks stop loading and offer a local retry on mobile`, async ({ page, context }) => {
        await context.addCookies([{ name: "wanderer_locale", value: language, url: baseURL }]);
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto("/login/redirect");
        const alert = page.getByRole("alert");
        await expect(alert).toContainText(language === "zh"
            ? "登录回调信息不完整或无效" : "The login callback is incomplete or invalid");
        await expect(page.getByRole("status")).toHaveCount(0);
        const retry = alert.getByRole("link", { name: language === "zh" ? "返回登录" : "Back to login" });
        await expect(retry).toHaveAttribute("href", "/login");
        expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await retry.click();
        await expect(page).toHaveURL(new URL("/login", baseURL).href);
    });
}

for (const scenario of [
    { name: "missing code", stored: JSON.stringify(transaction), query: "state=synthetic-state", message: "登录回调信息不完整或无效" },
    { name: "malformed storage", stored: "{broken json", query: "state=synthetic-state&code=synthetic-code", message: "本次登录已过期" },
    { name: "mismatched state", stored: JSON.stringify(transaction), query: "state=wrong-state&code=synthetic-code", message: "第三方登录服务与本地保存的信息不一致" },
    { name: "cancelled login", stored: JSON.stringify(transaction), query: "state=synthetic-state&error=access_denied&error_description=PRIVATE_DIAGNOSTIC&error_uri=javascript:alert(1)", message: "已取消登录" },
]) {
    test(`${scenario.name} is safe, single-use and never calls the exchange endpoint`, async ({ page, context }) => {
        await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
        await page.addInitScript(({ key, value }) => { sessionStorage.setItem(key, value); }, {
            key: OAUTH_PROVIDER_STORAGE_KEY, value: scenario.stored,
        });
        const exchanges: string[] = [];
        page.on("request", request => {
            if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/auth/oauth") exchanges.push(request.url());
        });
        await page.goto(`/login/redirect?${scenario.query}`);
        const alert = page.getByRole("alert");
        await expect(alert).toContainText(scenario.message);
        await expect(alert.getByRole("link")).toHaveCount(1);
        await expect(page.getByText("PRIVATE_DIAGNOSTIC")).toHaveCount(0);
        await expect(page).toHaveURL(new URL("/login/redirect", baseURL).href);
        expect(await page.evaluate(key => sessionStorage.getItem(key), OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
        expect(exchanges).toEqual([]);
    });
}

test("a synthetic successful exchange submits only the one-use transaction and returns home", async ({ page, context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.addInitScript(({ key, transaction }) => {
        sessionStorage.setItem(key, JSON.stringify(transaction));
    }, { key: OAUTH_PROVIDER_STORAGE_KEY, transaction });
    const submitted: unknown[] = [];
    await page.route("**/api/v1/auth/oauth", async route => {
        if (route.request().method() !== "POST") return route.continue();
        submitted.push(route.request().postDataJSON());
        expect(await page.evaluate(key => sessionStorage.getItem(key), OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
        // This is callback rendering coverage, not a real IdP/session test.
        await route.fulfill({ json: { token: "synthetic-token", record: { id: "synthetic-user" } } });
    });
    await page.goto("/login/redirect?state=synthetic-state&code=synthetic-code");
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    expect(submitted).toEqual([{ name: "oidc", code: "synthetic-code", codeVerifier: "synthetic-verifier" }]);
});

test("exchange failure clears the transaction without logging or rendering upstream diagnostics", async ({ page, context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.addInitScript(({ key, transaction }) => {
        sessionStorage.setItem(key, JSON.stringify(transaction));
        const nativeFetch = window.fetch;
        window.fetch = async (input, init) => {
            if (typeof input === "string" && input === "/api/v1/auth/oauth" && init?.method === "POST") {
                // A client-only failure avoids creating any external identity or
                // relying on browser network-error console messages in this test.
                if (sessionStorage.getItem(key) !== null) throw new Error("transaction was not consumed");
                return new Response(JSON.stringify({ message: "PRIVATE_TOKEN_AND_CODE" }), { status: 400 });
            }
            return nativeFetch(input, init);
        };
    }, { key: OAUTH_PROVIDER_STORAGE_KEY, transaction });
    await page.goto("/login/redirect?state=synthetic-state&code=synthetic-code");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("登录错误");
    await expect(page.getByText("PRIVATE_TOKEN_AND_CODE")).toHaveCount(0);
    await expect(page).toHaveURL(new URL("/login/redirect", baseURL).href);
    expect(await page.evaluate(key => sessionStorage.getItem(key), OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
});

test("blocked browser storage shows a retry and still removes the authorization query", async ({ page, context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.addInitScript(() => {
        Object.defineProperty(window, "sessionStorage", {
            get() { throw new DOMException("Storage disabled", "SecurityError"); },
        });
    });
    await page.goto("/login/redirect?state=synthetic-state&code=synthetic-code");
    await expect(page.getByRole("alert")).toContainText("请允许浏览器存储后重试");
    await expect(page).toHaveURL(new URL("/login/redirect", baseURL).href);
    await expect(page.getByRole("status")).toHaveCount(0);
});
