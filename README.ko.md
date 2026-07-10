# Browstack

[English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md)

**Browser + Substack** — 당신의 브라우징 기록을 아름답게 디자인된, 프라이버시 우선의 개인 주간지로 만들어 진짜 뉴스레터처럼 받은편지함으로 배달합니다.

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="The New Yorker 일러스트 전통을 따라 엔진이 생성한 표지 샘플" />
  <br/>
  <em>매호마다 The New Yorker 일러스트 전통을 따른 표지를 새로 생성——<br/>그 주에 당신이 실제로 읽은 내용을 테마로.</em>
</p>

## 왜 만들었나

SNS 피드에서 기사를 열고는 끝까지 읽지 못하고, 다시는 돌아보지 않을 북마크만 쌓여 갑니다. Browstack의 핵심 통찰: **브라우징 자체가 입력입니다**. 기록은 이미 당신의 기기에 있고, '저장' 버튼은 필요 없습니다. Browstack은 그것을 로컬에서 읽고, 지식형 콘텐츠만 남기고, 원문을 다시 읽지 않아도 될 만큼의 요약을 쓰고, 간직할 가치가 있는 주간호로 조판합니다.

**당신은 당신 자신의 발행인입니다.** 매호는 기본적으로 완전히 비공개——외부 공개는 언제나 항목별 명시적 옵트인입니다.

> ### ⚡ 최단 경로: 3분 만에 제0호 보기
>
> ```bash
> git clone https://github.com/howieyoung/browstack.git && cd browstack
> npm install                          # creates your personal config file
> claude /login                        # use your Claude subscription as the LLM (or an API key)
> npm run ingest && npm run enrich && npm run preview
> open out/browstack-issue-0.html      # your preview issue!
> ```
>
> 이 다섯 단계에는 **유료 API 키가 전혀 필요 없습니다**: 기존 Chrome 기록, Claude Code CLI(추가 키 불필요), 그리고 번들 기본 표지로 충분합니다. AI 생성 표지(OpenAI)와 이메일 배달(Gmail)은 아래의 일회성 설정 가이드로 나중에 추가하세요.

### 🤖 아니면, AI 에이전트에게 전부 맡기세요

Clone 후 이 폴더에서 **Claude Code**(또는 Codex 등 coding agent)를 열고 이렇게 말하세요:

> **"이 프로젝트를 스캔해서 설정 방법을 안내해 줘"**

저장소에는 [AGENTS.md](AGENTS.md)가 동봉되어 있습니다——에이전트가 당신과 *함께* 모든 설정을 진행하는 단계별 플레이북입니다: 개인 설정, LLM 로그인, 첫 호, 표지 키, Gmail 배달, Chrome 확장, 주간 스케줄. 프라이버시 규칙(키는 macOS Keychain으로, 채팅에는 절대 붙여넣지 않기)도 강제합니다.

## 작동 방식

```
Chrome History ─┐
                ├→ classify → enrich → cover → render → send
Extension ──────┘   (knowledge   (LLM      (art     (nameplate,  (SMTP,
 (true reading       filter +     summar-   director  topics,      inline
  signals)           privacy      ies)      + image    summaries)   cover)
                     firewall)              engine)
```

- **Ingest** — Chrome의 로컬 History 데이터베이스를 읽습니다(사본을 읽음——Chrome이 원본을 잠그기 때문). Chrome 동기화가 켜져 있으면 휴대폰 브라우징도 자동 포함됩니다.
- **Extension (MV3)** — *능동적* 읽기 초(탭 표시 + 최근 상호작용)를 세고, 읽는 그 순간에 본문을 캡처합니다(로그인 월 안쪽 포함). 통신 대상은 **오직 `127.0.0.1`** —— 데이터가 기기 밖으로 나가지 않습니다.
- **Classify** — 철칙: 비지식형 콘텐츠(가십, 복권, 프로모션, 사전식 빠른 검색)는 아무리 오래 머물렀어도 지면에 실리지 않습니다. 민감한 페이지(은행, 메일, 인증, 행정 서비스)는 아예 저장조차 되지 않습니다.
- **Enrich** — LLM이 기사마다 요점 3개 + 테이크어웨이 1줄을, SNS 게시물마다 편집 컨텍스트 1줄을 씁니다.
- **Cover** — LLM 아트 디렉터가 그 주를 하나의 시각적 은유로 증류하고, 이미지 엔진이 고정된 아트 디렉션(플랫 과슈, 제한된 팔레트, 넉넉한 여백——그림 속 글자 없음)으로 렌더링합니다.
- **Render & send** — 잡지 제호(호수 №, 기간, 워드마크, 태그라인), 토픽별 요약, 주간 통계. 각 항목에는 **그 주에 몇 분을 읽었는지**——선정된 이유——가 표시됩니다. 당신의 Gmail SMTP로 발송되며 표지는 CID 첨부로 메일 상단에 인라인됩니다.
- **자기 루프 없음** — 발송된 호의 항목은 봉인(`published_in`)되어, 다이제스트에서 다시 읽어도 절대 재등장하지 않습니다.

