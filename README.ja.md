# Browstack

[English](README.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md)

**Browser + Substack** — あなた自身のブラウジング履歴を、美しくデザインされたプライバシー第一の「パーソナル週刊誌」に変えて、本物のニュースレターのように受信トレイへ届けます。

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="The New Yorker のイラスト伝統に倣ってエンジンが生成した表紙のサンプル" />
  <br/>
  <em>毎号、The New Yorker のイラスト伝統に倣った表紙を新たに生成——<br/>その週にあなたが実際に読んだ内容をテーマに。</em>
</p>

## なぜ作ったのか

SNS のフィードから記事を開いては読み切れず、二度と見返さないブックマークが積み上がっていく。Browstack の核心的な洞察は：**ブラウジングそのものが入力である**ということ。履歴はすでにあなたのマシンにあり、「保存」ボタンは要りません。Browstack はそれをローカルで読み取り、知識型コンテンツだけを残し、原文を読み返さなくても十分なほどの要約を書き、保存する価値のある週刊号として組版します。

**あなたは自分自身の発行人です。** 毎号はデフォルトで完全にプライベート——外部への公開は常に、項目ごとの明示的なオプトインです。

> ### ⚡ 最短ルート：3 分で第 0 号を見る
>
> ```bash
> git clone https://github.com/howieyoung/browstack.git && cd browstack
> npm install                          # creates your personal config file
> claude /login                        # use your Claude subscription as the LLM (or an API key)
> npm run ingest && npm run enrich && npm run preview
> open out/browstack-issue-0.html      # your preview issue!
> ```
>
> この 5 ステップに**有料 API キーは不要**です：既存の Chrome 履歴、Claude Code CLI（追加キー不要）、同梱のデフォルト表紙で完結します。AI 生成表紙（OpenAI）とメール配信（Gmail）は、後述のワンタイムセットアップガイドで追加できます。

### 🤖 あるいは、AI エージェントに全部セットアップしてもらう

Clone した後、このフォルダで **Claude Code**（または Codex 等の coding agent）を開き、こう伝えてください：

> **「このプロジェクトをスキャンして、セットアップ手順を案内して」**

リポジトリには [AGENTS.md](AGENTS.md) が同梱されています——エージェントがあなたと一緒に全設定を進めるためのステップバイステップのプレイブックです：個人設定、LLM ログイン、最初の号、表紙用キー、Gmail 配信、Chrome 拡張、週次スケジュール。プライバシールール（キーは macOS Keychain へ、チャットには絶対に貼らない）も強制します。

## 仕組み

```
Chrome History ─┐
                ├→ classify → enrich → cover → render → send
Extension ──────┘   (knowledge   (LLM      (art     (nameplate,  (SMTP,
 (true reading       filter +     summar-   director  topics,      inline
  signals)           privacy      ies)      + image    summaries)   cover)
                     firewall)              engine)
```

- **Ingest** — Chrome のローカル History データベースを読み取ります（コピーを読む——Chrome は原本をロックするため）。Chrome 同期が有効なら、スマホでのブラウジングも自動的に含まれます。
- **Extension（MV3）** — *アクティブな*読書秒数（タブが可視＋直近の操作あり）をカウントし、読んでいるその瞬間に本文をキャプチャ（ログインウォールの内側も含む）。通信先は **`127.0.0.1` のみ**——データがマシンの外へ出ることはありません。
- **Classify** — 鉄則：非知識型コンテンツ（ゴシップ、宝くじ、セール、辞書的なクイック検索）は、どれだけ長く滞在しても誌面に載りません。センシティブなページ（銀行、メール、認証、行政サービス）はそもそも保存すらされません。
- **Enrich** — LLM が記事ごとに 3 つの要点＋1 つのテイクアウェイを、SNS 投稿ごとに 1 行の編集コンテキストを書きます。
- **Cover** — LLM のアートディレクターがその週を単一の視覚的メタファーに蒸留し、画像エンジンが固定のアートディレクション（フラットなガッシュ、限定パレット、たっぷりの余白——画中に文字なし）で描き上げます。
- **Render & send** — 雑誌の題字（号数№、期間、ワードマーク、タグライン）、トピック別の要約、週間統計。各項目には**その週あなたが何分読んだか**——選ばれた理由——を表示。あなた自身の Gmail SMTP で送信し、表紙は CID 添付でメール上部にインライン表示されます。
- **自己ループなし** — 送信された号のアイテムは封印（`published_in`）され、ダイジェストから読み返しても二度と再掲載されません。

