/**
 * Per-user configuration. `npm install` copies this file to `userConfig.ts`
 * (gitignored) on first run — edit THAT file, never this template.
 */
export const USER_CONFIG = {
  email: {
    // Sender & recipient for your weekly issue (usually both are you).
    from: "you@example.com",
    to: "you@example.com",
  },

  // Chrome profile folder name under ~/Library/Application Support/Google/Chrome
  // (common values: "Default", "Profile 1", "Profile 2", …).
  chromeProfile: "Default",

  // Your personal noise domains (your own products, work dashboards, etc.).
  // Matched against the host including all subdomains.
  noiseHosts: [] as string[],

  // Language for generated content (topic labels, summaries, the weekly reading
  // digest, the cover concept). "auto" follows the language you actually read;
  // set a fixed language to force it — a BCP-47 code ("en", "ja", "zh-TW") or a
  // plain name ("English", "日本語"). Image-generation prompts stay English regardless.
  contentLanguage: "auto",
};
