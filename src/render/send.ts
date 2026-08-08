import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { ensureArchiveToken } from "../archiveToken.js";
import { CONFIG } from "../config.js";
import { findCover, getCurrentIssue, markIssueSent } from "../issue.js";
import { SHARED } from "../shared/settings.js";

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

// 封面以 inline CID 附件嵌入（email client 不吃 data URI，但吃 CID）；svg 無法內嵌，接受 png/jpg
const coverPath = findCover(issue.number, { rasterOnly: true });
const attachments: Array<{ filename: string; path: string; cid: string }> = [];
if (coverPath?.endsWith(".png") || coverPath?.endsWith(".jpg")) {
  const filename = coverPath.endsWith(".jpg") ? "cover.jpg" : "cover.png";
  attachments.push({ filename, path: coverPath, cid: "issue-cover" });
  html = html.replace(
    "<!--COVER-->",
    `<img src="cid:issue-cover" alt="本期封面" style="width:100%;display:block;border-top:3px double #d9d2c2" />`,
  );
}

// 典藏按鈕：token 在寄送當下才注入連結,且只改記憶體中的 html、不寫回磁碟——token 永不落地於 out/。
// 連結只在同一台 Mac、接收服務運行時有效（手機開信為死連結,屬架構限制）。
const archiveUrl = `http://127.0.0.1:${SHARED.serverPort}/archive?k=${ensureArchiveToken()}`;
const archiveButton = `<div style="text-align:center;padding:6px 40px 30px">
      <a href="${archiveUrl}" style="display:inline-block;font-family:'Noto Serif TC',serif;font-size:13px;letter-spacing:.12em;color:#faf6ee;background:#b5361c;text-decoration:none;padding:12px 28px">在瀏覽器開啟你的典藏 →</a>
      <div style="margin-top:10px;font-size:11px;color:#8d8474;letter-spacing:.04em">在這台 Mac 上、Browstack 服務運行時開啟</div>
    </div>`;
html = html.replace("<!--ARCHIVE_LINK-->", archiveButton);

const transporter = nodemailer.createTransport({
  host: CONFIG.email.smtp.host,
  port: CONFIG.email.smtp.port,
  secure: true,
  auth: { user: CONFIG.email.from, pass: getSmtpPassword() },
});

const info = await transporter.sendMail({
  from: `Browstack <${CONFIG.email.from}>`,
  to: CONFIG.email.to,
  subject: `Browstack №${issue.number}${issue.title ? " — " + issue.title : ""}｜你的一週閱讀，成刊了`,
  html,
  attachments,
});
markIssueSent(issue.number); // 封刊：下一次產出自動開新的一期
console.log(`已寄出 №${issue.number}：${info.messageId} → ${CONFIG.email.to}`);
