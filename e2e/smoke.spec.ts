import { expect, Page, test } from '@playwright/test';

// A fixed "now" so opening hours are the same on every run.
const APP = '/?now=2026-11-25T10:00';

/** Collects script errors and Content-Security-Policy violations; call `.expectNone()` at the end. */
async function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // failed map tiles (offline CI, rate limits) are not app bugs; everything else logged as an error is
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return { expectNone: () => expect(problems, problems.join('\n')).toEqual([]) };
}

const search = (page: Page) => page.getByRole('combobox', { name: /search branches/i });

/** Waits for the map to be up with data loaded (clusters only exist once markers are added). */
async function ready(page: Page) {
  await page.goto(APP);
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
}

test('loads the production bundle with a working map and no errors', async ({ page }) => {
  const w = await watch(page);
  await ready(page);
  await expect(
    page.getByRole('heading', { name: 'Capitec branch locator', includeHidden: true }),
  ).toBeAttached();
  await expect(page.locator('body')).toHaveCSS('font-family', /Poppins/);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /Capitec/);
  expect((await page.request.get('/favicon.svg')).headers()['content-type']).toContain('svg');
  w.expectNone();
});

test('searching a place shows the area and its branches', async ({ page }) => {
  const w = await watch(page);
  await ready(page);
  await search(page).fill('paarl');
  const first = page.locator('#suggestions li').first();
  await expect(first).toContainText('City');
  await search(page).press('Enter');
  await expect(search(page)).toHaveValue('Paarl');
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  w.expectNone();
});

test('search works from the keyboard: arrows highlight, Enter picks, Escape closes', async ({
  page,
}) => {
  await ready(page);
  const box = search(page);
  const rows = page.locator('#suggestions [role=option]');

  await box.fill('paarl');
  await expect(rows.first()).toBeVisible();
  await box.press('ArrowDown');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(box).toHaveAttribute('aria-activedescendant', 'suggestion-0');
  await box.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');

  // up from the top wraps to the last row, which is a branch (places are listed first)
  await box.press('ArrowUp');
  await box.press('ArrowUp');
  const last = rows.last();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  const name = (await last.locator('.name').innerText()).trim();
  await box.press('Enter');
  await expect(page.locator('.leaflet-popup')).toContainText(name);

  await box.fill('paarl');
  await box.press('ArrowDown');
  await box.press('Escape');
  await expect(page.locator('#suggestions')).toHaveCount(0);
});

test('Tab reaches the search box and controls before the map', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Tab');
  await expect(search(page)).toBeFocused();
  await page.keyboard.type('paarl');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#suggestions [role=option]').first()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /wheelchair/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeFocused();

  // an opened menu comes next after its button
  await page.getByRole('button', { name: 'Service filters' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('ATM')).toBeVisible(); // rendered before we tab into it
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('ATM')).toBeFocused();
});

test('picking a branch: popup, directions, and details by screen size', async ({ page }, info) => {
  const w = await watch(page);
  await ready(page);
  await search(page).fill('paarl mall');
  await page.locator('#suggestions li button').first().click();

  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Paarl Mall');
  await expect(popup).toContainText('Sample hours');
  await expect(popup.getByRole('link', { name: 'Get directions' })).toHaveAttribute(
    'href',
    /google\.com\/maps\/dir\/.*destination=-?\d/,
  );

  const details = page.locator('app-branch-detail');
  if (info.project.name === 'desktop') {
    // desktop: details open straight away on the left, so the popup has no "More"
    await expect(details).toContainText('Opening hours');
    await expect(popup.getByRole('button', { name: 'More' })).toBeHidden();
  } else {
    // phone: "More" opens a drawer taking most of the width, which closes again
    await expect(details).toHaveCount(0);
    await popup.getByRole('button', { name: 'More' }).click();
    await expect(details).toContainText('Opening hours');
    const box = await details.boundingBox();
    expect(box!.width).toBeGreaterThan(390 * 0.8);
    await details.getByRole('button', { name: 'Close' }).click();
    await expect(details).toHaveCount(0);
  }
  w.expectNone();
});

