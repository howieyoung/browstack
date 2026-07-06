# Browstack

**Browser + Substack** — 把你自己的瀏覽紀錄，變成一份設計精緻、隱私優先的個人週刊，像真正的電子報一樣寄進你的收件匣。

[English README → README.md](README.md)

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="封面引擎以 New Yorker 插畫傳統生成的範例封面" />
  <br/>
  <em>每一期都有全新生成的封面——以 The New Yorker 的插畫傳統，<br/>把你那一週真正讀過的主題化為一個視覺隱喻。</em>
</p>

## 為什麼做這個

你每天從社群動態點開無數文章，來不及看完，只能加進再也不會回去看的書籤清單。Browstack 的核心洞察：**瀏覽本身就是輸入**。你的瀏覽紀錄已經躺在本機——不需要任何「儲存」動作。Browstack 在本地讀取它、只留下知識型內容、為每篇寫出足以取代重讀原文的摘要，再編排成一份值得收藏的週刊。

**你是自己的出版商。** 每一期預設完全私密——任何對外發布永遠是逐條、明確的 opt-in。

## 運作方式

```
Chrome History ─┐
                ├→ 分類 → 增潤 → 封面 → 排版 → 寄送
Extension ──────┘  (知識過濾   (LLM     (藝術總監  (報頭、主題   (SMTP、
 (真實閱讀訊號)     ＋隱私      摘要)    ＋圖像     分組、摘要)    封面內嵌)
                    防火牆)              引擎)
```

- **Ingest** — 讀取 Chrome 本機的 History 資料庫（讀複本，因為 Chrome 執行中會鎖原檔）。開啟 Chrome 同步的話，手機的瀏覽紀錄會自動包含在內。
- **Extension（MV3）** — 只在「分頁可見＋近期有互動」時累積主動閱讀秒數，並在你閱讀的當下擷取正文（含登入牆內的內容）。**只與 `127.0.0.1` 通訊**——任何資料都不出你的機器。
- **分類** — 硬規則：非知識型內容（八卦、彩券、促銷、快查行為）無論停留多久都不入刊。敏感頁面（網銀、信箱、登入、政府個人業務）連 Browstack 自己的資料庫都不寫入。
- **增潤** — LLM 為每篇文章寫三個重點＋一句 takeaway，為每則社群貼文寫一句編輯脈絡。
- **封面** — LLM 藝術總監把本週內容濃縮成單一視覺隱喻，再由圖像引擎在固定的藝術規格下渲染（扁平絹印質感、有限色盤、慷慨留白、畫面內無文字）。
- **排版與寄送** — 雜誌報頭（期數№、日期區間、品牌字、小標）、主題分組摘要、一週圖譜。透過你自己的 Gmail SMTP 寄出，封面以 CID 附件內嵌信件頂部。

## 隱私原則

1. **Local-first。** 解析、過濾、排序全在本機完成；extension 唯一的網路對象是 `127.0.0.1`。
2. **先過濾、再上雲。** 只有被分類為內容頁的正文才會送往 LLM。網銀、信箱、登入、政府頁面永不離開機器——連本地資料庫都不儲存。
3. **金鑰存 macOS Keychain**，不放 dotfiles、不 export 到環境。
4. **發布逐條 opt-in。** 不存在自動對外發布的路徑。

## 需求

