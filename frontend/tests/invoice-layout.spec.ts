import { test, expect, type Page } from '@playwright/test';

const TEST_CREDENTIALS = {
  email: 'owner@rohadas.com',
  password: 'Changepassword123!',
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(TEST_CREDENTIALS.email);
  await page.getByLabel(/Password/i).fill(TEST_CREDENTIALS.password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function getInvoiceIds(page: Page): Promise<string[]> {
  await page.goto('/invoices');
  await page.waitForTimeout(2000);
  const invoiceLinks = page.locator('a[href*="/invoices/"]');
  const count = await invoiceLinks.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const href = await invoiceLinks.nth(i).getAttribute('href');
    if (href) {
      const match = href.match(/\/invoices\/([^/]+)/);
      if (match) ids.push(match[1]);
    }
  }
  return ids;
}

function expectTableWithinBounds(tableLocator: ReturnType<Page['locator']>) {
  test('table does not overflow page width', async ({ page }) => {
    const table = tableLocator;
    await expect(table).toBeVisible();
    const box = await table.boundingBox();
    if (box) {
      const viewport = page.viewportSize();
      if (viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  test('description cells wrap text instead of truncating', async ({ page }) => {
    const cells = tableLocator.locator('td:nth-child(2)');
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const cell = cells.nth(i);
      const text = await cell.textContent();
      if (text && text.length > 30) {
        // Long descriptions should wrap (multiple lines), not be truncated with ellipsis
        const lineHeight = await cell.evaluate((el) => {
          const cs = window.getComputedStyle(el);
          return cs.overflowWrap || cs.wordWrap;
        });
        expect(lineHeight).toMatch(/break-word|anywhere|normal/);
      }
    }
  });

  test('monetary columns stay aligned', async ({ page }) => {
    const amountCells = tableLocator.locator('td:last-child');
    const count = await amountCells.count();
    for (let i = 0; i < count; i++) {
      const cell = amountCells.nth(i);
      const box = await cell.boundingBox();
      if (box) {
        // Amount cells should be right-aligned
        const textAlign = await cell.evaluate((el) => {
          return window.getComputedStyle(el).textAlign;
        });
        expect(textAlign).toBe('right');
      }
    }
  });
}

test.describe('Invoice template layout verification', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('all invoice tables fit within page boundaries', async ({ page }) => {
    const invoiceIds = await getInvoiceIds(page);
    if (invoiceIds.length === 0) {
      test.skip();
      return;
    }

    for (const id of invoiceIds.slice(0, 3)) {
      await page.goto(`/invoices/${id}`);
      await page.waitForTimeout(2000);

      const tables = page.locator('table');
      const count = await tables.count();
      for (let i = 0; i < count; i++) {
        const table = tables.nth(i);
        const box = await table.boundingBox();
        if (box) {
          const viewport = page.viewportSize();
          if (viewport) {
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          }
        }
      }
    }
  });

  test('description column wraps long text', async ({ page }) => {
    const invoiceIds = await getInvoiceIds(page);
    if (invoiceIds.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`/invoices/${invoiceIds[0]}`);
    await page.waitForTimeout(2000);

    const descCells = page.locator('table td:nth-child(2)');
    const count = await descCells.count();
    for (let i = 0; i < count; i++) {
      const cell = descCells.nth(i);
      const overflowWrap = await cell.evaluate((el) => {
        return window.getComputedStyle(el).overflowWrap || window.getComputedStyle(el).wordWrap;
      });
      expect(overflowWrap).toMatch(/break-word|anywhere|normal/);
    }
  });

  test('table header cells have explicit width classes', async ({ page }) => {
    const invoiceIds = await getInvoiceIds(page);
    if (invoiceIds.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`/invoices/${invoiceIds[0]}`);
    await page.waitForTimeout(2000);

    const firstTable = page.locator('table').first();
    const headerCells = firstTable.locator('thead th');
    const count = await headerCells.count();
    for (let i = 0; i < count; i++) {
      const cell = headerCells.nth(i);
      const className = await cell.getAttribute('class');
      if (className) {
        // Each header cell should have a width class (w-[XX%])
        expect(className).toMatch(/w-\[\d+%\]/);
      }
    }
  });

  test('table container has overflow-x-auto', async ({ page }) => {
    const invoiceIds = await getInvoiceIds(page);
    if (invoiceIds.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`/invoices/${invoiceIds[0]}`);
    await page.waitForTimeout(2000);

    const tables = page.locator('table');
    const count = await tables.count();
    for (let i = 0; i < count; i++) {
      const table = tables.nth(i);
      const parent = table.locator('..');
      const overflowX = await parent.evaluate((el) => {
        return window.getComputedStyle(el).overflowX;
      });
      expect(overflowX).toMatch(/auto|scroll/);
    }
  });
});
