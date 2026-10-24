import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures";
import { buildTrailModalFixture } from "./trail-modal-fixture";

const baseURL = process.env.WANDERER_TEST_BASE_URL ?? "http://localhost:3000";
const fixtureURL = new URL("/compact-controls-fixture", baseURL).href;

const source = `
    <script>
        import Button from '$lib/components/base/button.svelte';
        import Search from '$lib/components/base/search.svelte';
        import SingleSelect from '$lib/components/base/single_select.svelte';
        import Modal from '$lib/components/base/modal.svelte';
        let query = $state('existing query');
        let lastQuery = $state('not updated');
        let selected = $state('first');
        let clicked = $state(0);
        let modal;
        const longLabel = '保存这条包含完整地点信息和路线说明的徒步线路';
    </script>
    <main style="width: min(196px, calc(100vw - 32px)); margin: 16px; display: grid; gap: 12px;">
        <Button primary id="regular-button" onclick={() => clicked += 1}>保存</Button>
        <Button primary id="long-button" onclick={() => clicked += 1}>{longLabel}</Button>
        <output data-testid="clicks">{clicked}</output>
        <Search label="搜索附近的徒步线路和完整地点信息" bind:value={query} onupdate={value => lastQuery = value} />
        <output data-testid="query">{lastQuery}</output>
        <SingleSelect name="choice" label="路线类型" bind:value={selected}
            items={[{ value: 'first', text: longLabel }, { value: 'second', text: '另一条路线' }]} />
        <output data-testid="selection">{selected}</output>
        <button class="btn-secondary" onclick={() => modal.openModal()}>打开对话框</button>
        <Modal id="compact-modal" title="路线信息" bind:this={modal}>
            {#snippet content()}<p>完整的路线说明内容</p>{/snippet}
        </Modal>
    </main>
`;

async function bounds(locator: Locator) {
    const result = await locator.boundingBox();
    expect(result).not.toBeNull();
    return result!;
}

for (const mobile of [false, true]) {
    test(`${mobile ? "mobile" : "desktop"} compact controls grow for labels and align labeled search actions`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 375, height: 812 });
        const bundle = await buildTrailModalFixture(true, source);
        // Discover the CSS from a hydrated real page: Vite injects styles while
        // the production server links hashed assets. Neither requires /src URLs.
        await page.goto(new URL("/login", baseURL).href);
        await expect(page.locator('input[type="password"]')).toBeVisible();
        const styles = await page.locator('link[rel="stylesheet"], style').evaluateAll(elements =>
            elements.map(element => {
                const clone = element.cloneNode(true) as HTMLElement;
                if (clone instanceof HTMLLinkElement && element instanceof HTMLLinkElement) {
                    clone.href = element.href;
                }
                return clone.outerHTML;
            }).join("\n"),
        );
        expect(styles.length).toBeGreaterThan(0);
        // Only this synthetic page is intercepted; no backend records are touched.
        await page.route(fixtureURL, route => route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                ${styles}
            </head><body class="light"></body></html>`,
        }));
        await page.goto(fixtureURL);
        await page.addScriptTag({ content: bundle });
        const regular = page.locator("#regular-button");
        const long = page.locator("#long-button");
        expect((await bounds(regular)).height).toBe(mobile ? 44 : 36);
        expect((await bounds(long)).height).toBeGreaterThan((await bounds(regular)).height);
        expect(await long.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
        await long.click();
        await expect(page.getByTestId("clicks")).toHaveText("1");

        const input = page.getByRole("searchbox", { name: "搜索附近的徒步线路和完整地点信息" });
        const clear = page.getByRole("button", { name: "clear", exact: true });
        const icon = page.locator(".fa-search");
        const inputBounds = await bounds(input);
        for (const control of [clear, icon]) {
            const controlBounds = await bounds(control);
            expect(Math.abs(controlBounds.y + controlBounds.height / 2 - inputBounds.y - inputBounds.height / 2)).toBeLessThan(2);
        }
        expect((await bounds(clear)).height).toBe(mobile ? 44 : 32);
        if (mobile) {
            expect(await input.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
        }
        await clear.click();
        await expect(input).toHaveValue("");
        await expect(page.getByTestId("query")).toHaveText("");
        await expect(clear).not.toBeVisible();

        const select = page.getByRole("button", { name: "路线类型", exact: true });
        expect((await bounds(select)).height).toBeGreaterThanOrEqual(mobile ? 44 : 36);
        expect(await select.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
        await select.focus();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("selection")).toHaveText("second");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        await page.getByRole("button", { name: "打开对话框", exact: true }).click();
        const dialog = page.locator("dialog[open]");
        await expect(dialog).toBeVisible();
        // A modal without a footer must contain only its header and body.
        await expect(dialog.locator(":scope > div > div")).toHaveCount(2);
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect.poll(() => page.locator("body").evaluate(element => element.style.position)).not.toBe("fixed");
    });
}