- macOS 13+（使用 Keychain 與 `sips`；Linux/Windows 需小幅替換）
- Google Chrome（建議開啟 Chrome 同步——手機瀏覽會一併入刊）
- Node.js 20+
- LLM 擇一：[Claude Code CLI](https://claude.com/claude-code)（直接用你現有的訂閱）**或** Anthropic API key
- 選配：OpenAI API key（封面圖像渲染）、Gmail 帳號（寄送）

## 快速開始

```bash
git clone https://github.com/<你>/browstack.git
cd browstack
npm install                 # 會自動從範本建立 src/shared/userConfig.ts
$EDITOR src/shared/userConfig.ts   # 填入你的 email、Chrome profile、個人雜訊網域

npm run ingest              # 匯入並分類你的 Chrome 紀錄（純本機）
npm run stats               # 檢查：分類統計＋高價值內容候選
npm run enrich              # LLM 知識過濾＋摘要（LLM 設定見下）
npm run cover               # 生成本期封面（OpenAI 設定見下）
npm run preview             # 產出 out/browstack-issue-0.html——打開看！
npm run send                # 把這期寄給自己（Gmail 設定見下）
```

### Extension（真實閱讀訊號）

```bash
npm run build:ext
npm run serve               # 本機接收服務 127.0.0.1:8787——保持執行
```

打開 `chrome://extensions` → 開啟**開發人員模式** → **載入未封裝項目** → 選 `extension/` 資料夾。你主動閱讀超過 30 秒的頁面會被擷取（正文＋捲動深度＋實讀秒數）寫入本地資料庫；點圖示可看接收服務狀態與待送佇列。

## 一次性設定指南

### 1 · LLM 供應商

**方案 A — Claude Code CLI（預設，不用管理 API key）：**

```bash
claude /login    # 在終端機執行一次即可
```

**方案 B — Anthropic API：** 把 `src/config.ts` 的 `llm.provider` 改為 `"anthropic"`，並提供 `ANTHROPIC_API_KEY` 環境變數。

### 2 · 封面渲染的 OpenAI 金鑰（macOS Keychain）

先到 [platform.openai.com](https://platform.openai.com) **建立專屬 Project 與金鑰，並設每月花費上限**（每週一張圖花費極低，$10 上限已非常寬裕）。然後存進 Keychain——注意指令**開頭加一個空格**，可避免金鑰被寫進 shell 歷史：

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<你的金鑰>' -U
```

`npm run cover` 會自動讀取（若有設 `OPENAI_API_KEY` 環境變數則優先）。不要把金鑰放 `~/.zshrc`——純文字躺在磁碟、被每個程序繼承，而且 dotfiles 同步是最經典的外洩途徑。

### 3 · 寄送用的 Gmail SMTP（macOS Keychain）

只需設定一次：

1. [Google 帳戶 → 安全性 → 兩步驟驗證 → 應用程式密碼](https://myaccount.google.com/apppasswords)——產生一組（名稱隨意，例如 `browstack`）。
2. 終端機（開頭記得加空格）：

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16碼應用程式密碼>' -U
```

3. `npm run send` → 週刊連封面一起寄進你的收件匣。（Email client 不吃 `data:` URI 圖片、但吃 CID 附件——Browstack 用的正是後者。）

### 4 · 每週自動出刊（launchd）

一行指令把完整流程——`ingest → enrich → cover → send`——排成 macOS LaunchAgent：

```bash
npm run schedule:weekly                        # 預設每週六 08:17
npm run schedule:weekly -- --day 1 --hour 9    # 例：每週一 09:00（--day 0–6，0 = 週日）
```

- 在你登入的使用者 session 中執行，因此 Keychain（LLM／OpenAI／SMTP 金鑰）都可用。
- 排程時間 Mac 在睡眠？launchd 會在下次喚醒時補跑。
- 封面渲染失敗（例如未設 OpenAI 金鑰）不會擋出刊——沿用上一張封面。
- 內建品管：擷取空殼（正文 < 300 字）與重複社群貼文自動降級；百科／字典快查一律不入選。
- 日誌在 `data/logs/weekly.log`；隨時可手動出刊：`npm run weekly`。
- 解除排程：`launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

## 編輯原則

- **知識性是硬門檻。** 娛樂八卦、彩券、購物促銷、活動報名、字典式快查，無論停留多久一律排除。
- **摘要要能取代原文。** 每篇三個重點（各 ≤ 42 字）＋一句 takeaway（≤ 32 字）。
- **刊物即藝術品。** 固定色盤、serif 報頭、期數編號——美感讓人打開它，內容品質讓人讀完它。

## Roadmap

- 計分 v2：實讀訊號進入主排序；主題正規化
- 期數編號與典藏（每一期保留自己的刊物與封面）
- 策展 UI：挑選條目、加上你自己的觀點、選擇性對外發布
- 發行通路：自有名單（SMTP/SendGrid）、Ghost/Buttondown 匯出

## 授權

[MIT](LICENSE)
