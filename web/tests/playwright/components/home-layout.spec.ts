import { expect, test } from "../fixtures";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";

test("homepage uses compact monochrome controls and keeps the redesign scoped to home", async ({ page, context }) => {
    await context.addCookies([{ name: "wanderer_locale", value: "zh", url: baseURL }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    const shell = page.locator(".homepage-shell");
    await expect(shell).toBeVisible();
    const action = page.getByRole("link", { name: "探索公开轨迹", exact: true });
    const colors = () => action.evaluate(element => {
        const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
        const ownStyle = getComputedStyle(element);
        const parentStyle = getComputedStyle(element.closest(".homepage-shell")!);
        const headerStyle = getComputedStyle(document.querySelector("[data-app-header]")!);
        const inputStyle = getComputedStyle(document.querySelector('input[name="q"]')!);
        const loginStyle = getComputedStyle(document.querySelector('[data-app-header] a[href="/login"]')!);
        return {
            action: channels(ownStyle.backgroundColor), label: channels(ownStyle.color),
            background: channels(parentStyle.backgroundColor), content: channels(parentStyle.color),
            header: channels(headerStyle.backgroundColor), input: channels(inputStyle.backgroundColor),
            login: channels(loginStyle.backgroundColor), loginLabel: channels(loginStyle.color),
        };
    });
    await expect.poll(colors).toEqual({ action: [23, 23, 23], label: [255, 255, 255], background: [255, 255, 255], content: [23, 23, 23], header: [255, 255, 255], input: [250, 250, 250], login: [0, 0, 0], loginLabel: [255, 255, 255] });
    expect(await page.locator(".hero h1").evaluate(element => getComputedStyle(element).fontSize)).toBe("48px");
    const eyebrowContrast = await page.locator(".home-eyebrow").evaluate(element => {
        const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
        const foreground = channels(getComputedStyle(element).color);
        const background = channels(getComputedStyle(element.closest(".homepage-shell")!).backgroundColor);
        const alpha = foreground[3] ?? 1;
        const luminance = (color: number[]) => color.slice(0, 3).map(channel => {
            const value = channel / 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const blended = foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
        const values = [luminance(blended), luminance(background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
    });
    expect(eyebrowContrast, "Small homepage text keeps readable contrast").toBeGreaterThanOrEqual(4.5);

    await expect(page.locator("footer.home-footer")).toHaveCount(1);
    await expect(page.locator('footer a[href="https://github.com/g-dxw/VoyageTrack"]')).toBeVisible();
    await page.getByRole("button", { name: "切换主题", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(colors).toEqual({ action: [245, 245, 245], label: [0, 0, 0], background: [0, 0, 0], content: [245, 245, 245], header: [0, 0, 0], input: [23, 23, 23], login: [255, 255, 255], loginLabel: [0, 0, 0] });
    await page.locator(".hero h1").evaluate(element => {
        window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 20);
    });
    expect(await page.locator(".hero h1").evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return Boolean(document.elementFromPoint(bounds.left + 20, bounds.top + 15)?.closest("[data-app-header]"));
    }), "The sticky navigation remains above hero text while scrolling").toBe(true);
    await page.locator('#nav-bar-links a[href="/trails"]').click();
    await expect(page).toHaveURL(new URL("/trails", baseURL).href);
    await expect(page.locator(".homepage-shell, footer.home-footer, [data-app-header].home-nav")).toHaveCount(0);
    await expect(page.locator("footer.bg-footer-background")).toHaveCount(1);
});
