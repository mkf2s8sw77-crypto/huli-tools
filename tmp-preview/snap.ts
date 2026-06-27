// 谁是卧底 v2 — 4 phase 截图脚本
// 用本地 Playwright + system Chrome,避免共享 MCP 浏览器被其他 agent 干扰
import { chromium } from "playwright-core";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const phases = [
  { name: "p0-config", file: "p0-config.html" },
  { name: "p1-game", file: "p1-game.html" },
  { name: "p2-vote", file: "p2-vote.html" },
  { name: "p3-result", file: "p3-result.html" },
];

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, // iPhone-like
  });

  for (const p of phases) {
    const page = await ctx.newPage();
    const url = "file://" + join(__dirname, p.file);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // hide phase switcher before screenshot
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