test('business centres are hidden until Business is ticked', async ({ page }) => {
  await ready(page);
  await search(page).fill('business centre');
  await expect(page.locator('#suggestions')).toContainText('No matches');

  await page.getByRole('button', { name: 'Service filters' }).click();
  await page.getByLabel('Business').check();
  await search(page).fill('business centre');
  await expect(page.locator('#suggestions li button').first()).toContainText('Business Centre');
});

test('wheelchair toggle narrows results and can be switched off', async ({ page }) => {
  await ready(page);
  const toggle = page.getByRole('button', { name: /wheelchair/i });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('theme: dark mode applies and survives a reload', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByLabel('Dark').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('near me focuses the nearest branch', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -33.9249, longitude: 18.4241 }); // Cape Town
  const w = await watch(page);
  await ready(page);
  await page.getByRole('button', { name: 'Find the nearest branch' }).click();
  await expect(search(page)).toHaveValue('Near me');
  await expect(page.locator('.leaflet-popup')).toContainText('Capitec');
  w.expectNone();
});

test('near me stays on the closest match when a visit time is chosen', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -33.9249, longitude: 18.4241 }); // Cape Town
  const w = await watch(page);
  await ready(page);
  await page.getByRole('button', { name: 'Find the nearest branch' }).click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Capitec');

  await page.getByRole('button', { name: /opening hours filter/i }).click();
  await page.getByLabel('Only show open branches').check();
  await expect(search(page)).toHaveValue('Near me');
  await expect(popup).toContainText('Capitec');
  await expect(page.locator('.leaflet-marker-pane .dot.selected')).toBeInViewport();
  w.expectNone();
});

test('near me explains itself when location is blocked', async ({ page, context }) => {
  await context.clearPermissions();
  // headless Chrome has no prompt UI; force a "denied" answer the way a blocked site gets one
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) =>
          fail({ code: 1 }),
      },
    });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Find the nearest branch' }).click();
  await expect(page.getByRole('status').filter({ hasText: /blocked/i })).toBeVisible();
});

test('pins of closed branches are grey', async ({ page }) => {
  const openPins = page.locator('.leaflet-marker-pane .dot:not(.closed)');
  const closedPins = page.locator('.leaflet-marker-pane .dot.closed');

  await ready(page); // a Wednesday morning
  await search(page).fill('paarl');
  await search(page).press('Enter');
  await expect(openPins.first()).toBeVisible();

  await page.goto('/?now=2026-11-29T23:00&place=paarl~western+cape'); // a Sunday night
  await expect(closedPins.first()).toBeVisible();
  await expect(openPins).toHaveCount(0);
});

test('a planned visit is worded for that time, and the chosen pin is centred', async ({ page }) => {
  await page.goto(`${APP}&open=2026-11-28T10:00`); // planning ahead to Saturday
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
  await search(page).fill('paarl mall');
  await page.locator('#suggestions li button').first().click();

  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('will be open on Saturday 28 Nov at 10:00');
  await expect(popup).toContainText('Hours that day');

  // pin and popup sit in the middle, not down behind the control bar
  const { height } = page.viewportSize()!;
  const pin = page.locator('.leaflet-marker-pane .dot.selected');
  await expect
    .poll(async () => {
      const y = (await pin.boundingBox())?.y ?? 0;
      return y > height * 0.4 && y < height * 0.75;
    })
    .toBe(true);
  expect((await popup.boundingBox())!.y).toBeGreaterThan(60);
});

