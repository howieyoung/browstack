import { USER_CONFIG } from "./userConfig.js";

/**
 * 純資料設定，無 Node 相依——extension（瀏覽器端）與 CLI/server（Node 端）共用。
 * Node 專屬設定（路徑等）在 src/config.ts；個人設定在 userConfig.ts（gitignored）。
 */
export const SHARED = {
  // 個人專屬的雜訊網域，來自 userConfig（比對含所有子網域）
  userNoiseHosts: USER_CONFIG.noiseHosts,

  // 掛著沒讀的分頁會把 visit_duration 灌水到小時級；計分時每次造訪最多算 20 分鐘
  maxVisitDurationSec: 20 * 60,

  // 本機接收服務：extension 唯一的通訊對象，永不出機器
  serverPort: 8787,

  capture: {
    // 主動閱讀累積秒數達門檻 → 認定內容重要，觸發擷取
    activeSecondsThreshold: 30,
    // 最後一次互動（捲動/滑鼠/鍵盤）後多久內仍算「主動閱讀」
    idleWindowMs: 15_000,
    maxTextLength: 100_000,
    // 非文章頁 fallback 擷取的字數上限
    maxFallbackTextLength: 8_000,
  },
};
