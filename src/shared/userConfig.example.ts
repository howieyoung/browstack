/**
 * Per-user configuration. `npm install` copies this file to `userConfig.ts`
 * (gitignored) on first run — edit THAT file, never this template.
 *
 * 個人設定檔範本。`npm install` 會在第一次自動複製成 `userConfig.ts`（已被
 * gitignore）——請編輯那個檔案，不要動這份範本。
 */
export const USER_CONFIG = {
  email: {
    // Sender & recipient for your weekly issue (usually both are you).
    // 週刊的寄件者與收件者（通常都是你自己）。
    from: "you@example.com",
    to: "you@example.com",
  },

  // Chrome profile folder name under ~/Library/Application Support/Google/Chrome
  // 常見值：Default、Profile 1、Profile 2…
  chromeProfile: "Default",

  // Your personal noise domains (your own products, work dashboards, etc.).
  // Matched against the host including all subdomains.
  // 個人雜訊網域（自家產品、工作後台等），比對含所有子網域。
  noiseHosts: [] as string[],
};
