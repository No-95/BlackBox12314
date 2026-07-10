const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const archiveName = `blackbox-ubuntu-server-${stamp}.tgz`;
const archivePath = path.join(outDir, archiveName);

fs.mkdirSync(outDir, { recursive: true });

const includes = [
  "apps/sales-dashboard/server.js",
  "apps/sales-dashboard/lawyer.js",
  "apps/sales-dashboard/visionist.js",
  "apps/sales-dashboard/lib",
  "apps/sales-dashboard/public",
  "apps/blackbox-desktop/README.md",
  "convex",
  "prompts",
  "scripts/outreach",
  "deploy/ubuntu",
  "package.json",
  ".env.example",
  "README.md"
];

const existing = includes.filter((item) => fs.existsSync(path.join(root, item)));
if (!existing.length) {
  throw new Error("Nothing to pack");
}

const args = [
  "czf",
  archivePath,
  "--exclude=node_modules",
  "--exclude=dist",
  "--exclude=.git",
  ...existing
];

execSync(`tar ${args.map((a) => `"${a}"`).join(" ")}`, {
  cwd: root,
  stdio: "inherit",
  shell: true
});

const sizeMb = (fs.statSync(archivePath).size / (1024 * 1024)).toFixed(1);
console.log(`Packed Ubuntu server bundle: ${archivePath} (${sizeMb} MB)`);
console.log("Copy to computer B, extract, then run deploy/ubuntu/start.sh");
