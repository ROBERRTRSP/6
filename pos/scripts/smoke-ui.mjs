import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await page.getByText("Banca Rápida").first().waitFor();

await page.screenshot({ path: path.join(outDir, "pos-initial.png"), fullPage: true });

// Quiniela 23 @ RD$50
await page.getByRole("tab", { name: /Quiniela/i }).click();
await page.getByRole("button", { name: "2", exact: true }).click();
await page.getByRole("button", { name: "3", exact: true }).click();
await page.getByRole("button", { name: "RD$50", exact: true }).click();
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "23" }).waitFor({ timeout: 5000 });
await page.screenshot({ path: path.join(outDir, "pos-quiniela-sold.png"), fullPage: true });

// Pale 12-45
await page.getByRole("tab", { name: /Pale/i }).click();
await page.getByRole("button", { name: "1", exact: true }).click();
await page.getByRole("button", { name: "2", exact: true }).click();
await page.getByRole("button", { name: "4", exact: true }).click();
await page.getByRole("button", { name: "5", exact: true }).click();
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "12 · 45" }).waitFor({ timeout: 5000 });
await page.screenshot({ path: path.join(outDir, "pos-pale-sold.png"), fullPage: true });

// Tripleta 01-08-99
await page.getByRole("tab", { name: /Tripleta/i }).click();
for (const d of ["0", "1", "0", "8", "9", "9"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
}
await page.getByRole("button", { name: "RD$100", exact: true }).click();
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "01 · 08 · 99" }).waitFor({ timeout: 5000 });
await page.screenshot({ path: path.join(outDir, "pos-tripleta-sold.png"), fullPage: true });
const summaryText = await page.locator(".summaryStrip").innerText();
console.log("SUMMARY:\n" + summaryText);
console.log("SMOKE_OK");
await browser.close();