## 프라이버시 원칙

1. **로컬 퍼스트.** 파싱·필터링·랭킹은 모두 당신의 기기에서. 확장 프로그램의 유일한 통신 상대는 `127.0.0.1`.
2. **클라우드 호출 전에 필터.** 콘텐츠로 분류된 페이지의 추출 본문만 LLM에 도달합니다. 은행·메일·인증·행정 페이지는 기기를 떠나지 않으며 Browstack 자체 데이터베이스에도 기록되지 않습니다.
3. **비밀 정보는 macOS Keychain에.** dotfiles나 환경 변수 export에 두지 않습니다.
4. **공개는 항목별 옵트인.** 자동 공개 경로는 존재하지 않습니다.

## 요구 사항

- macOS 13+ (Keychain과 `sips` 사용; Linux/Windows는 약간의 대체가 필요)
- Google Chrome (Chrome 동기화 권장——모바일 브라우징도 다이제스트에 포함됩니다)
- Node.js 20+
- LLM: [Claude Code CLI](https://claude.com/claude-code)(기존 구독 사용) **또는** Anthropic API 키
- 선택: OpenAI API 키(표지 이미지 렌더링), Gmail 계정(이메일 배달)

## 빠른 시작

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

### 확장 프로그램 (진짜 읽기 신호)

```bash
npm run build:ext
npm run serve               # local receiver on 127.0.0.1:8787 — keep it running
```

그런 다음 `chrome://extensions` → **개발자 모드** 활성화 → **압축해제된 확장 프로그램 로드** → `extension/` 폴더 선택. 30초 이상 능동적으로 읽은 페이지가 캡처되어(본문 + 스크롤 깊이 + 실제 읽기 초) 로컬 데이터베이스에 저장됩니다. 팝업에서 리시버 상태와 대기열 길이를 확인할 수 있습니다.

## 일회성 설정 가이드

### 1 · LLM 프로바이더

**옵션 A — Claude Code CLI (기본값, API 키 관리 불필요):**

```bash
claude /login    # once, in a terminal
```

**옵션 B — Anthropic API:** `src/config.ts`의 `llm.provider`를 `"anthropic"`으로 바꾸고 환경 변수 `ANTHROPIC_API_KEY`를 설정.

### 2 · 표지 생성 키 (온보딩 때 설정하세요)

**표지야말로 매호를 '살아있게' 만듭니다——꼭 설정하세요.** 갓 클론한 상태에도 번들 기본 표지(`assets/cover-default.jpg`, 창간호 아트)가 있어 표지가 없는 일은 없지만, **매호 같은 이미지를 재사용**하게 됩니다. 그 주에 실제로 읽은 내용에서 *고유한* 표지를 생성하려면 두 개의 키가 필요합니다:

- **LLM (아트 디렉터)** — 1단계에서 이미 설정한 Claude Code CLI 또는 Anthropic API. 그 주의 토픽을 읽고 하나의 시각적 은유와 이미지 프롬프트를 설계합니다.
- **OpenAI 키 (렌더러)** — 그 프롬프트를 `gpt-image-1`로 완성된 일러스트로 만듭니다.

OpenAI 키가 없으면 Browstack은 **구독 LLM이 직접 SVG 일러스트로 표지를 그리는** 폴백을 사용합니다(최강 모델 + 높은 추론 강도)——그래도 매호 고유한 표지를 갖게 됩니다. OpenAI 렌더러는 더 풍부한 래스터 아트를 만들 뿐입니다. 번들 기본 표지는 최후의 보루일 뿐입니다.

[platform.openai.com](https://platform.openai.com)에서 **전용 프로젝트 + 월 지출 한도가 있는 키**를 만드세요(주 1장 이미지는 매우 저렴——$10 한도면 넉넉합니다). 그런 다음 Keychain에 저장——명령 **맨 앞의 공백 한 칸**에 주의하세요(shell 히스토리에 남지 않게 합니다):

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<your-key>' -U
```

`npm run cover`가 자동으로 찾습니다(환경 변수 `OPENAI_API_KEY`가 있으면 우선). 키를 `~/.zshrc`에 두지 마세요——디스크에 평문으로 남고, 모든 프로세스에 상속되며, dotfiles 동기화는 고전적인 유출 경로입니다.

### 3 · 배달용 Gmail SMTP (macOS Keychain)

한 번만 설정하면 됩니다:

1. [Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호](https://myaccount.google.com/apppasswords)——하나 생성(이름은 자유, 예: `browstack`).
2. 터미널에서(맨 앞의 공백에 주의):

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16-char app password>' -U
```

3. `npm run send` — 제0호가 받은편지함에 도착하고 표지가 상단에 인라인됩니다. (이메일 클라이언트는 `data:` URI 이미지를 거부하지만 CID 첨부는 허용——Browstack은 후자를 사용합니다.)

### 4 · 주간 자동화 (launchd)

명령 하나로 전체 실행——`ingest → enrich → cover → send`——을 macOS LaunchAgent로 스케줄합니다:

```bash
npm run schedule:weekly                        # every Saturday 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # e.g. Mondays at 09:00 (--day 0–6, 0 = Sunday)
```

- 로그인된 사용자 세션에서 실행되므로 Keychain(LLM/OpenAI/SMTP 비밀 정보)을 사용할 수 있습니다.
- 예약 시각에 Mac이 잠자기 상태여도, 다음 깨어날 때 launchd가 실행합니다.
- 표지 렌더링 실패(예: OpenAI 키 미설정)는 발행을 막지 않습니다——이전 표지를 재사용합니다.
- 내장 품질 가드: 추출 스텁(300자 미만)과 중복 SNS 게시물은 자동 강등; 백과사전·사전 검색은 애초에 대상 외.
- 로그: `data/logs/weekly.log`. 수동 실행은 언제든: `npm run weekly`.
- 제거: `launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

### 호수와 아카이브

모든 호에 번호가 붙고 보존됩니다: №0은 프리뷰호, №1은 창간호, 이후 제N호. `send` 성공이 현재 호를 봉인하고, 다음 실행은 자동으로 새 표지와 함께 새 호를 엽니다. 결과물은 `out/`(호별 웹 + 이메일 버전)과 `assets/covers/`(호당 표지 1장)에 쌓이며, `out/index.html`에서 아카이브를 열람할 수 있습니다. 어느 주의 표지 렌더링이 실패해도 이전 호의 표지가 재사용됩니다.

## 편집 원칙

- **지식성은 하드 게이트.** 연예 가십, 복권, 쇼핑 프로모션, 이벤트 신청, 사전식 빠른 검색은 체류 시간과 무관하게 제외.
- **요약은 원문을 대체해야 합니다.** 기사당 요점 3개(각 42자 이내) + 테이크어웨이 1줄(32자 이내).
- **한 호는 아티팩트입니다.** 고정 팔레트, 세리프 제호, 호수 번호——아름다움이 열게 하고, 내용의 질이 끝까지 읽게 합니다.

## 로드맵

- 스코어링 v2: 능동 읽기 신호를 랭킹에 반영; 토픽 정규화
- 큐레이션 UI: 항목 선택, 자신의 견해 추가, 선택한 콘텐츠의 외부 공개
- 공개 채널: SMTP/SendGrid 자체 리스트, Ghost/Buttondown 내보내기

## 라이선스

[MIT](LICENSE)
