import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { ensureArchiveToken } from "../archiveToken.js";
import { CONFIG } from "../config.js";
import { findCover, getCurrentIssue, markIssueSent } from "../issue.js";
import { SHARED } from "../shared/settings.js";

/**
 * Send this issue's weekly: Gmail SMTP + app password (stored in the macOS Keychain, service: browstack-smtp).
 * Setup: Google Account → Security → 2-Step Verification → App passwords, then:
 *   security add-generic-password -s browstack-smtp -a <gmail account> -w '<16-char app password>' -U
 */

function getSmtpPassword(): string {
  try {
    const pw = execFileSync("security", ["find-generic-password", "-s", "browstack-smtp", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .replace(/\s+/g, ""); // app passwords are shown with spaces; strip them when concatenating
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

// Embed the cover as an inline CID attachment (email clients reject data URIs but accept CID); SVG can't be inlined, so accept png/jpg
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

// Archive button: the token is injected into the link only at send time, and only the in-memory html is modified, never written back to disk — the token never lands in out/.
// The link works only on the same Mac while the receiver service is running (opening on a phone yields a dead link, an architectural limitation).
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
markIssueSent(issue.number); // close the issue: the next run automatically starts a new one
console.log(`已寄出 №${issue.number}：${info.messageId} → ${CONFIG.email.to}`);
