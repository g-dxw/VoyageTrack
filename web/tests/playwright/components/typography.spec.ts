import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
test.use({ baseURL });

async function fontSize(locator: Locator): Promise<number> {
    return locator.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
}

test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
});

test("uses a compact desktop type scale without shrinking controls or rem geometry", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(await fontSize(page.locator("html"))).toBe(16);
    expect(await fontSize(page.locator("body"))).toBe(15);
    expect(await fontSize(page.locator(".hero h1"))).toBe(48);
    expect(await fontSize(page.locator("#home-invitation-heading"))).toBe(28);
    expect(await fontSize(page.locator("#about .prose"))).toBe(15);
    expect(await fontSize(page.locator("#nav-bar-links a").first())).toBe(14);
    expect(await fontSize(page.locator('input[name="q"]'))).toBe(18);
    const language = page.getByRole("combobox", { name: "语言", exact: true });
    expect(await fontSize(language)).toBe(14);
    expect((await language.boundingBox())?.height).toBe(36);
    expect((await page.getByRole("link", { name: "登录 / 注册", exact: true }).boundingBox())?.height).toBe(40);
    const field = page.locator('input[name="q"]');
    const fieldBounds = await field.boundingBox();
    const iconBounds = await page.locator(".hero .fa-search").boundingBox();
    expect(fieldBounds?.height).toBe(48);
    expect(Math.abs((fieldBounds!.y + fieldBounds!.height / 2) - (iconBounds!.y + iconBounds!.height / 2))).toBeLessThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/typography-desktop.png" });

    await page.goto("/login");
    expect(await fontSize(page.locator("h4").first())).toBe(18);
    expect(await fontSize(page.locator(".text-xs").first())).toBe(12);
    expect(await fontSize(page.locator('input[type="password"]').first())).toBe(15);
});

test("preserves readable mobile text and inputs with a smaller hero", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(await fontSize(page.locator("html"))).toBe(16);
    expect(await fontSize(page.locator("body"))).toBe(16);
    expect(await fontSize(page.locator(".hero h1"))).toBe(32);
    expect(await fontSize(page.locator("#home-invitation-heading"))).toBe(22);
    expect(await fontSize(page.locator("#about .prose"))).toBe(16);
    const language = page.getByRole("combobox", { name: "语言", exact: true });
    expect(await fontSize(language)).toBeGreaterThanOrEqual(16);
    expect(await fontSize(page.locator('input[name="q"]'))).toBeGreaterThanOrEqual(16);
    expect((await language.boundingBox())?.height).toBe(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/typography-mobile.png" });

    await page.goto("/login");
    expect(await fontSize(page.locator('input[type="password"]').first())).toBeGreaterThanOrEqual(16);
    expect(await fontSize(page.locator(".text-xs").first())).toBe(12);
});

test("continues to honor browser font enlargement and dark-mode contrast tokens", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
    expect(await fontSize(page.locator("body"))).toBe(18.75);
    expect(await fontSize(page.locator(".hero h1"))).toBe(60);
    await page.evaluate(() => { document.documentElement.style.removeProperty("font-size"); });
    await page.getByRole("button", { name: "切换主题", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await fontSize(page.locator("body"))).toBe(15);
    const headingColor = await page.locator(".hero h1").evaluate(element => getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number) ?? []);
    expect(headingColor.slice(0, 3)).toEqual([245, 245, 245]);
    await page.getByRole("button", { name: "切换主题", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
});
