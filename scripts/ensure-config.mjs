// postinstall：首次安裝時建立個人設定檔（gitignored），讓 fresh clone 開箱即用
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "shared", "userConfig.ts");
const template = path.join(root, "src", "shared", "userConfig.example.ts");

if (!fs.existsSync(target)) {
  fs.copyFileSync(template, target);
  console.log("[browstack] Created src/shared/userConfig.ts from template — edit it with your email and settings.");
}
