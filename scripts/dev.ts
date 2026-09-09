import { watch } from "node:fs";
import { join } from "node:path";
import { build, projectRoot } from "./build";

await build(undefined, true);
const server = Bun.spawn([process.execPath, "--watch", "src/server/index.ts"], {
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: "development" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
let pending = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;
const watcher = watch(join(projectRoot, "src/client"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(async () => {
      try {
        await build(undefined, true);
        console.log("Client rebuilt; reload the browser to see changes.");
      } catch (error) {
        console.error(error);
      }
    });
  }, 100);
});
function stop() {
  watcher.close();
  clearTimeout(timer);
  server.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const code = await server.exited;
stop();
await pending;
process.exitCode = code;
