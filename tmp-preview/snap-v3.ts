// v3 整站截图脚本 — 7 个页面
import { chromium } from "playwright-core";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pages = [
  { name: "v3-p0-config", file: "v3-p0-config.html" },
  { name: "v3-index", file: "v3-index.html" },
  { name: "v3-profile", file: "v3-profile.html" },
  { name: "v3-orders", file: "v3-orders.html" },
  { name: "v3-recharge", file: "v3-recharge.html" },
  { name: "v3-undercover-game", file: "v3-undercover-game.html" },
  { name: "v3-undercover-result", file: "v3-undercover-result.html" },
];

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  for (const p of pages) {
    const page = await ctx.newPage();
    const url = "file://" + join(__dirname, p.file);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const sw = document.querySelector(".phase-switcher");
      if (sw) sw.style.display = "none";
    });
    await page.waitForTimeout(150);
    const outPath = join(__dirname, `${p.name}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log("✓ saved", outPath);
    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
