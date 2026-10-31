import { expect, test, type Page } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";

// Synthetic records exercise the actual homepage without database writes.
const featured = [
    {
        trail: {
            id: "fixturetrail001", collectionId: "trails-fixture", name: "Test ridge route",
            public: true, author: "fixtureactor001", location: "Test ridge",
            photos: ["broken.jpg"], thumbnail: 0, distance: 12450, elevation_gain: 680,
        },
        href: "/trail/view/@fixture/fixturetrail001",
        reason: { en: "A test route with a ridge view.", zh: "用于测试的山脊路线。" },
    },
    {
        trail: {
            id: "fixturetrail002", collectionId: "trails-fixture", name: "Test valley route",
            public: true, author: "fixtureactor001", photos: ["clip.mp4"],
            distance: null, elevation_gain: -1,
        },
        href: "/trail/view/@fixture/fixturetrail002",
    },
    {
        trail: {
            id: "fixturetrail003", collectionId: "trails-fixture", name: "Test forest route",
            public: true, author: "fixtureactor001", photos: ["cover.jpg"],
            distance: 4200, elevation_gain: 0,
        },
        href: "/trail/view/@fixture/fixturetrail003",
    },
];

async function openWithFeatured(page: Page) {
    let featuredRequests = 0;
    await page.route("**/api/v1/trail/featured", route => {
        featuredRequests++;
        return route.fulfill({ json: featured });
    });
    await page.route("**/api/v1/files/trails-fixture/**", route => route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: route.request().url().includes("broken.jpg") ? "invalid image data" :
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="338"><rect width="600" height="338" fill="#365c43"/></svg>',
    }));
    // Browser routing cannot intercept the initial server-side universal load.
    // Follow the real home link after another page has hydrated instead.
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.locator('[data-app-header] > a[href="/"]').click();
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    await expect.poll(() => featuredRequests).toBeGreaterThan(0);
}

test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
});

test("direct anonymous home has a public entry and an honest empty selection", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("把路线留住，把风景分享。");
    await expect(page.locator('[data-app-header] > a[href="/"]')).toContainText("VoyageTrack");
    await expect(page.getByRole("link", { name: "探索公开轨迹", exact: true })).toHaveAttribute("href", "/trails");
    await expect(page.locator('input[name="q"]')).toBeVisible();
    await expect(page.locator("#trails")).toContainText("目前还没有精选轨迹");
    await expect(page.getByTestId("home-featured-card")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "浏览全部轨迹", exact: true })).toHaveAttribute("href", "/trails");
    await expect(page.locator('#get-started a[href="/login"]')).toBeVisible();
});

for (const mobile of [false, true]) {
    test(`${mobile ? "mobile" : "desktop"} cards preserve order, handle missing media and support keyboard focus`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 375, height: 812 });
        await openWithFeatured(page);
        const cards = page.getByTestId("home-featured-card");
        await expect(cards).toHaveCount(3);
        await expect(cards.locator("h3")).toHaveText(["Test ridge route", "Test valley route", "Test forest route"]);
        const firstCard = await cards.first().boundingBox();
        const secondCard = await cards.nth(1).boundingBox();
        const thirdCard = await cards.nth(2).boundingBox();
        if (mobile) {
            expect(secondCard!.y).toBeGreaterThan(firstCard!.y + firstCard!.height);
            expect(thirdCard!.y).toBeGreaterThan(secondCard!.y + secondCard!.height);
        } else {
            expect(Math.abs(secondCard!.y - firstCard!.y)).toBeLessThan(2);
            expect(Math.abs(thirdCard!.y - firstCard!.y)).toBeLessThan(2);
            expect(thirdCard!.x).toBeGreaterThan(secondCard!.x);
        }
        expect(await cards.first().locator("h3").evaluate(element => getComputedStyle(element).fontSize)).toBe("18px");
        await cards.first().scrollIntoViewIfNeeded();
        await expect(cards.first()).toContainText("12.45 km");
        await expect(cards.first()).toContainText("680 m");
        await expect(cards.first()).toContainText("用于测试的山脊路线。");
        await expect(cards.first()).toContainText("暂无封面照片");
        await expect(cards.nth(1).locator("dl")).toHaveCount(0);
        await expect(cards.nth(1).locator("video")).toHaveCount(0);
        await expect(cards.nth(2).getByAltText("Test forest route的路线封面")).toHaveAttribute("loading", "lazy");
        await expect(cards.nth(2)).toContainText("0 m");
        await expect(cards.first()).toHaveAttribute("href", "/trail/view/@fixture/fixturetrail001");
        await cards.first().focus();
        await expect(cards.first()).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cards.nth(1)).toBeFocused();
        expect(await cards.nth(1).evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
        await expect(cards.locator("button, input, a")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/home-featured-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
        if (mobile) await page.locator('[data-app-header] button.fa-bars').click();
        await page.getByRole("button", { name: "切换主题", exact: true }).click();
        if (mobile) await page.locator('button.fa-close').click();
        await expect(page.locator("html")).toHaveClass(/dark/);
        await expect(cards.first().locator(".featured-fallback-dark")).toBeVisible();
        await expect(cards.first().locator(".featured-fallback-light")).not.toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (!mobile) await page.screenshot({ path: "test-results/home-featured-dark.png", fullPage: true });
        await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en");
        await expect(page.locator(".hero h1")).toHaveText("Keep the trail. Share the journey.");
        await expect(cards.first()).toContainText("A test route with a ridge view.");
        await expect(cards.first()).toContainText("No cover photo");
        await expect(cards.locator("h3")).toHaveText(["Test ridge route", "Test valley route", "Test forest route"]);
    });
}

test.describe("featured service failure", () => {
    test.use({ browserErrorAllowlist: [{
        source: "console.error",
        message: /Failed to load resource: the server responded with a status of 503/,
        url: /\/api\/v1\/trail\/featured/,
        issue: "https://github.com/g-dxw/VoyageTrack/issues/33",
    }] });

    test("keeps administrator introduction and offers browsing after a load failure", async ({ page }) => {
        let featuredRequests = 0;
        await page.route("**/md/about.md", route => route.fulfill({ contentType: "text/markdown", body: "Our custom outdoor introduction." }));
        await page.route("**/api/v1/trail/featured", route => {
            featuredRequests++;
            return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        });
        await page.goto("/login");
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await page.locator('[data-app-header] > a[href="/"]').click();
        await expect.poll(() => featuredRequests).toBeGreaterThan(0);
        await expect(page.locator("#about")).toContainText("Our custom outdoor introduction.");
        await expect(page.locator("#trails [role=status]")).toContainText("精选轨迹暂时无法加载");
        await expect(page.getByRole("link", { name: "浏览全部轨迹", exact: true })).toBeVisible();
        await expect(page.getByTestId("home-featured-card")).toHaveCount(0);
        await expect(page.locator('input[name="q"]')).toBeVisible();
    });
});
