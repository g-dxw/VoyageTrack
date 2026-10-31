import { expect, test } from "../fixtures";

test.beforeEach(async ({ context }) => {
    const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
});

test("desktop hero keeps animation and direct drag without a control bar", async ({ page }) => {
    // CI software rendering needs time for model loading and repeated pixel readbacks.
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const island = page.getByTestId("home-floating-island");
    await expect(island).toHaveAttribute("data-scene-state", "ready", { timeout: 30000 });
    await expect(island).toHaveAttribute("data-scene-animation", "IslandLoop");
    await expect(island).toHaveAttribute("data-scene-duration", "64");
    await expect(page.locator('img[src*="wanderer_diorama"]')).toHaveCount(0);
    const hero = await page.locator(".hero").boundingBox();
    const scene = await island.boundingBox();
    const copy = await page.locator(".hero h1").boundingBox();
    expect(scene!.x).toBeGreaterThanOrEqual(copy!.x + copy!.width - 1);
    expect(scene!.y).toBeGreaterThanOrEqual(hero!.y - 1);
    expect(scene!.y + scene!.height).toBeLessThanOrEqual(hero!.y + hero!.height + 1);
    expect(scene!.x + scene!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 1);
    const sky = island.locator(".island-sky");
    await expect(sky).toBeVisible();
    await expect.poll(() => sky.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(page.locator(".island-controls")).toHaveCount(0);
    await expect(page.locator(".island-backdrop button")).toHaveCount(0);
    await expect(page.getByText("按住山景左右拖动", { exact: true })).toHaveCount(0);
    await expect(island).toHaveAttribute("data-motion", "playing");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(island).toHaveAttribute("data-motion", "paused");
    const canvas = island.locator("canvas");
    const pixels = () => canvas.evaluate(element => element instanceof HTMLCanvasElement ? element.toDataURL() : "");
    const first = await pixels();
    await page.waitForTimeout(200);
    expect(await pixels()).toBe(first);
    await page.mouse.move(scene!.x + scene!.width * .4, scene!.y + scene!.height * .5);
    await page.mouse.down();
    await page.mouse.move(scene!.x + scene!.width * .55, scene!.y + scene!.height * .5, { steps: 8 });
    await page.mouse.up();
    await expect.poll(pixels).not.toBe(first);
    await expect.poll(async () => {
        const before = await pixels();
        await page.waitForTimeout(150);
        return before === await pixels();
    }).toBe(true);
    const dragged = await pixels();
    const search = await page.locator('input[name="q"]').boundingBox();
    await page.mouse.move(search!.x + 30, search!.y + search!.height / 2);
    await page.mouse.down();
    await page.mouse.move(search!.x + 100, search!.y + search!.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect(await pixels()).toBe(dragged);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(island).toHaveAttribute("data-motion", "playing");
    await expect.poll(pixels).not.toBe(dragged);
});

test("reduced motion starts still, scene scrolls with hero and mobile remains compact", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const island = page.getByTestId("home-floating-island");
    await expect(island).toHaveAttribute("data-scene-state", "ready", { timeout: 30000 });
    await expect(island).toHaveAttribute("data-motion", "paused");
    const before = await island.boundingBox();
    await page.locator("#about").scrollIntoViewIfNeeded();
    const after = await island.boundingBox();
    expect(after!.y).toBeLessThan(before!.y - 20);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(island).not.toBeVisible();
    await expect(page.getByRole("group", { name: "山景视角与动画控制" })).toHaveCount(0);
    const trails = await page.locator("#trails").boundingBox();
    const about = await page.locator("#about").boundingBox();
    expect(about!.y).toBeGreaterThan(trails!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
