import { expect, type Locator, type Page } from '@playwright/test';

export class IndexPage {
  readonly page: Page;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    // Error copy is translated; the rendered HTTP status is language-independent.
    this.error = page.getByRole('heading', { level: 1, name: /^[45]\d{2}$/ });
  }

  async goto() {
    const response = await this.page.goto('/', { waitUntil: 'networkidle' });
    expect(response?.status(), 'Homepage document must load successfully').toBe(200);
  }

  async search() {
    // Start waiting for response before triggering the search
    const responsePromise = this.page.waitForResponse(resp =>
      resp.url().includes('/api/v1/search/multi') && resp.status() === 200
    );
    
    await this.page.locator('input[name="q"]').fill('Munich');
    await responsePromise;
    
    await this.page.locator('.menu-item').first().click();
    await this.page.waitForURL(/\/map\?lat=.*&lon=.*/);

  }


  async hasNoError() {
    await expect(this.error).toHaveCount(0);
    await expect(this.page.getByRole('searchbox').first()).toBeVisible();
  }
}
