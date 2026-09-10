import type { DrawingSettings } from "../settings";
import type { ClientManifest } from "./assets";
import type { AppConfig } from "./config";
import type { DrawingRecord } from "./database";

export type PageConfig = AppConfig & { clientAssets: ClientManifest; };

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
}

export function renderDrawingPage(
  config: PageConfig,
  settings: DrawingSettings,
  shortId?: string,
  error?: { status: number; message: string; },
): string {
  const title = error ? `${escapeHtml(error.message)} | ` : "";
  const pageUrl = `${config.publicOrigin}/${shortId ?? ""}`;
  const shareTitle = shortId ? `scri.ch / ${shortId}` : "scri.ch";
  const imageUrl = `${config.publicOrigin}/${shortId}.png`;
  const sharing = error ? "" : `
    <link rel="canonical" href="${escapeHtml(pageUrl)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="scri.ch">
    <meta property="og:title" content="${escapeHtml(shareTitle)}">
    <meta property="og:description" content="scri.ch is a website that lets you draw.">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    <meta name="twitter:card" content="${shortId ? "summary_large_image" : "summary"}">
    <meta name="twitter:title" content="${escapeHtml(shareTitle)}">
    <meta name="twitter:description" content="scri.ch is a website that lets you draw.">
    ${
    shortId
      ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:alt" content="Drawing /${escapeHtml(shortId)} on scri.ch">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <meta name="twitter:image:alt" content="Drawing /${escapeHtml(shortId)} on scri.ch">`
      : ""
  }`;
  const style = shortId
    ? "#save{display:none;}"
    : "#buttons button,#about{display:none;}";
  return `<!doctype html>
<!--
      /
     /
    /____
        /
       /
      /

scri.ch is a hackable drawing tool
-->
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}scri.ch</title>
    <meta name="description" content="scri.ch is a website that lets you draw.">
    ${sharing}
    <link rel="stylesheet" href="${escapeHtml(config.clientAssets["scrich.css"])}">
    <link rel="icon" type="image/png" href="/assets/favicon.png">
    <link rel="apple-touch-icon-precomposed" href="/assets/apple-touch-icon-57x57-precomposed.png">
    <link rel="apple-touch-icon-precomposed" sizes="72x72" href="/assets/apple-touch-icon-72x72-precomposed.png">
    <link rel="apple-touch-icon-precomposed" sizes="114x114" href="/assets/apple-touch-icon-114x114-precomposed.png">
    <link rel="apple-touch-icon-precomposed" sizes="144x144" href="/assets/apple-touch-icon-144x144-precomposed.png">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <style>${style}</style>
  </head>
  <body>
    ${error && error.status !== 404 ? `<div id="error">${escapeHtml(error.message)}</div>` : ""}
    <canvas id="drawing"></canvas>
    <div id="buttons">
      <button id="new">New</button>
      <button id="save">Save</button>
      <a href="/about" id="about" title="About scri.ch">?</a>
    </div>
    <form action="/" method="post" id="form">
      <input type="hidden" id="new_drawing" name="new_drawing" value="">
      <input type="hidden" id="settings" name="settings" value="">
      <input type="hidden" name="parent" value="${escapeHtml(!error && shortId ? shortId : "")}">
    </form>
    <script id="drawing-data" type="application/json">${
    scriptJson({
      settings,
      homeUrl: `${config.publicOrigin}/`,
      drawingUrl: shortId ? `/${shortId}-raw.png` : null,
    })
  }</script>
    <script type="module" src="${escapeHtml(config.clientAssets["scrich.js"])}"></script>
  </body>
</html>`;
}

export function renderGallery(
  config: PageConfig,
  drawings: DrawingRecord[],
  page: number,
  pageCount: number,
  total: number,
): string {
  const previous = page > 1 ? `<a href="/gallery/?p=${page - 1}" class="prev">Previous</a>` : "";
  const next = page < pageCount ? `<a href="/gallery/?p=${page + 1}" class="next">Next</a>` : "";
  const pagination = `<p class="pagination">${previous}${next}</p>`;
  const items = drawings.map((drawing) => {
    const id = escapeHtml(drawing.shortId);
    const date = escapeHtml(new Date(drawing.createdAt).toLocaleString("en-GB", {
      timeZone: "UTC",
      hour12: false,
    }));
    if (drawing.visibility === "hidden") {
      return `<li><h2>/${id} <span>(${date})</span></h2><p>Hidden</p></li>`;
    }
    const dimensions = drawing.cropWidth && drawing.cropHeight
      ? ` width="${drawing.cropWidth}" height="${drawing.cropHeight}"`
      : "";
    return `<li><h2>/${id} <span>(${date})</span></h2><a href="/${id}"><img src="/${id}.png" alt="/${id}"${dimensions}></a></li>`;
  }).join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>scri.ch - Gallery</title>
<link rel="stylesheet" href="${
    escapeHtml(config.clientAssets["admin.css"])
  }"><link rel="icon" href="/assets/favicon.png">
</head><body>
<h1>Drawings - ${page}/${pageCount} - (total ${total})</h1>
${pagination}<ul id="drawing-list">${items}</ul>${pagination}
</body></html>`;
}

export function renderNotFound(config: PageConfig): string {
  return renderDrawingPage(config, {}, "404", { status: 404, message: "404 Not Found" });
}

export function renderFailure(config: PageConfig, status: number, message: string): string {
  return renderDrawingPage(config, {}, undefined, { status, message });
}
