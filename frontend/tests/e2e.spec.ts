import { test, expect, type Page } from '@playwright/test';

test.describe('Frontend wiring checks', () => {
  test('login page loads with correct title and form fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/Rohadas CA/i);

    // Brand heading
    await expect(page.getByRole('heading', { name: /Rohadas CA/i })).toBeVisible();

    // Email + password fields are present
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
  });

  test('API proxy: frontend /api/health reaches backend', async ({ page }) => {
    // Use page.goto with the API proxy path — the Next dev server should
    // rewrite /api/health to http://127.0.0.1:8000/api/health
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('API proxy: frontend /api/health/db reaches backend DB', async ({ page }) => {
    const response = await page.request.get('/api/health/db');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe(true);
  });

  test('unauthenticated /dashboard redirects to login (auth shell)', async ({ page }) => {
    // The (app) group layout calls GET /auth/me; on 401 the useEffect
    // redirects to /login. We must wait for that client-side redirect.
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

   test('failed login does not trigger a spurious refresh request', async ({ page }) => {
    // A 401 from /auth/login means "wrong credentials", not "expired token".
    // The old code treated every 401 as a signal to refresh, which fired a
    // pointless POST /auth/refresh that also 401'd and clattered the console.
    // Track every API request so we can assert none of them hit /auth/refresh.
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) {
        apiRequests.push(url);
      }
    });

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill('wrong@example.com');
    await page.getByLabel(/Password/i).fill('definitely-wrong');
    await page.getByRole('button', { name: /Sign in/i }).click();

    // The login error must surface without any background refresh attempt.
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
    await expect(apiRequests.every((url) => !url.includes('/auth/refresh'))).toBe(true);
  });

  test('authenticated user sees role options in Add Member modal', async ({ page }) => {
    // The role dropdown is populated from GET /roles (which requires role.read).
    // If the session token lacks that permission the query 403s silently and
    // the dropdown appears empty — this test guards against that regression.
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill('owner@rohadas.com');
    await page.getByLabel(/Password/i).fill('Changepassword123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    // Navigate to team page and open the Add Member modal.
    await page.goto('/team');
    await page.getByRole('button', { name: /Add Member/i }).click();

    // The Role dropdown must have more than just the placeholder option.
    // Find it via its <label> association (not the select's own text).
    await expect(page.getByRole('dialog').getByLabel('Role')).toBeVisible();
    const options = page.getByRole('dialog').getByLabel('Role').locator('option');
    await expect(options).not.toHaveCount(1); // should not be just the placeholder
  });

  test('team member ellipsis menu shows Details, Edit, Delete', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill('owner@rohadas.com');
    await page.getByLabel(/Password/i).fill('Changepassword123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto('/team');

    // Locate the first ⋮ button in the member table and click it.
    const memberRows = page.locator('tbody tr');
    const firstDotsButton = memberRows.first().getByRole('button', { name: /Actions for/i });
    await firstDotsButton.click();

    // The dropdown should expose all three actions.
    await expect(page.getByText('Details')).toBeVisible();
    await expect(page.getByText('Edit')).toBeVisible();
    await expect(page.getByText('Delete')).toBeVisible();
  });
});
