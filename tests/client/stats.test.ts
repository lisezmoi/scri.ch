import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { build } from "../../scripts/build";
import { createApp } from "../../src/server/app";
import { loadConfig } from "../../src/server/config";

test(
  "stats supports year/scale navigation, pointer and keyboard counts, mobile and no JavaScript",
  async () => {
    const root = mkdtempSync("/tmp/scrich-stats-browser-");
    const assets = join(root, "assets");
    await build(assets);
    const app = createApp(
      loadConfig({
        DATA_DIR: join(root, "data"),
        STATS_PASSWORD: "pass",
      }),
      assets,
    );
    app.database.raw.transaction(() => {
      for (let id = 1; id <= 2001; id++) {
        app.database.insertImported({
          id,
          shortId: id.toString(36),
          settings: {},
          createdAt: `2024-02-${id === 1 ? "28" : "29"}T00:00:00Z`,
        });
      }
    })();
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        httpCredentials: { username: "", password: "pass" },
      });
      const page = await context.newPage();
      const external: string[] = [];
      const errors: string[] = [];
      page.on("request", request => {
        if (new URL(request.url()).origin !== server.url.origin) external.push(request.url());
      });
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(new URL("/stats", server.url).href);
      expect(await page.locator("link[rel=\"stylesheet\"]").count()).toBe(1);
      expect(await page.locator("body").evaluate(element => getComputedStyle(element).marginTop))
        .toBe("80px");
      expect(
        await page.getByRole("link", { name: "Logarithmic", exact: true }).evaluate(element =>
          getComputedStyle(element).color
        ),
      ).toBe("rgb(0, 0, 0)");
      expect(await page.locator("header").textContent()).toBe("scri.ch/stats - 2,001 drawings");
      expect(await page.getByText("Drawings per month", { exact: true }).count()).toBe(1);
      expect(
        await page.getByRole("link", { name: "Logarithmic", exact: true }).getAttribute(
          "aria-current",
        ),
      ).toBe("true");
      await Promise.all([
        page.waitForURL("**/stats?year=2024&scale=log"),
        page.locator("#stats-year").selectOption("2024"),
      ]);
      const graph = page.locator("#stats-graph");
      await graph.focus();
      await page.keyboard.press("Home");
      expect(await page.locator("#stats-readout").textContent()).toBe("2024-01-01: 0 drawings");
      await page.keyboard.press("ArrowRight");
      expect(await graph.getAttribute("aria-valuetext")).toBe("2024-01-02: 0 drawings");
      await page.keyboard.press("End");
      expect(await page.locator("#stats-readout").textContent()).toBe("2024-12-31: 0 drawings");
      const box = (await graph.boundingBox())!;
      const mainBox = (await page.locator("main").boundingBox())!;
      expect(box.x - mainBox.x).toBeCloseTo(60);
      expect(box.x + box.width).toBeCloseTo(mainBox.x + mainBox.width);
      const captionBox = (await page.locator("label[for=\"stats-year\"]").boundingBox())!;
      const scaleBox = (await page.locator("[aria-label=\"Graph scale\"]").boundingBox())!;
      expect(captionBox.x).toBeCloseTo(mainBox.x);
      expect(scaleBox.x + scaleBox.width).toBeCloseTo(mainBox.x + mainBox.width);
      expect(captionBox.y).toBeCloseTo(scaleBox.y);
      await page.mouse.move(box.x + box.width * 59.5 / 366, box.y + 50);
      expect(await page.locator("#stats-readout").textContent()).toBe("2024-02-29: 2,000 drawings");
      // Empty space above short and zero-count bars must remain selectable.
      await page.mouse.move(box.x + box.width * 58.5 / 366, box.y + 40);
      expect(await page.locator("#stats-readout").textContent()).toBe("2024-02-28: 1 drawings");
      await page.mouse.move(box.x + box.width * 20.5 / 366, box.y + 40);
      expect(await page.locator("#stats-readout").textContent()).toBe("2024-01-21: 0 drawings");
      const quietBar = page.locator("#stats-bars rect").nth(58);
      expect(Number(await quietBar.getAttribute("height"))).toBeGreaterThan(20);
      await page.getByRole("link", { name: "Linear", exact: true }).click();
      await page.waitForURL("**/stats?year=2024&scale=linear");
      expect(await page.locator("#stats-year").inputValue()).toBe("2024");
      expect(Number(await quietBar.getAttribute("height"))).toBeCloseTo(.15);
      await page.getByText("All daily counts", { exact: true }).click();
      expect(await page.locator("tbody tr").count()).toBe(366);
      expect(await page.locator("tbody tr").nth(59).textContent()).toBe("2024-02-292,000");
      await page.reload();
      expect(
        await page.getByRole("link", { name: "Linear", exact: true }).getAttribute("aria-current"),
      ).toBe("true");
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      await context.close();

      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        httpCredentials: { username: "", password: "pass" },
      });
      const phone = await mobile.newPage();
      await phone.goto(new URL("/stats?year=2024", server.url).href);
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      const mobileBox = (await phone.locator("#stats-graph").boundingBox())!;
      expect(mobileBox.x).toBeCloseTo(80);
      expect(mobileBox.x + mobileBox.width).toBeCloseTo(370);
      await phone.touchscreen.tap(mobileBox.x + mobileBox.width * 59.5 / 366, mobileBox.y + 100);
      expect(await phone.locator("#stats-readout").textContent()).toBe(
        "2024-02-29: 2,000 drawings",
      );
      await mobile.close();

      const plain = await browser.newContext({
        javaScriptEnabled: false,
        httpCredentials: { username: "", password: "pass" },
      });
      const plainPage = await plain.newPage();
      await plainPage.goto(new URL("/stats", server.url).href);
      await plainPage.locator("#stats-year").selectOption("2024");
      await plainPage.getByRole("button", { name: "Show", exact: true }).click();
      await plainPage.waitForURL("**/stats?year=2024&scale=log");
      await plainPage.getByText("All daily counts", { exact: true }).click();
      expect(await plainPage.locator("tbody tr").nth(59).isVisible()).toBeTrue();
      await plainPage.getByRole("link", { name: "Linear", exact: true }).click();
      await plainPage.waitForURL("**/stats?year=2024&scale=linear");
      await plain.close();
    } finally {
      await browser.close();
      await server.stop(true);
      app.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
  30_000,
);
