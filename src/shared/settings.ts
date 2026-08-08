import { USER_CONFIG } from "./userConfig.js";

/**
 * Pure data config, no Node dependency — shared by the extension (browser side)
 * and the CLI/server (Node side). Node-only config (paths, etc.) lives in
 * src/config.ts; personal config in userConfig.ts (gitignored).
 */
export const SHARED = {
  // Personal noise domains from userConfig (matched including all subdomains).
  userNoiseHosts: USER_CONFIG.noiseHosts,

  // A tab left open but unread inflates visit_duration to hours; cap each visit at 20 minutes when scoring.
  maxVisitDurationSec: 20 * 60,

  // Local receiver service: the extension's only communication target, never leaves the machine.
  serverPort: 8787,

  capture: {
    // Accumulated active-reading seconds hits the threshold → deem content important, trigger extraction.
    activeSecondsThreshold: 30,
    // How long after the last interaction (scroll/mouse/keyboard) still counts as "active reading".
    idleWindowMs: 15_000,
    maxTextLength: 100_000,
    // Character cap for fallback extraction on non-article pages.
    maxFallbackTextLength: 8_000,
  },
};
