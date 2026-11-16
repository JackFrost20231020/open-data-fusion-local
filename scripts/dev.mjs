#!/usr/bin/env node
/**
 * Cross-platform local starter for the API and Vite 8 web app.
 * Uses the workspace Vite 8 binary, including the copy npm hoists to the
 * repository root. Refuses Vite 7.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "apps/web");
const viteCandidates = [
  join(webDir, "node_modules/vite/bin/vite.js"),
  join(root, "node_modules/vite/bin/vite.js"),
];

function major(version) {
  const match = String(version).replace(/^v/, "").split(".")[0];
  return Number.parseInt(match, 10);
}

const nodeMajor = major(process.versions.node);
if (nodeMajor < 24) {
  console.error(`需要 Node.js 24 或更高版本，当前是 ${process.versions.node}。`);
  process.exit(1);
}

if (!existsSync(join(root, "node_modules"))) {
  console.error("尚未安装依赖。请先在仓库根目录运行 npm ci（或 npm install）。");
  process.exit(1);
}

const viteBin = viteCandidates.find((candidate) => existsSync(candidate));
if (!viteBin) {
  console.error("找不到 Vite。请在仓库根目录重新运行 npm ci。");
  process.exit(1);
}

const vitePackage = join(dirname(viteBin), "..", "package.json");
const viteVersion = JSON.parse(readFileSync(vitePackage, "utf8")).version;
if (major(viteVersion) < 8) {
  console.error(`解析到的 Vite 是 ${viteVersion}，需要 8.x。Vite 7 会让 /@vite/client 和 /src/main.tsx 返回 500（Missing field moduleType）。`);
  process.exit(1);
}
console.log(`使用 Vite ${viteVersion}（${viteBin}）`);

const apiPort = process.env.PORT || "4310";
const webPort = process.env.WEB_PORT || "5173";
const apiHost = process.env.ODF_API_HOST || "127.0.0.1";
const webHost = process.env.WEB_HOST || "127.0.0.1";
const apiTarget = process.env.VITE_API_PROXY_TARGET || `http://${apiHost}:${apiPort}`;

const children = [];

function run(name, command, args, extraEnv = {}, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`${name} 已退出，代码 ${code}`);
    }
  });
  children.push(child);
  return child;
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
run("api", npmCmd, ["run", "dev", "--workspace", "@open-data-fusion/api"], {
  PORT: apiPort,
  ODF_API_HOST: apiHost,
});
run("web", process.execPath, [viteBin, "--host", webHost, "--port", webPort], {
  VITE_API_PROXY_TARGET: apiTarget,
}, webDir);

console.log(`API  http://${apiHost}:${apiPort}`);
console.log(`Web  http://${webHost}:${webPort}`);
console.log(`Health  http://${apiHost}:${apiPort}/health`);
console.log("按 Ctrl+C 同时停止两个进程。");

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
