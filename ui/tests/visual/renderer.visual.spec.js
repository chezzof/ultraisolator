const { expect, test } = require('@playwright/test');
const { gotoMockedRenderer, installRendererMock, waitForAppReady } = require('../fixtures/rendererMock');

test.beforeEach(() => {
  expect(typeof installRendererMock).toBe('function');
});

test.describe('renderer visual regression', () => {
  test('Dashboard command center', async ({ page }) => {
    await gotoMockedRenderer(page, '#dashboard');
    await waitForAppReady(page, '.dashboard-profile-hero');
    await expect(page.locator('.main-content')).toHaveScreenshot('dashboard-command-center.png', {
      animations: 'disabled'
    });
  });

  test('Settings safety hierarchy', async ({ page }) => {
    await gotoMockedRenderer(page, '#settings');
    await waitForAppReady(page, '.settings-page');
    await expect(page.locator('.main-content')).toHaveScreenshot('settings-safety-hierarchy.png', {
      animations: 'disabled'
    });
  });

  test('Topology core map', async ({ page }) => {
    await gotoMockedRenderer(page, '#topology');
    await waitForAppReady(page, '.topology-map');
    await expect(page.locator('.topology-layout')).toHaveScreenshot('topology-core-map.png', {
      animations: 'disabled'
    });
  });

  test('backend-unavailable Dashboard error state', async ({ page }) => {
    await gotoMockedRenderer(page, '#dashboard', { backendUnavailable: true });
    await waitForAppReady(page, '.dashboard-profile-hero');
    await expect(page.locator('.main-content')).toHaveScreenshot('dashboard-backend-unavailable.png', {
      animations: 'disabled'
    });
  });
});
