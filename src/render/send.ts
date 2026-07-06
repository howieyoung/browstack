import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { CONFIG } from "../config.js";
import { findCover, getCurrentIssue, markIssueSent } from "../issue.js";

/**
 * 寄出本期週刊：Gmail SMTP ＋應用程式密碼（存 macOS Keychain，service: browstack-smtp）。
 * 設定方式：Google 帳戶 → 安全性 → 兩步驟驗證 → 應用程式密碼，然後：
 *   security add-generic-password -s browstack-smtp -a <gmail帳號> -w '<16碼應用程式密碼>' -U
 */

function getSmtpPassword(): string {
  try {
    const pw = execFileSync("security", ["find-generic-password", "-s", "browstack-smtp", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .replace(/\s+/g, ""); // 應用程式密碼顯示時帶空格，串接時要去掉
    if (pw) return pw;
  } catch {
    // fall through
  }
  throw new Error(
    "找不到 SMTP 密碼。請先建立 Gmail 應用程式密碼並存入 Keychain：\n" +
      `  security add-generic-password -s browstack-smtp -a ${CONFIG.email.from} -w '<應用程式密碼>' -U`,
  );
}

const issue = getCurrentIssue();
const emailPath = path.join(CONFIG.dataDir, "..", "out", `browstack-issue-${issue.number}.email.html`);
if (!fs.existsSync(emailPath)) {
  console.error("找不到 email 版，先跑 npm run email");
  process.exit(1);
}
let html = fs.readFileSync(emailPath, "utf8");

// 封面以 inline CID 附件嵌入（email client 不吃 data URI，但吃 CID）；svg 無法內嵌，僅接受 png
const coverPath = findCover(issue.number);
const attachments: Array<{ filename: string; path: string; cid: string }> = [];
if (coverPath?.endsWith(".png")) {
  attachments.push({ filename: "cover.png", path: coverPath, cid: "issue-cover" });
  html = html.replace(
    "<!--COVER-->",
    `<img src="cid:issue-cover" alt="本期封面" style="width:100%;display:block;border-top:3px double #d9d2c2" />`,
  );
}

const transporter = nodemailer.createTransport({
  host: CONFIG.email.smtp.host,
  port: CONFIG.email.smtp.port,
  secure: true,
  auth: { user: CONFIG.email.from, pass: getSmtpPassword() },
});

const info = await transporter.sendMail({
  from: `Browstack <${CONFIG.email.from}>`,
  to: CONFIG.email.to,
  subject: `Browstack №${issue.number} — ${issue.title}｜你的一週閱讀，成刊了`,
  html,
  attachments,
});
markIssueSent(issue.number); // 封刊：下一次產出自動開新的一期
console.log(`已寄出 №${issue.number}：${info.messageId} → ${CONFIG.email.to}`);
