import { rotateArchiveToken } from "../archiveToken.js";

// 更新典藏 token：舊信件裡的按鈕即刻失效,下一期出刊會帶新連結。
rotateArchiveToken();
console.log("已更新典藏 token（存入 Keychain: browstack-archive）。");
console.log("舊信件的典藏按鈕即刻失效;下一期出刊會帶新連結。");
console.log("要現在就開啟典藏,執行： npm run archive:open");
