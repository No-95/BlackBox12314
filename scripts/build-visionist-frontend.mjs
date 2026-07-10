import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mirofishFrontend =
  process.env.MIROFISH_FRONTEND_PATH ||
  path.resolve("D:/MiroFish/MiroFish/frontend");
const embedConfig = path.join(mirofishFrontend, "vite.embed.config.js");
const outDir = path.resolve(
  repoRoot,
  "apps/sales-dashboard/public/visionist-app"
);

if (!fs.existsSync(mirofishFrontend)) {
  console.error(
    `MiroFish frontend not found at ${mirofishFrontend}. Set MIROFISH_FRONTEND_PATH.`
  );
  process.exit(1);
}

if (!fs.existsSync(embedConfig)) {
  console.error(`Embed config not found at ${embedConfig}`);
  process.exit(1);
}

const viteBin = path.join(mirofishFrontend, "node_modules/vite/bin/vite.js");
if (!fs.existsSync(viteBin)) {
  console.log("Installing MiroFish frontend dependencies...");
  const install = spawnSync("npm", ["install"], {
    cwd: mirofishFrontend,
    stdio: "inherit",
    shell: true
  });
  if (install.status !== 0) {
    process.exit(install.status || 1);
  }
}

console.log(`Building MiroFish frontend from ${mirofishFrontend}`);
const build = spawnSync(
  process.execPath,
  [viteBin, "build", "--config", embedConfig],
  {
    cwd: mirofishFrontend,
    stdio: "inherit",
    env: {
      ...process.env,
      MIROFISH_FRONTEND_PATH: mirofishFrontend,
      VISIONIST_OUT_DIR: outDir,
      VITE_API_BASE_URL: "/"
    }
  }
);

process.exit(build.status ?? 1);
