import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { build } from "../../scripts/build";
import { loadConfig } from "../../src/server/config";
import { DrawingDatabase } from "../../src/server/database";
import { createStatsResponse, statsPeriods } from "../../src/server/stats";

const assets = mkdtempSync("/tmp/scrich-stats-assets-");
const clientAssets = await build(assets);
afterAll(() => rmSync(assets, { recursive: true, force: true }));
const databases: DrawingDatabase[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));
const config = {
  ...loadConfig({ STATS_PASSWORD: "pass" }),
  clientAssets,
};
const headers = { authorization: `Basic ${btoa("user:pass")}` };
function fixture() {
  const database = new DrawingDatabase(":memory:");
  databases.push(database);
  let now = Date.parse("2026-09-10T12:00:00Z");
  const response = createStatsResponse(database, () => now);
  return {
    database,
    response,
    advance: (ms: number) => now += ms,
    get: (query = "") =>
      response(new Request(`https://scri.ch/stats${query}`, { headers }), config),
  };
}
function insert(database: DrawingDatabase, id: number, createdAt: string) {
  database.insertImported({ id, shortId: id.toString(36), settings: {}, createdAt });
}
function points(body: string): { date: string; count: number; }[] {
  return JSON.parse(
    /<script id="stats-data" type="application\/json">(.*?)<\/script>/s.exec(body)![1]!,
  );
}

test("counts stored drawings including hidden ones at UTC day boundaries", () => {
  const { database } = fixture();
  insert(database, 1, "2024-02-28T23:59:59Z");
  insert(database, 2, "2024-02-29T00:00:00Z");
  insert(database, 3, "2024-03-01T00:30:00+01:00");
  insert(database, 4, "2025-01-01T00:30:00+01:00");
  database.setVisibility("2", "hidden");
  expect(database.dailyCounts()).toEqual([
    { date: "2024-02-28", count: 1 },
    { date: "2024-02-29", count: 2 },
    { date: "2024-12-31", count: 1 },
  ]);
});

test("fills missing days/months, includes leap day, and stops the current year at today", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const daily = [{ date: "2024-02-29", count: 2 }, { date: "2024-04-01", count: 3 }];
  const months = statsPeriods(daily, "all", now);
  expect(months[0]).toEqual({ date: "2024-02", count: 2 });
  expect(months[1]).toEqual({ date: "2024-03", count: 0 });
  expect(months[2]).toEqual({ date: "2024-04", count: 3 });
  expect(months.at(-1)?.date).toBe("2026-09");
  const days = statsPeriods(daily, "2024", now);
  expect(days).toHaveLength(366);
  expect(days[59]).toEqual({ date: "2024-02-29", count: 2 });
  expect(days.at(-1)?.date).toBe("2024-12-31");
  expect(statsPeriods([], "2025", now)).toHaveLength(365);
  expect(statsPeriods([], "2026", now).at(-1)?.date).toBe("2026-09-10");
  expect(statsPeriods([], "all", now)).toEqual([]);
});

test("empty, single drawing and extreme activity produce finite graph values and exact totals", async () => {
  const { database, get, advance } = fixture();
  expect(await get().text()).toContain("No drawings yet.");
  insert(database, 1, "2024-02-28T00:00:00Z");
  advance(300_000);
  let body = await get("?year=2024").text();
  expect(body).toContain("1 drawings");
  expect(body).not.toMatch(/NaN|Infinity/);
  database.raw.transaction(() => {
    for (let i = 2; i <= 2001; i++) insert(database, i, "2024-02-29T00:00:00Z");
  })();
  advance(300_000);
  body = await get("?year=2024").text();
  expect(body).toContain("2,001 drawings");
  expect(points(body)[59]).toEqual({ date: "2024-02-29", count: 2000 });
  const linear = await get("?year=2024&scale=linear").text();
  const barHeight = (text: string) => Number(/height="([\d.]+)"><title>2024-02-28/.exec(text)![1]);
  expect(barHeight(body)).toBeGreaterThan(20);
  expect(barHeight(linear)).toBeCloseTo(.15);
  expect(body).not.toMatch(/NaN|Infinity/);
  expect(points(linear)).toEqual(points(body));
});

test("auth runs before database/cache access, and redirects and invalid views stay private", async () => {
  const { database, get, response } = fixture();
  const query = spyOn(database, "dailyCounts");
  const request = new Request("https://scri.ch/stats");
  expect(response(request, config).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
  const good = get();
  expect(good.status).toBe(200);
  expect(good.headers.get("cache-control")).toBe("no-store");
  expect(response(request, config).status).toBe(401);
  expect(
    response(
      new Request(request, { headers: { authorization: `Basic ${btoa("user:wrong")}` } }),
      config,
    ).status,
  ).toBe(401);
  expect(query).toHaveBeenCalledTimes(1);
  for (const queryString of ["?year=banana", "?year=9999", "?scale=banana", "?year=2024<script>"]) {
    expect(get(queryString).status).toBe(400);
  }
  const redirect = response(new Request("https://scri.ch/stats.php", { headers }), config);
  expect(redirect.status).toBe(301);
  expect(redirect.headers.get("location")).toBe("/stats");
  expect(response(new Request("https://scri.ch/stats.php"), config).status).toBe(401);
});

test("cached views reuse one snapshot, separate year and scale, and expire after five minutes", async () => {
  const { database, get, advance } = fixture();
  insert(database, 1, "2024-02-29T00:00:00Z");
  const query = spyOn(database, "dailyCounts");
  const initial = await get().text();
  expect(await get().text()).toBe(initial);
  const year = await get("?year=2024").text();
  const linear = await get("?year=2024&scale=linear").text();
  expect(points(await get("?year=2025").text())).toHaveLength(365);
  expect(points(await get("?year=2025").text()).every(point => point.count === 0)).toBeTrue();
  expect(points(initial)[0]?.date).toBe("2024-02");
  expect(points(year)).toHaveLength(366);
  expect(linear).not.toBe(year);
  expect(query).toHaveBeenCalledTimes(1);
  insert(database, 2, "2026-09-10T00:00:00Z");
  advance(299_999);
  expect(await get().text()).toBe(initial);
  advance(1);
  expect(await get().text()).toContain("2 drawings");
  expect(await get("?year=2024").text()).toContain("2 drawings");
  expect(query).toHaveBeenCalledTimes(2);
});

test("public stats supports cached views and redirects; enabling protection guards cached content", async () => {
  const { response } = fixture();
  const publicConfig = { ...config, statsPassword: null };
  const request = new Request("https://scri.ch/stats");
  const first = response(request, publicConfig);
  expect(first.status).toBe(200);
  expect(first.headers.get("www-authenticate")).toBeNull();
  expect(await response(request, publicConfig).text()).toBe(await first.text());
  expect(response(request, config).status).toBe(401);
  const redirect = response(new Request("https://scri.ch/stats.php"), publicConfig);
  expect(redirect.status).toBe(301);
  expect(redirect.headers.get("location")).toBe("/stats");
});

test("undated historical drawings stay in the total and do not break the graph", async () => {
  const { database, get } = fixture();
  insert(database, 1, "0000-00-00T00:00:00Z");
  insert(database, 2, "not a date");
  insert(database, 3, "2024-02-29T00:00:00Z");
  const body = await get().text();
  expect(body).toContain("3 drawings</p></header>");
  expect(points(body).reduce((total, point) => total + point.count, 0)).toBe(1);
  expect(body).not.toContain("NaN");
});
