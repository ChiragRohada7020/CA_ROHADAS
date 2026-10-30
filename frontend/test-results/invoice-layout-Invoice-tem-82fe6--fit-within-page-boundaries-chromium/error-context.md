# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: invoice-layout.spec.ts >> Invoice template layout verification >> all invoice tables fit within page boundaries
- Location: tests/invoice-layout.spec.ts:85:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e10]:
        - generic [ref=e11]: Rohadas
        - paragraph [ref=e17]: Sign in to your firm.
      - generic [ref=e18]:
        - generic [ref=e19]:
          - generic [ref=e21]:
            - generic [ref=e22]: Email *
            - textbox "Email *" [ref=e23]:
              - /placeholder: partner@example.com
              - text: owner@rohadas.com
          - generic [ref=e25]:
            - generic [ref=e26]: Password *
            - generic [ref=e27]:
              - textbox "Password *" [ref=e28]:
                - /placeholder: ••••••••
                - text: Changepassword123!
              - button [ref=e29]
          - alert [ref=e34]: Invalid email or password
          - button "Sign in" [ref=e35]
        - generic [ref=e36]:
          - text: First time here?
          - button "Set up your firm" [ref=e37]
  - button "Open Next.js Dev Tools" [ref=e43] [cursor=pointer]
  - alert [ref=e47]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | const TEST_CREDENTIALS = {
  4   |   email: 'owner@rohadas.com',
  5   |   password: 'Changepassword123!',
  6   | };
  7   | 
  8   | async function login(page: Page) {
  9   |   await page.goto('/login');
  10  |   await page.getByLabel(/Email/i).fill(TEST_CREDENTIALS.email);
  11  |   await page.getByLabel(/Password/i).fill(TEST_CREDENTIALS.password);
  12  |   await page.getByRole('button', { name: /Sign in/i }).click();
> 13  |   await page.waitForURL(/\/dashboard/);
      |              ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  14  | }
  15  | 
  16  | async function getInvoiceIds(page: Page): Promise<string[]> {
  17  |   await page.goto('/invoices');
  18  |   await page.waitForTimeout(2000);
  19  |   const invoiceLinks = page.locator('a[href*="/invoices/"]');
  20  |   const count = await invoiceLinks.count();
  21  |   const ids: string[] = [];
  22  |   for (let i = 0; i < count; i++) {
  23  |     const href = await invoiceLinks.nth(i).getAttribute('href');
  24  |     if (href) {
  25  |       const match = href.match(/\/invoices\/([^/]+)/);
  26  |       if (match) ids.push(match[1]);
  27  |     }
  28  |   }
  29  |   return ids;
  30  | }
  31  | 
  32  | function expectTableWithinBounds(tableLocator: ReturnType<Page['locator']>) {
  33  |   test('table does not overflow page width', async ({ page }) => {
  34  |     const table = tableLocator;
  35  |     await expect(table).toBeVisible();
  36  |     const box = await table.boundingBox();
  37  |     if (box) {
  38  |       const viewport = page.viewportSize();
  39  |       if (viewport) {
  40  |         expect(box.x).toBeGreaterThanOrEqual(0);
  41  |         expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  42  |       }
  43  |     }
  44  |   });
  45  | 
  46  |   test('description cells wrap text instead of truncating', async ({ page }) => {
  47  |     const cells = tableLocator.locator('td:nth-child(2)');
  48  |     const count = await cells.count();
  49  |     for (let i = 0; i < count; i++) {
  50  |       const cell = cells.nth(i);
  51  |       const text = await cell.textContent();
  52  |       if (text && text.length > 30) {
  53  |         // Long descriptions should wrap (multiple lines), not be truncated with ellipsis
  54  |         const lineHeight = await cell.evaluate((el) => {
  55  |           const cs = window.getComputedStyle(el);
  56  |           return cs.overflowWrap || cs.wordWrap;
  57  |         });
  58  |         expect(lineHeight).toMatch(/break-word|anywhere|normal/);
  59  |       }
  60  |     }
  61  |   });
  62  | 
  63  |   test('monetary columns stay aligned', async ({ page }) => {
  64  |     const amountCells = tableLocator.locator('td:last-child');
  65  |     const count = await amountCells.count();
  66  |     for (let i = 0; i < count; i++) {
  67  |       const cell = amountCells.nth(i);
  68  |       const box = await cell.boundingBox();
  69  |       if (box) {
  70  |         // Amount cells should be right-aligned
  71  |         const textAlign = await cell.evaluate((el) => {
  72  |           return window.getComputedStyle(el).textAlign;
  73  |         });
  74  |         expect(textAlign).toBe('right');
  75  |       }
  76  |     }
  77  |   });
  78  | }
  79  | 
  80  | test.describe('Invoice template layout verification', () => {
  81  |   test.beforeEach(async ({ page }) => {
  82  |     await login(page);
  83  |   });
  84  | 
  85  |   test('all invoice tables fit within page boundaries', async ({ page }) => {
  86  |     const invoiceIds = await getInvoiceIds(page);
  87  |     if (invoiceIds.length === 0) {
  88  |       test.skip();
  89  |       return;
  90  |     }
  91  | 
  92  |     for (const id of invoiceIds.slice(0, 3)) {
  93  |       await page.goto(`/invoices/${id}`);
  94  |       await page.waitForTimeout(2000);
  95  | 
  96  |       const tables = page.locator('table');
  97  |       const count = await tables.count();
  98  |       for (let i = 0; i < count; i++) {
  99  |         const table = tables.nth(i);
  100 |         const box = await table.boundingBox();
  101 |         if (box) {
  102 |           const viewport = page.viewportSize();
  103 |           if (viewport) {
  104 |             expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  105 |           }
  106 |         }
  107 |       }
  108 |     }
  109 |   });
  110 | 
  111 |   test('description column wraps long text', async ({ page }) => {
  112 |     const invoiceIds = await getInvoiceIds(page);
  113 |     if (invoiceIds.length === 0) {
```