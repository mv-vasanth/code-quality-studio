import { test, expect } from '@playwright/test';
test('checkout', async ({ page }) => {
  await page.goto('https://staging.example.com/cart');
  await page.waitForTimeout(3000);
  await page.locator('//button[@id="pay"]').click();
  page.getByRole('button', { name: 'Next' }).click();
  const pw = "hunter2supersecret";
  await expect(page.locator('#total')).toBeTruthy();
});