test('a link restores the search, and Share gives a link to the branch', async ({ page }, info) => {
  // stand in for the system share sheet and the clipboard, and remember what was shared
  await page.addInitScript(() => {
    const keep = (url: string) => localStorage.setItem('shared', url);
    Object.defineProperty(navigator, 'share', {
      value: async (d: { url: string }) => keep(d.url),
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (s: string) => keep(s) },
    });
  });
  const w = await watch(page);

  await ready(page);
  await search(page).fill('paarl mall');
  await page.locator('#suggestions li button').first().click();
  await expect(page).toHaveURL(/branch=/);
  const share = page.locator('.leaflet-popup').getByRole('button', { name: 'Share' });
  // wait for the map to stop gliding to the pin, or the button moves away from the note
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await share.boundingBox());
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [500] },
    )
    .toBe(true);
  await share.click();
  if (info.project.name === 'desktop') {
    // copied rather than shared, and says so next to the button
    const note = page.getByRole('status').filter({ hasText: 'Link copied' });
    await expect(note).toBeInViewport();
    const button = await page.locator('.leaflet-popup button', { hasText: 'Share' }).boundingBox();
    expect(Math.abs((await note.boundingBox())!.y - button!.y)).toBeLessThan(70);
  }
  const link = await page.evaluate(() => localStorage.getItem('shared'));
  expect(link).toMatch(/\?branch=[^&]+$/); // no filters, no clock override

  // a link opens like a tapped pin: the popup, with details straight away only on desktop
  await page.goto(link!);
  await expect(page.locator('.leaflet-popup')).toContainText('Paarl Mall');
  const sharedDetails = page.locator('app-branch-detail');
  if (info.project.name === 'desktop') {
    await expect(sharedDetails.locator('h2')).toContainText('Paarl Mall');
  } else {
    await expect(sharedDetails).toHaveCount(0);
    await page.locator('.leaflet-popup').getByRole('button', { name: 'More' }).click();
    await expect(sharedDetails.locator('h2')).toContainText('Paarl Mall');
  }

  await page.goto(`${APP}&place=paarl~western+cape&r=30&s=atm`);
  await expect(search(page)).toHaveValue('Paarl');
  await expect(page).toHaveURL(/now=.*place=paarl~western\+cape&r=30&s=atm/);
  const show = page.getByRole('button', { name: /show list/i });
  if (await show.isVisible()) await show.click();
  await page.getByRole('button', { name: 'Share this search' }).click();
  const searchLink = await page.evaluate(() => localStorage.getItem('shared'));
  expect(searchLink).toMatch(/\/\?place=paarl~western\+cape&r=30&s=atm$/);
  w.expectNone();
});

