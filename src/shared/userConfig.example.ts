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

  // Your own social accounts — your own posts are output, not reading, and you spend a lot of
  // time re-reading them, so without this they dominate the digest. List every identifier you
  // post under (personal and brand accounts); matching is exact and case-insensitive:
  //   Threads / Instagram / X / YouTube → the handle, with or without "@"  ("yourhandle")
  //   Facebook                         → the username in your profile URL  ("your.name.42")
  //                                       and/or the numeric id from permalink.php?id=…
  //   LinkedIn                         → your public profile id           ("your-name-1a2b3c")
  //   Facebook display name            → exactly as it appears in "<Name> | Facebook" page titles
  ownSocialHandles: [] as string[],

  // Language for generated content (topic labels, summaries, the weekly reading
  // digest, the cover concept). "auto" follows the language you actually read;
  // set a fixed language to force it — a BCP-47 code ("en", "ja", "zh-TW") or a
  // plain name ("English", "日本語"). Image-generation prompts stay English regardless.
  contentLanguage: "auto",
};
