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

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await page.getByText("Banca Rápida").first().waitFor();
await page.screenshot({ path: path.join(outDir, "pos-do-games.png"), fullPage: true });

async function sellBall(tab, digits, amountLabel, receiptText) {
  await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
  for (const d of digits) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
  if (amountLabel) await page.getByRole("button", { name: amountLabel, exact: true }).click();
  await page.getByRole("button", { name: /Vender/ }).click();
  await page.locator(".receiptNums").filter({ hasText: receiptText }).waitFor({ timeout: 5000 });
}

async function sellPick(tab, mode, digits, receiptText) {
  await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
  await page.getByRole("button", { name: mode, exact: true }).click();
  for (const d of digits) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
  await page.getByRole("button", { name: /Vender/ }).click();
  await page.locator(".receiptNums").filter({ hasText: receiptText }).waitFor({ timeout: 5000 });
}

await sellBall("Quiniela", ["2", "3"], "RD$50", "23");
await sellBall("Súper Pale", ["1", "2", "4", "5"], null, "12 · 45");
await sellPick("Pick 3", "Box", ["1", "2", "3"], "1 2 3");
await sellPick("Pick 4", "Straight", ["9", "8", "7", "6"], "9 8 7 6");
await page.screenshot({ path: path.join(outDir, "pos-do-pick4-sold.png"), fullPage: true });

console.log("SMOKE_OK");
await browser.close();
