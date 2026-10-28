# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> Frontend wiring checks >> team member ellipsis menu shows Details, Edit, Delete
- Location: tests/e2e.spec.ts:89:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Details')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Details') with timeout 5000ms
  - waiting for getByText('Details')

```

```yaml
- complementary:
  - text: CA
  - paragraph: Rohadas CA
  - paragraph: CA Practice Management
  - navigation:
    - link "Dashboard":
      - /url: /dashboard
    - link "Clients":
      - /url: /clients
    - link "Tasks":
      - /url: /tasks
    - link "Compliance":
      - /url: /calendar
    - text: Audit next
    - link "Documents":
      - /url: /documents
    - link "Billing":
      - /url: /invoices
    - link "Receivables":
      - /url: /receivables
    - link "Team":
      - /url: /team
    - link "Reports":
      - /url: /reports
    - link "Services":
      - /url: /services
    - link "Integrations":
      - /url: /integrations
    - link "Communications":
      - /url: /communications
    - link "Settings":
      - /url: /settings
    - link "Assistant":
      - /url: /assistant
  - paragraph: Financial year
  - paragraph: None set up yet
  - paragraph: Rohada & Associates
  - paragraph: No address set
  - button "Sign out"
- banner:
  - heading "Team" [level=1]
  - text: Search clients, tasks, documents… next
  - button "Add"
  - button "Notifications"
  - button "Following system — click for light":
    - img
  - text: RO
  - paragraph: Rohada Owner
  - paragraph: Owner