## プライバシー原則

1. **ローカルファースト。** 解析・フィルタ・ランキングはすべてあなたのマシン上で。拡張機能の唯一の通信先は `127.0.0.1`。
2. **クラウド呼び出しの前にフィルタ。** コンテンツと分類されたページの抽出本文だけが LLM に届きます。銀行・メール・認証・行政ページはマシンの外に出ず、Browstack 自身のデータベースにも書き込まれません。
3. **秘密情報は macOS Keychain に**。dotfiles や環境変数エクスポートには置きません。
4. **公開は項目ごとのオプトイン。** 自動公開の経路は存在しません。

## 必要環境

- macOS 13+（Keychain と `sips` を使用。Linux/Windows は小さな置き換えが必要）
- Google Chrome（Chrome 同期推奨——モバイルのブラウジングもダイジェストに入ります）
- Node.js 20+
- LLM：[Claude Code CLI](https://claude.com/claude-code)（既存のサブスクリプションを使用）**または** Anthropic API キー
- 任意：OpenAI API キー（表紙画像のレンダリング）、Gmail アカウント（メール配信）

## クイックスタート

```bash
git clone https://github.com/<you>/browstack.git
cd browstack
npm install                 # also creates src/shared/userConfig.ts from the template
$EDITOR src/shared/userConfig.ts   # your email, Chrome profile, personal noise domains

npm run ingest              # import & classify your Chrome history (local only)
npm run stats               # sanity check: classification stats + top candidates
npm run enrich              # LLM: knowledge filter + summaries  (see LLM setup below)
npm run cover               # generate this issue's cover        (see OpenAI setup below)
npm run preview             # writes out/browstack-issue-0.html — open it!
npm run send                # email the issue to yourself        (see Gmail setup below)
```

### 拡張機能（真の読書シグナル）

```bash
npm run build:ext
npm run serve               # local receiver on 127.0.0.1:8787 — keep it running
```

その後 `chrome://extensions` を開き、**デベロッパーモード**を有効化 → **パッケージ化されていない拡張機能を読み込む** → `extension/` フォルダを選択。30 秒以上アクティブに読んだページがキャプチャされ（本文＋スクロール深度＋実読秒数）、ローカルデータベースに保存されます。ポップアップでレシーバーの状態とキュー長を確認できます。

## ワンタイムセットアップガイド

### 1 · LLM プロバイダー

**方法 A — Claude Code CLI（デフォルト、API キー管理不要）：**

```bash
claude /login    # once, in a terminal
```

**方法 B — Anthropic API：** `src/config.ts` の `llm.provider` を `"anthropic"` にして、環境変数 `ANTHROPIC_API_KEY` を設定。

### 2 · 表紙生成のキー（オンボーディング時に設定を）

**表紙こそが毎号を「生きた」ものにします——必ず設定しましょう。** クローン直後には同梱のデフォルト表紙（`assets/cover-default.jpg`、創刊号のアート）があるので表紙なしにはなりませんが、**毎号同じ画像の使い回し**になります。その週に実際に読んだ内容から*固有の*表紙を生成するには、2 つのキーが要ります：

- **LLM（アートディレクター）** — ステップ 1 で設定済みの Claude Code CLI または Anthropic API。その週のトピックを読み、1 つの視覚的メタファーと画像プロンプトを設計します。
- **OpenAI キー（レンダラー）** — そのプロンプトを `gpt-image-1` で完成イラストに変えます。

OpenAI キーがない場合、Browstack は**サブスクリプションの LLM 自身に SVG イラストとして表紙を描かせる**フォールバックを使います（最強モデル＋高推論エフォート）——それでも毎号固有の表紙になります。OpenAI レンダラーはより豊かなラスター画を生むだけの違いです。同梱デフォルト表紙は最後の保険にすぎません。

[platform.openai.com](https://platform.openai.com) で**専用プロジェクト＋月額上限付きキー**を作成してください（週 1 枚の画像はごく安価——$10 の上限で十分余裕）。次に Keychain へ保存——コマンド**先頭の半角スペース**に注意（shell 履歴に残さないため）：

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<your-key>' -U
```

`npm run cover` が自動で見つけます（環境変数 `OPENAI_API_KEY` があればそちらが優先）。キーを `~/.zshrc` に置かないでください——ディスク上に平文で残り、全プロセスに継承され、dotfiles 同期は古典的な漏洩経路です。

### 3 · 配信用の Gmail SMTP（macOS Keychain）

一度だけの設定です：

1. [Google アカウント → セキュリティ → 2 段階認証 → アプリパスワード](https://myaccount.google.com/apppasswords)——1 つ生成（名前は自由、例：`browstack`）。
2. ターミナルで（先頭の半角スペースに注意）：

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16-char app password>' -U
```

3. `npm run send` — 第 0 号が受信トレイに届き、表紙が上部にインライン表示されます。（メールクライアントは `data:` URI 画像を拒否しますが CID 添付は受け付けます——Browstack は後者を使用。）

### 4 · 週次自動化（launchd）

1 コマンドでフルラン——`ingest → enrich → cover → send`——を macOS LaunchAgent としてスケジュールします：

```bash
npm run schedule:weekly                        # every Saturday 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # e.g. Mondays at 09:00 (--day 0–6, 0 = Sunday)
```

- ログイン中のユーザーセッションで動くため、Keychain（LLM/OpenAI/SMTP の秘密情報）が利用可能。
- 予定時刻に Mac がスリープ中でも、次の復帰時に launchd が実行します。
- 表紙レンダリングの失敗（例：OpenAI キー未設定）は発行をブロックしません——前号の表紙を再利用します。
- LLM の一時的な失敗も実行を止めません：分類は 1 回自動リトライし、すでにエンリッチ済みの内容で発行されます。空の号が送られることはありません。
- 組み込みの品質ガード：抽出スタブ（300 字未満）と重複 SNS 投稿は自動降格。百科事典・辞書検索はそもそも対象外。
- ログ：`data/logs/weekly.log`。手動実行はいつでも：`npm run weekly`。
- アンインストール：`launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

### 号数とアーカイブ

すべての号に番号が付き、保存されます：№0 はプレビュー号、それ以降の号はシンプルに №N——進行は号数そのものが伝えます。`send` の成功が現在の号を封緘し、次の実行は自動的に新しい号を新しい表紙で開きます。成果物は `out/`（号ごとの Web 版＋メール版）と `assets/covers/`（号ごとに 1 枚の表紙）に蓄積され、`out/index.html` で閲覧可能なアーカイブになります。ある週の表紙レンダリングが失敗しても、前号の表紙が再利用されます。

## 編集原則

- **知識性はハードゲート。** 芸能ゴシップ、宝くじ、ショッピングセール、イベント申込、辞書的なクイック検索は、滞在時間に関わらず除外。
- **要約は原文の代わりになること。** 記事ごとに 3 つの要点（各 42 字以内）＋1 つのテイクアウェイ（32 字以内）。
- **一冊はアーティファクト。** 固定パレット、セリフ体の題字、号数番号——美しさが開かせ、内容の質が読み終えさせる。

## ロードマップ

- スコアリング v2：アクティブ読書シグナルをランキングへ；トピック正規化
- キュレーション UI：項目を選び、自分の見解を添えて、選んだ内容を外部公開
- 公開先：SMTP/SendGrid での自前リスト、Ghost/Buttondown エクスポート

## ライセンス

[MIT](LICENSE)
