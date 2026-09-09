import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp(config);

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
});

console.log(`scri.ch listening on ${server.url} with data in ${config.dataDir}`);

function shutdown(): void {
  server.stop();
  app.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
