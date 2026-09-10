import type { DrawingDatabase } from "./database";
import { escapeHtml, type PageConfig, renderFailure, scriptJson } from "./html";
import { requirePagePassword } from "./private";
import { html } from "./responses";

type Count = { date: string; count: number; };
type Scale = "log" | "linear";
const CACHE_MS = 5 * 60 * 1000;

export function statsPeriods(daily: Count[], year: string, now: Date): Count[] {
  const monthly = year === "all";
  const counts = new Map<string, number>();
  for (const row of daily) {
    const date = monthly ? row.date.slice(0, 7) : row.date;
    counts.set(date, (counts.get(date) ?? 0) + row.count);
  }
  const today = now.toISOString().slice(0, 10);
  const start = monthly ? daily[0]?.date.slice(0, 7) : `${year}-01-01`;
  if (!start) return [];
  const end = monthly
    ? [today.slice(0, 7), daily.at(-1)!.date.slice(0, 7)].sort().at(-1)!
    : year === today.slice(0, 4)
    ? today
    : `${year}-12-31`;
  const cursor = new Date(`${start}${monthly ? "-01" : ""}T00:00:00Z`);
  const result: Count[] = [];
  while (true) {
    const date = cursor.toISOString().slice(0, monthly ? 7 : 10);
    if (date > end) break;
    result.push({ date, count: counts.get(date) ?? 0 });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function renderStats(
  config: PageConfig,
  total: number,
  years: string[],
  points: Count[],
  year: string,
  scale: Scale,
): string {
  const maximum = Math.max(1, ...points.map(point => point.count));
  const transform = (count: number) => scale === "log" ? Math.log10(count + 1) : count;
  const height = (count: number) => transform(count) / transform(maximum) * 100;
  const ticks = scale === "log"
    ? [0, ...Array.from({ length: Math.floor(Math.log10(maximum)) + 1 }, (_, i) => 10 ** i)]
    : Array.from(
      { length: Math.min(4, maximum) + 1 },
      (_, i) => Math.round(i * maximum / Math.min(4, maximum)),
    );
  const labels = ticks.map(count =>
    `<text x="48" y="${300 - height(count) * 3}" text-anchor="end" dominant-baseline="middle">${
      count.toLocaleString("en-GB")
    }</text>`
  ).join("");
  const grid = ticks.map(count =>
    `<line x1="0" x2="1000" y1="${300 - height(count) * 3}" y2="${300 - height(count) * 3}"/>`
  ).join("");
  const bars = points.map((point, index) => {
    const step = 1000 / points.length;
    const h = height(point.count) * 3;
    return `<rect x="${index * step + step * .1}" y="${300 - h}" width="${
      step * .8
    }" height="${h}"><title>${point.date}: ${point.count} drawings</title></rect>`;
  }).join("");
  const rows = points.map(point =>
    `<tr><th scope="row">${point.date}</th><td>${point.count.toLocaleString("en-GB")}</td></tr>`
  ).join("");
  const scaleLink = (value: Scale, label: string) =>
    `<a href="/stats?year=${year}&amp;scale=${value}"${
      scale === value ? " aria-current=\"true\"" : ""
    }>${label}</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>scri.ch - Stats</title><link rel="icon" href="/assets/favicon.png">
<link rel="stylesheet" href="${escapeHtml(config.clientAssets["admin.css"])}"></head>
<body class="stats"><main>
<header><p><a href="/">scri.ch</a>/stats - ${total.toLocaleString("en-GB")} drawings</p></header>
<div class="stats-chart-heading"><form action="/stats" method="get" id="stats-form">
<label for="stats-year">Drawings per ${
    year === "all" ? "month" : "day"
  }</label> <select name="year" id="stats-year" aria-label="Period">
<option value="all"${year === "all" ? " selected" : ""}>All time</option>
${years.map(value => `<option${year === value ? " selected" : ""}>${value}</option>`).join("")}
</select><input type="hidden" name="scale" value="${scale}"> <button type="submit" id="stats-go">Show</button>
</form>
<p aria-label="Graph scale">${scaleLink("log", "Logarithmic")} / ${
    scaleLink("linear", "Linear")
  }</p></div>
${
    points.length
      ? `<div class="stats-chart"><svg class="stats-axis" width="48" height="300" font-size="11" aria-hidden="true">${labels}</svg>
<div class="stats-plot"><svg id="stats-graph" width="100%" height="300" viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Drawings per ${
        year === "all" ? "month" : "day"
      }; exact counts in the table below">
<rect width="1000" height="300" fill="transparent" pointer-events="all"/>
<g stroke="#ddd" stroke-dasharray="2 3">${grid}</g><g id="stats-bars">${bars}</g>
<line stroke="black" stroke-width="2" id="stats-marker" x1="0" x2="0" y1="0" y2="300" visibility="hidden"/>
</svg><svg width="100%" height="30" font-size="11" aria-hidden="true"><text x="0" y="25">${
        points[0]!.date
      }</text><text x="100%" y="25" text-anchor="end">${
        points.at(-1)!.date
      }</text></svg></div></div>
<p id="stats-readout" aria-live="polite">&nbsp;</p>`
      : "<p>No drawings yet.</p>"
  }
<details><summary>All ${year === "all" ? "monthly" : "daily"} counts</summary>
<table><thead><tr><th scope="col">${
    year === "all" ? "Month" : "Date"
  }</th><th scope="col">Drawings</th></tr></thead><tbody>${rows}</tbody></table></details>
</main><script id="stats-data" type="application/json">${scriptJson(points)}</script>
<script type="module" src="${escapeHtml(config.clientAssets["stats.js"])}"></script></body></html>`;
}

export function createStatsResponse(database: DrawingDatabase, clock = () => Date.now()) {
  let snapshot: {
    expires: number;
    assets: string;
    date: Date;
    daily: Count[];
    total: number;
    years: string[];
    views: Map<string, string>;
  } | undefined;
  return (request: Request, config: PageConfig): Response => {
    const denied = requirePagePassword(request, config, "stats");
    if (denied) return denied;
    const url = new URL(request.url);
    if (url.pathname === "/stats.php") {
      return new Response(null, {
        status: 301,
        headers: { location: "/stats", "cache-control": "no-store" },
      });
    }
    const year = url.searchParams.get("year") ?? "all";
    const scale = url.searchParams.get("scale") ?? "log";
    if ((year !== "all" && !/^[0-9]{4}$/.test(year)) || (scale !== "log" && scale !== "linear")) {
      return html(renderFailure(config, 400, "Invalid stats view"), 400);
    }
    const now = clock();
    const assets = `${config.clientAssets["admin.css"]}:${config.clientAssets["stats.js"]}`;
    if (!snapshot || snapshot.expires <= now || snapshot.assets !== assets) {
      const daily = database.dailyCounts();
      const date = new Date(now);
      const currentYear = date.getUTCFullYear();
      const firstYear = Math.min(currentYear, Number(daily[0]?.date.slice(0, 4) ?? currentYear));
      const lastYear = Math.max(currentYear, Number(daily.at(-1)?.date.slice(0, 4) ?? currentYear));
      const years = Array.from(
        { length: lastYear - firstYear + 1 },
        (_, i) => String(lastYear - i).padStart(4, "0"),
      );
      snapshot = {
        expires: now + CACHE_MS,
        assets,
        date,
        daily,
        total: database.count(),
        years,
        views: new Map(),
      };
    }
    if (year !== "all" && !snapshot.years.includes(year)) {
      return html(renderFailure(config, 400, "Invalid stats year"), 400);
    }
    const key = `${year}:${scale}`;
    let body = snapshot.views.get(key);
    if (!body) {
      body = renderStats(
        config,
        snapshot.total,
        snapshot.years,
        statsPeriods(snapshot.daily, year, snapshot.date),
        year,
        scale,
      );
      snapshot.views.set(key, body);
    }
    return html(body);
  };
}