test('works offline after the first visit', async ({ page, context }) => {
  await ready(page);
  // wait until the service worker has stored the data
  await page.waitForFunction(async () => {
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      if (keys.some((r) => r.url.includes('/api/branches.json'))) return true;
    }
    return false;
  });
  await page.reload(); // now controlled by the worker
  await expect(page.locator('.marker-cluster').first()).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /offline/i })).toBeVisible();
  await search(page).fill('paarl');
  await expect(page.locator('#suggestions li').first()).toContainText('City');
});
test.describe('bottom sheet (phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only');
  const sheet = (page: Page) => page.getByRole('region', { name: 'Branch list' });

  test('the details drawer can be swiped away', async ({ page, context }) => {
    await ready(page);
    await search(page).fill('paarl mall');
    await page.locator('#suggestions li button').first().click();
    await page.locator('.leaflet-popup').getByRole('button', { name: 'More' }).click();
    const details = page.locator('app-branch-detail');
    await expect(details).toContainText('Opening hours');
    // let it finish sliding in, or the finger lands beside it
    await details.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

    // real touch input, so the browser's own scrolling rules apply (synthetic events skip them)
    const touch = await context.newCDPSession(page);
    const { y, height } = (await details.getByRole('table').first().boundingBox())!;
    const point = (x: number) => [{ x, y: y + height / 2 }];
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(300) });
    for (let x = 280; x >= 60; x -= 20) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x) });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(details).toHaveCount(0);
  });

  test('opens from "Show list", changes distance, and a row shows it on the map', async ({
    page,
  }) => {
    const w = await watch(page);
    await ready(page);
    const show = page.getByRole('button', { name: /show list/i });
    await expect(show).toHaveCount(0); // nothing to list when zoomed out

    await search(page).fill('paarl');
    await search(page).press('Enter');
    await expect(sheet(page)).toHaveCount(0); // starts closed
    await show.click();
    await expect(sheet(page).getByRole('heading')).toContainText('within 15 km of Paarl');
    // three rows show, the rest scroll
    const rows = sheet(page).locator('li button');
    await expect(rows.nth(2)).toBeInViewport({ ratio: 0.9 });
    const listBox = (await sheet(page).locator('ul').boundingBox())!;
    const fourth = (await rows.nth(3).boundingBox())!;
    expect(fourth.y).toBeGreaterThanOrEqual(listBox.y + listBox.height - 2);
    await sheet(page).getByRole('button', { name: '50 km' }).click();
    await expect(sheet(page).getByRole('heading')).toContainText('within 50 km of Paarl');

    // the control bar stays usable underneath
    await expect(page.getByRole('button', { name: 'Service filters' })).toBeInViewport();
    const box = await sheet(page).boundingBox();
    const bar = await page.getByRole('navigation', { name: 'Map controls' }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);

    const first = sheet(page).locator('li button').first();
    const name = (await first.locator('.name').innerText()).trim();
    await first.click();
    // the sheet makes way for the popup; details wait for "More"
    await expect(sheet(page)).toHaveCount(0);
    const popup = page.locator('.leaflet-popup');
    await expect(popup).toContainText(name);
    const details = page.locator('app-branch-detail');
    await expect(details).toHaveCount(0);
    await popup.getByRole('button', { name: 'More' }).click();
    await expect(details.getByRole('heading', { level: 2 })).toHaveText(name);
    await details.getByRole('button', { name: 'Close' }).click();

    await show.click();
    await expect(sheet(page).locator('li button[aria-current="true"]')).toContainText(name);
    await sheet(page).getByRole('button', { name: 'Hide' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(show).toBeVisible();
    w.expectNone();
  });
});
test.describe('side list', () => {
  // viewport sizes are set by each test, so run these once
  test.skip(({ isMobile }) => isMobile, 'run once, in the desktop project');
  const panel = (page: Page) => page.getByRole('region', { name: 'Branch list' });

  test('lists a place search; a row opens details and Back returns to the list', async ({
    page,
  }) => {
    const w = await watch(page);
    await ready(page);
    await expect(panel(page)).toContainText('zoom in');

    await search(page).fill('paarl');
    await search(page).press('Enter');
    await expect(panel(page).getByRole('heading')).toContainText('within 15 km of Paarl');
    const first = panel(page).locator('li button').first();
    await expect(first).toContainText('Capitec');
    await expect(first).toContainText(/\d+(\.\d)? (km|m)/);
    const name = (await first.locator('.name').innerText()).trim();
    await first.click();

    const details = page.locator('app-branch-detail');
    await expect(details.getByRole('heading', { level: 2 })).toHaveText(name);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('.leaflet-popup')).toContainText(name);

    await details.getByRole('button', { name: 'Back to results' }).click();
    await expect(panel(page).locator('li button[aria-current="true"]')).toContainText(name);
    w.expectNone();
  });

  test('has the distance picker for a place search', async ({ page }) => {
    await ready(page);
    await search(page).fill('paarl');
    await search(page).press('Enter');
    await panel(page).getByRole('button', { name: '50 km' }).click();
    await expect(panel(page).getByRole('heading')).toContainText('within 50 km of Paarl');
  });
  test('can be hidden and shown again', async ({ page }) => {
    await ready(page);
    await panel(page).getByRole('button', { name: 'Hide' }).click();
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show list' }).click();
    await expect(panel(page)).toBeVisible();
  });

  for (const [label, width, height, side] of [
    ['landscape tablet', 1024, 768, true],
    ['portrait tablet', 768, 1024, false],
    ['phone', 390, 800, false],
    ['landscape phone', 932, 430, false],
  ] as const) {
    test(`is ${side ? 'a side list' : 'a bottom sheet'} on a ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await ready(page);
      await search(page).fill('paarl');
      await search(page).press('Enter');
      if (!side) await page.getByRole('button', { name: /show list/i }).click();
      const box = await panel(page).boundingBox();
      expect(box!.y).toBeGreaterThan(0);
      expect(box!.y + box!.height).toBeLessThan(height);
      if (side) expect(box!.x).toBeLessThan(20);
      else expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(5);
    });
  }
});
