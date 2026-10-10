import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const videoDir = path.join(outDir, "playwright-video");
fs.rmSync(videoDir, { recursive: true, force: true });
fs.mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

await page.getByRole("tab", { name: /Quiniela/i }).click();
await page.waitForTimeout(300);
for (const d of ["2", "3"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForTimeout(180);
}
await page.getByRole("button", { name: "RD$50", exact: true }).click();
await page.waitForTimeout(250);
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "23" }).waitFor();
await page.waitForTimeout(900);

await page.getByRole("tab", { name: /Pale/i }).click();
await page.waitForTimeout(300);
for (const d of ["1", "2", "4", "5"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForTimeout(180);
}
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "12 · 45" }).waitFor();
await page.waitForTimeout(900);

await page.getByRole("tab", { name: /Tripleta/i }).click();
await page.waitForTimeout(300);
for (const d of ["0", "7", "1", "4", "2", "8"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForTimeout(160);
}
await page.getByRole("button", { name: "RD$100", exact: true }).click();
await page.waitForTimeout(250);
await page.getByRole("button", { name: /Vender/ }).click();
await page.locator(".receiptNums").filter({ hasText: "07 · 14 · 28" }).waitFor();
await page.waitForTimeout(1200);

await context.close();
await browser.close();

const video = fs.readdirSync(videoDir).find((f) => f.endsWith(".webm"));
if (!video) throw new Error("No video produced");
const dest = path.join(outDir, "loteria-pos-demo.webm");
fs.renameSync(path.join(videoDir, video), dest);
fs.rmSync(videoDir, { recursive: true, force: true });
console.log(dest);