- main:
  - heading "Team" [level=2]
  - paragraph: Manage your team, roles, workload and performance.
  - link "Per-User Permissions":
    - /url: /team/permissions
  - link "Roles & Permissions":
    - /url: /team/roles
  - button "Add Member"
  - paragraph: Total Members
  - paragraph: "15"
  - paragraph: 0 joined this year
  - paragraph: Active Members
  - paragraph: "9"
  - paragraph: 6 not active
  - paragraph: Total Workload
  - paragraph: "298"
  - paragraph: 98 overdue
  - paragraph: Average Utilisation
  - paragraph: 0%
  - paragraph: Nobody over capacity
  - button "All Members15"
  - button "Partners5"
  - button "Managers0"
  - button "Seniors1"
  - button "Articles0"
  - button "Assistants3"
  - searchbox "Search team"
  - combobox "Department":
    - option "Department" [selected]
    - option "Taxation"
    - option "Test"
  - combobox "Status":
    - option "Status" [selected]
    - option "Active"
    - option "Invited"
    - option "Suspended"
    - option "Disabled"
  - button "Clear" [disabled]
  - table:
    - rowgroup:
      - 'row "Select all members on this page # Name Role Department Open Tasks Overdue Utilisation Status"':
        - columnheader "Select all members on this page":
          - checkbox "Select all members on this page"
        - columnheader "#"
        - columnheader "Name"
        - columnheader "Role"
        - columnheader "Department"
        - columnheader "Open Tasks"
        - columnheader "Overdue"
        - columnheader "Utilisation"
        - columnheader "Status"
        - columnheader
    - rowgroup:
      - row "Select New User 1 NU New User newuser@test.com — — 0 0 0% Invited Actions for New User":
        - cell "Select New User":
          - checkbox "Select New User"
        - cell "1"
        - cell "NU New User newuser@test.com":
          - button "NU New User newuser@test.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Invited"
        - cell "Actions for New User":
          - button "Actions for New User": ⋮
      - row "Select New User 2 2 NU New User 2 newuser2@test.com — — 0 0 0% Invited Actions for New User 2":
        - cell "Select New User 2":
          - checkbox "Select New User 2"
        - cell "2"
        - cell "NU New User 2 newuser2@test.com":
          - button "NU New User 2 newuser2@test.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Invited"
        - cell "Actions for New User 2":
          - button "Actions for New User 2": ⋮
      - row "Select Rohada Owner 3 RO Rohada Owner owner@rohadas.com Owner Partner — 98 98 0% Active Actions for Rohada Owner":
        - cell "Select Rohada Owner":
          - checkbox "Select Rohada Owner"
        - cell "3"
        - cell "RO Rohada Owner owner@rohadas.com":
          - button "RO Rohada Owner owner@rohadas.com"
        - cell "Owner Partner"
        - cell "—"
        - cell "98"
        - cell "98"
        - cell "0%"
        - cell "Active"
        - cell "Actions for Rohada Owner":
          - button "Actions for Rohada Owner": ⋮
      - row "Select Rohit Rohada 4 RR Rohit Rohada partner@example.com — Partner — 100 0 0% Active Actions for Rohit Rohada":
        - cell "Select Rohit Rohada":
          - checkbox "Select Rohit Rohada"
        - cell "4"
        - cell "RR Rohit Rohada partner@example.com":
          - button "RR Rohit Rohada partner@example.com"
        - cell "— Partner"
        - cell "—"
        - cell "100"
        - cell "0"
        - cell "0%"
        - cell "Active"
        - cell "Actions for Rohit Rohada":
          - button "Actions for Rohit Rohada": ⋮
      - row "Select Test Add 5 TA Test Add test.add@example.com — — 0 0 0% Invited Actions for Test Add":
        - cell "Select Test Add":
          - checkbox "Select Test Add"
        - cell "5"
        - cell "TA Test Add test.add@example.com":
          - button "TA Test Add test.add@example.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Invited"
        - cell "Actions for Test Add":
          - button "Actions for Test Add": ⋮
      - row "Select Test Dev User 6 TD Test Dev User test-dev@example.com Partner Partner Test 100 0 0% Active Actions for Test Dev User":
        - cell "Select Test Dev User":
          - checkbox "Select Test Dev User"
        - cell "6"
        - cell "TD Test Dev User test-dev@example.com":
          - button "TD Test Dev User test-dev@example.com"
        - cell "Partner Partner"
        - cell "Test"
        - cell "100"
        - cell "0"
        - cell "0%"
        - cell "Active"
        - cell "Actions for Test Dev User":
          - button "Actions for Test Dev User": ⋮
      - row "Select Test Five 7 TF Test Five test5@example.com Senior Associate Taxation 0 0 0% Active Actions for Test Five":
        - cell "Select Test Five":
          - checkbox "Select Test Five"
        - cell "7"
        - cell "TF Test Five test5@example.com":
          - button "TF Test Five test5@example.com"
        - cell "Senior Associate"
        - cell "Taxation"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Active"
        - cell "Actions for Test Five":
          - button "Actions for Test Five": ⋮
      - row "Select Test Four 8 TF Test Four test4@example.com — — 0 0 0% Active Actions for Test Four":
        - cell "Select Test Four":
          - checkbox "Select Test Four"
        - cell "8"
        - cell "TF Test Four test4@example.com":
          - button "TF Test Four test4@example.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Active"
        - cell "Actions for Test Four":
          - button "Actions for Test Four": ⋮
      - row "Select Test Two 9 TT Test Two test2@example.com — — 0 0 0% Invited Actions for Test Two":
        - cell "Select Test Two":
          - checkbox "Select Test Two"
        - cell "9"
        - cell "TT Test Two test2@example.com":
          - button "TT Test Two test2@example.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Invited"
        - cell "Actions for Test Two":
          - button "Actions for Test Two": ⋮
      - row "Select Test User 3 10 TU Test User 3 testuser3@test.com — — 0 0 0% Invited Actions for Test User 3":
        - cell "Select Test User 3":
          - checkbox "Select Test User 3"
        - cell "10"
        - cell "TU Test User 3 testuser3@test.com":
          - button "TU Test User 3 testuser3@test.com"
        - cell "—"
        - cell "—"
        - cell "0"
        - cell "0"
        - cell "0%"
        - cell "Invited"
        - cell "Actions for Test User 3":
          - button "Actions for Test User 3": ⋮
  - paragraph: Showing 1–10 of 15
  - button "Previous" [disabled]
  - text: Page 1
  - button "Next"
  - heading "Team Workload" [level=2]
  - paragraph: Effort-weighted, not task counts
  - link "View All":
    - /url: /reports
  - table:
    - rowgroup:
      - row "Name Open Overdue Utilisation":
        - columnheader "Name"
        - columnheader "Open"
        - columnheader "Overdue"
        - columnheader "Utilisation"
    - rowgroup:
      - row "C chirag 0 0 0%":
        - cell "C chirag":
          - button "C chirag"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "UN Updated 0 0 0%":
        - cell "UN Updated":
          - button "UN Updated"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "TA Test 0 0 0%":
        - cell "TA Test":
          - button "TA Test"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "TT Test 0 0 0%":
        - cell "TT Test":
          - button "TT Test"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "TF Test 0 0 0%":
        - cell "TF Test":
          - button "TF Test"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "TF Test 0 0 0%":
        - cell "TF Test":
          - button "TF Test"
        - cell "0"
        - cell "0"
        - cell "0%"
      - row "RO Rohada 98 98 0%":
        - cell "RO Rohada":
          - button "RO Rohada"
        - cell "98"
        - cell "98"
        - cell "0%"
      - row "TD Test 100 0 0%":
        - cell "TD Test":
          - button "TD Test"
        - cell "100"
        - cell "0"
        - cell "0%"
  - heading "Tasks by Department" [level=2]
  - paragraph: Open work, by practice area
  - img "Open Tasks"
  - text: 298 Open Tasks
  - list:
    - listitem: Test — 100 (34%) 100(34%)
  - heading "Leave & Attendance (October 2026)" [level=2]
  - paragraph: Recorded days only
  - text: Present On Leave Holiday Half Day
  - paragraph: S
  - paragraph: M
  - paragraph: T
  - paragraph: W
  - paragraph: T
  - paragraph: F
  - paragraph: S
  - paragraph: "1"
  - paragraph: "2"
  - paragraph: "3"
  - paragraph: "4"
  - paragraph: "5"
  - paragraph: "6"
  - paragraph: "7"
  - paragraph: "8"
  - paragraph: "9"
  - paragraph: "10"
  - paragraph: "11"
  - paragraph: "12"
  - paragraph: "13"
  - paragraph: "14"
  - paragraph: "15"
  - paragraph: "16"
  - paragraph: "17"
  - paragraph: "18"
  - paragraph: "19"
  - paragraph: "20"
  - paragraph: "21"
  - paragraph: "22"
  - paragraph: "23"
  - paragraph: "24"
  - paragraph: "25"
  - paragraph: "26"
  - paragraph: "27"
  - paragraph: "28"
  - paragraph: "29"
  - paragraph: "30"
  - paragraph: "31"
  - paragraph: 0 present · 0 on leave · 0 holiday · 0 half day
- alert
```

# Test source

```ts
  4   |   test('login page loads with correct title and form fields', async ({ page }) => {
  5   |     await page.goto('/login');
  6   | 
  7   |     await expect(page).toHaveTitle(/Rohadas CA/i);
  8   | 
  9   |     // Brand heading
  10  |     await expect(page.getByRole('heading', { name: /Rohadas CA/i })).toBeVisible();
  11  | 
  12  |     // Email + password fields are present
  13  |     await expect(page.getByLabel(/Email/i)).toBeVisible();
  14  |     await expect(page.getByLabel(/Password/i)).toBeVisible();
  15  | 
  16  |     // Submit button
  17  |     await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
  18  |   });
  19  | 
  20  |   test('API proxy: frontend /api/health reaches backend', async ({ page }) => {
  21  |     // Use page.goto with the API proxy path — the Next dev server should
  22  |     // rewrite /api/health to http://127.0.0.1:8000/api/health
  23  |     const response = await page.request.get('/api/health');
  24  |     expect(response.status()).toBe(200);
  25  |     const body = await response.json();
  26  |     expect(body.status).toBe('ok');
  27  |   });
  28  | 
  29  |   test('API proxy: frontend /api/health/db reaches backend DB', async ({ page }) => {
  30  |     const response = await page.request.get('/api/health/db');
  31  |     expect(response.status()).toBe(200);
  32  |     const body = await response.json();
  33  |     expect(body.status).toBe('ok');
  34  |     expect(body.database).toBe(true);
  35  |   });
  36  | 
  37  |   test('unauthenticated /dashboard redirects to login (auth shell)', async ({ page }) => {
  38  |     // The (app) group layout calls GET /auth/me; on 401 the useEffect
  39  |     // redirects to /login. We must wait for that client-side redirect.
  40  |     await page.goto('/dashboard');
  41  |     await page.waitForURL(/\/login/);
  42  |     expect(page.url()).toMatch(/\/login/);
  43  |   });
  44  | 
  45  |    test('failed login does not trigger a spurious refresh request', async ({ page }) => {
  46  |     // A 401 from /auth/login means "wrong credentials", not "expired token".
  47  |     // The old code treated every 401 as a signal to refresh, which fired a
  48  |     // pointless POST /auth/refresh that also 401'd and clattered the console.
  49  |     // Track every API request so we can assert none of them hit /auth/refresh.
  50  |     const apiRequests: string[] = [];
  51  |     page.on('request', (request) => {
  52  |       const url = request.url();
  53  |       if (url.includes('/api/')) {
  54  |         apiRequests.push(url);
  55  |       }
  56  |     });
  57  | 
  58  |     await page.goto('/login');
  59  |     await page.getByLabel(/Email/i).fill('wrong@example.com');
  60  |     await page.getByLabel(/Password/i).fill('definitely-wrong');
  61  |     await page.getByRole('button', { name: /Sign in/i }).click();
  62  | 
  63  |     // The login error must surface without any background refresh attempt.
  64  |     await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  65  |     await expect(apiRequests.every((url) => !url.includes('/auth/refresh'))).toBe(true);
  66  |   });
  67  | 
  68  |   test('authenticated user sees role options in Add Member modal', async ({ page }) => {
  69  |     // The role dropdown is populated from GET /roles (which requires role.read).
  70  |     // If the session token lacks that permission the query 403s silently and
  71  |     // the dropdown appears empty — this test guards against that regression.
  72  |     await page.goto('/login');
  73  |     await page.getByLabel(/Email/i).fill('owner@rohadas.com');
  74  |     await page.getByLabel(/Password/i).fill('Changepassword123!');
  75  |     await page.getByRole('button', { name: /Sign in/i }).click();
  76  |     await page.waitForURL(/\/dashboard/);
  77  | 
  78  |     // Navigate to team page and open the Add Member modal.
  79  |     await page.goto('/team');
  80  |     await page.getByRole('button', { name: /Add Member/i }).click();
  81  | 
  82  |     // The Role dropdown must have more than just the placeholder option.
  83  |     // Find it via its <label> association (not the select's own text).
  84  |     await expect(page.getByRole('dialog').getByLabel('Role')).toBeVisible();
  85  |     const options = page.getByRole('dialog').getByLabel('Role').locator('option');
  86  |     await expect(options).not.toHaveCount(1); // should not be just the placeholder
  87  |   });
  88  | 
  89  |   test('team member ellipsis menu shows Details, Edit, Delete', async ({ page }) => {
  90  |     await page.goto('/login');
  91  |     await page.getByLabel(/Email/i).fill('owner@rohadas.com');
  92  |     await page.getByLabel(/Password/i).fill('Changepassword123!');
  93  |     await page.getByRole('button', { name: /Sign in/i }).click();
  94  |     await page.waitForURL(/\/dashboard/);
  95  | 
  96  |     await page.goto('/team');
  97  | 
  98  |     // Locate the first ⋮ button in the member table and click it.
  99  |     const memberRows = page.locator('tbody tr');
  100 |     const firstDotsButton = memberRows.first().getByRole('button', { name: /Actions for/i });
  101 |     await firstDotsButton.click();
  102 | 
  103 |     // The dropdown should expose all three actions.
> 104 |     await expect(page.getByText('Details')).toBeVisible();
      |                                             ^ Error: expect(locator).toBeVisible() failed
  105 |     await expect(page.getByText('Edit')).toBeVisible();
  106 |     await expect(page.getByText('Delete')).toBeVisible();
  107 |   });
  108 | });
  109 | 
```