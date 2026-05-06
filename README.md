# ZeroJarvis — 語音個人助理

> AI 個人助理，支援語音互動 + 視覺分析 + 地圖導航

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 特色

- **零操作互動** — 頁面載入即自動聆聽，無需按鈕
- **AI Agent** — 基於 OpenCode Server + Claude，具備完整工具呼叫能力
- **多會話管理** — 無上限平行對話，語音切換「上一個/下一個/新對話」
- **全螢幕攝像頭** — 語音觸發開啟，科幻 HUD 風格
- **視覺分析** — 攝像頭截圖送 Vision Agent 分析
- **螢幕截圖** — Desktop 原生截圖 / Web getDisplayMedia，送 AI 分析
- **地圖功能** — AI 推薦地點後自動彈出 Google Maps
- **YouTube 影片** — AI websearch 推薦影片，全螢幕嵌入播放
- **串流日誌** — Gateway 終端機即時顯示 AI 處理過程、工具呼叫、耗時統計
- **Skill 系統** — AI 行為由 Skill 文件驅動，易於擴充
- **ACTION 標記** — AI 主動控制前端（攝像頭、地圖等）
- **NotebookLM 整合** — 透過 MCP 操作 Google NotebookLM（問答、Podcast 產生）
- **對話記憶** — OpenCode Session 持久化，AI 記得上下文

## 快速開始

### 前置需求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Bun](https://bun.sh/) >= 1.1 (Gateway server)
- [OpenCode](https://opencode.ai/) (LLM Agent Server)
- [Rust](https://rustup.rs/) (Desktop 版需要，Web 版不需要)

### 安裝

```bash
# Clone
git clone https://github.com/user/ZeroJarvis.git
cd ZeroJarvis

# 安裝依賴
pnpm install

# 設定環境變數
cp .env.example .env
# 編輯 .env 填入你的 GROQ_API_KEY
```

### 取得 API Key

| 服務 | 用途 | 取得方式 |
|------|------|----------|
| Groq | STT (Whisper) | [console.groq.com/keys](https://console.groq.com/keys) (免費) |
| OpenCode | LLM Agent | 安裝 [opencode](https://opencode.ai/) 並設定 provider |

### 啟動

```bash
# 方法一：Web 版 (瀏覽器)
.\start.bat          # Windows CMD
.\start.ps1          # PowerShell

# 方法二：Desktop 版 (Tauri 桌面應用)
.\start-desktop.bat  # Windows CMD
.\start-desktop.ps1  # PowerShell

# 方法三：手動啟動
opencode serve          # LLM Agent Server :4096
pnpm --filter gateway dev   # Voice Gateway :3100
pnpm --filter web dev       # Web UI :3000
pnpm --filter desktop dev   # Desktop (需要 Rust)
```

- Web 版開啟 https://localhost:3000（需要 HTTPS 才能使用麥克風）
- Desktop 版自動彈出桌面視窗，支援 `Ctrl+Space` 全域快捷鍵喚醒

### 首次使用

1. 開啟終端執行 `opencode`
2. 使用 `/connect` 設定 LLM provider (建議 GitHub Copilot 或 Anthropic)
3. 開啟瀏覽器，允許麥克風權限
4. 直接說話即可互動

## 架構

```
ZeroJarvis/
├── apps/web/            # SvelteKit 前端 (HUD UI) :3000
├── apps/desktop/        # Tauri 桌面應用 (Rust + Web)
├── services/gateway/    # Bun WebSocket 語音閘道 :3100
├── packages/shared/     # 共用型別與常數
├── .opencode/           # Agent 定義 + Skills
│   ├── agents/
│   │   ├── jarvis.md    # 主 Agent（語音助理）
│   │   └── vision.md   # Vision 子 Agent
│   └── skills/
│       ├── hardware-control/  # 攝像頭控制技能
│       ├── food-map/          # 地圖導航技能
│       ├── screenshot/        # 螢幕截圖技能
│       ├── youtube/           # YouTube 影片技能
│       └── notebooklm/        # NotebookLM 筆記本 (MCP)
├── start.bat / start.ps1           # Web 版啟動
├── start-desktop.bat / .ps1        # Desktop 版啟動
└── docs/DESIGN.md       # 完整設計文件
```

## 語音流程

```
使用者說話 → VAD 偵測語音 → STT (Groq Whisper) → OpenCode Agent → TTS → 語音回覆
                                                       ↓
                                                  [ACTION:X] 標記
                                                       ↓
                                        前端自動執行（開相機/截圖/開地圖）
```

## ACTION 系統

AI 透過在回覆中嵌入 ACTION 標記來控制前端，標記會被自動移除不會朗讀：

| 標記 | 效果 |
|------|------|
| `[ACTION:CAMERA_ON]` | 開啟攝像頭 |
| `[ACTION:CAMERA_OFF]` | 關閉攝像頭 |
| `[ACTION:CAPTURE]` | 擷取攝像頭畫面送視覺分析 |
| `[ACTION:SCREENSHOT]` | 擷取電腦螢幕送視覺分析 |
| `[ACTION:MAP:搜尋詞]` | 彈出 Google Maps |
| `[ACTION:MAP_CLOSE]` | 關閉地圖 |
| `[ACTION:YOUTUBE:影片ID]` | 彈出 YouTube 播放器 |
| `[ACTION:YOUTUBE_CLOSE]` | 關閉影片 |
| `[ACTION:NEW_SESSION]` | 建立新對話 |
| `[ACTION:SESSION_PREV]` | 切到上一個對話 |
| `[ACTION:SESSION_NEXT]` | 切到下一個對話 |
| `[ACTION:LISTEN_PAUSE]` | 暫停聆聽 |
| `[ACTION:LISTEN_RESUME]` | 恢復聆聽 |

### 擴充 ACTION

1. 在 `.opencode/skills/` 新增 Skill 文件教 AI 何時使用
2. 在 `services/gateway/src/llm/opencode.ts` 的 `parseActions()` 已支援 payload
3. 在 `apps/web/src/lib/components/HUD.svelte` 的 `handleAction()` 新增 case

## Skill 系統

Skills 是 Markdown 文件，定義 AI 在特定情境下的行為規則：

```
.opencode/skills/
├── hardware-control/SKILL.md  # 教 AI 何時開相機、拍照
├── food-map/SKILL.md          # 教 AI 何時顯示地圖
├── screenshot/SKILL.md        # 教 AI 何時截取螢幕
├── youtube/SKILL.md           # 教 AI 何時播放 YouTube 影片
├── session/SKILL.md           # 教 AI 何時切換/建立對話
├── listen-control/SKILL.md   # 教 AI 何時暫停/恢復聆聽
└── notebooklm/SKILL.md       # 教 AI 何時操作 NotebookLM 筆記本
```

新增功能只需撰寫新的 Skill 文件 + 對應的前端 ACTION handler。

## 對話管理

- OpenCode 使用 **Session** 管理對話歷史
- 支援**多會話平行處理** — 第一個還在處理時可開新對話
- **Per-Session 獨立狀態** — 每個 session 擁有獨立的 UI 快照，切換不會混亂
- **覆蓋層暫停/恢復** — 切走時攝像頭/地圖/YouTube 暫停隱藏，切回恢復
- **全 Skill 驅動** — 「新對話」「上一個」「下一個」等指令由 AI 透過 session Skill 判斷
- **聆聽控制** — AI 可暫停/恢復 VAD，暫停後顯示浮動按鈕恢復
- 底部 tab 列顯示所有 session 狀態（⏳ / ✅ / ❌）
- 背景 session 完成時 tab 閃爍通知
- Vision 使用獨立 Session（不污染主對話）

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | SvelteKit 2 + Svelte 5 (Runes) + Vite |
| 閘道 | Bun + Hono + WebSocket |
| VAD | @ricky0123/vad-web (Silero ONNX) |
| STT | Groq Whisper API (whisper-large-v3) |
| TTS | msedge-tts (zh-TW-HsiaoChenNeural) |
| LLM | OpenCode Server + @opencode-ai/sdk |
| Model | github-copilot/claude-sonnet-4 |

## UI 模式

| 模式 | 說明 |
|------|------|
| HUD (預設) | 波形動畫 + 浮動字幕 + 自動聆聽 |
| 攝像頭 | 全螢幕滑入 + 科幻 HUD + 掃描線 |
| 地圖 | 全螢幕 Google Maps + 科幻框架 |
| YouTube | 全螢幕嵌入式播放器 + 紅色 HUD |
| Session Tabs | 底部 tab 列顯示所有平行會話狀態 |

## 開發

```bash
# 安裝依賴
pnpm install

# 開發模式（自動 hot reload）
pnpm dev

# 只跑前端
pnpm --filter web dev

# 只跑 Gateway
pnpm --filter gateway dev

# Desktop 版 (需要 Rust)
pnpm --filter desktop dev

# 型別檢查
pnpm --filter web check
```

## 環境變數

```env
# .env (放在專案根目錄)
GROQ_API_KEY=gsk_xxxxxxxxxxxx     # 必要：Groq STT
TTS_VOICE=zh-TW-HsiaoChenNeural  # 可選：TTS 語音
OPENCODE_URL=http://localhost:4096 # 可選：OpenCode 位址
```

## NotebookLM 整合（MCP）

透過 [notebooklm-mcp](https://github.com/PleasePrompto/notebooklm-mcp) 讓 Jarvis 可直接操作 Google NotebookLM。

### 功能

- **問答** — 對筆記本內容提問，取得帶引用的 Gemini 2.5 回覆
- **來源管理** — 新增 URL 或文字到筆記本
- **Podcast 產生** — 產生 Audio Overview（雙人對話摘要）
- **筆記本管理** — 列出、搜尋、切換筆記本

### 首次設定（認證）

```bash
# 方法一：跟 Jarvis 說「登入 NotebookLM」
# → AI 會呼叫 setup_auth 工具，Chrome 視窗彈出讓你登入 Google

# 方法二：手動執行（HEADLESS=false 才能看到登入視窗）
set HEADLESS=false
npx notebooklm-mcp@latest
# → 等待 MCP 啟動後，透過 MCP client 呼叫 setup_auth
```

登入成功後 Cookie 保存在 `%LOCALAPPDATA%\notebooklm-mcp\Data\chrome_profile\`，後續自動登入。

### 注意事項

| 項目 | 說明 |
|------|------|
| 首次認證 | 必須先登入 Google，否則所有工具回報認證失敗 |
| 回應延遲 | `ask_question` 約 10-30 秒（Chrome 自動化 + Gemini 回覆） |
| Podcast 耗時 | `generate_audio` 約 3-10 分鐘（NotebookLM 背景處理） |
| Context 消耗 | `standard` profile 註冊 10 個工具，佔一定 token |
| Chrome 佔用 | MCP 在背景運行 headless Chrome，佔約 200-400MB RAM |
| Windows 限制 | 完全支援，Chrome profile 路徑為 `%LOCALAPPDATA%\notebooklm-mcp\` |
| Cookie 過期 | 如認證失效，跟 Jarvis 說「重新登入 NotebookLM」即可 |

### 設定位置

`opencode.json` 中的 `mcp.notebooklm` 區塊：
```json
"mcp": {
  "notebooklm": {
    "type": "local",
    "command": ["npx", "notebooklm-mcp@latest"],
    "enabled": true,
    "environment": {
      "HEADLESS": "true",
      "NOTEBOOKLM_AI_MARKER": "false",
      "NOTEBOOKLM_PROFILE": "standard"
    }
  }
}
```

### 語音觸發範例

| 語音指令 | AI 行為 |
|---------|---------|
| 「幫我查筆記本裡關於 X 的內容」 | `ask_question` |
| 「我有哪些筆記本」 | `list_notebooks` |
| 「切到 XX 筆記本」 | `select_notebook` |
| 「把這個網址加到筆記本」 | `add_source` |
| 「產生 Podcast」 | `generate_audio` |
| 「建一個新筆記本」 | `add_notebook` |

## 疑難排解

| 問題 | 解法 |
|------|------|
| 麥克風沒反應 | 確認使用 HTTPS (localhost 自動有)，並允許麥克風權限 |
| AI 沒回覆 | 確認 OpenCode server 正在跑 (`opencode serve`) |
| STT 失敗 | 確認 `.env` 中 `GROQ_API_KEY` 正確 |
| TTS 沒聲音 | 點擊頁面任意處解鎖 AudioContext |
| WebSocket 斷線 | Gateway 會自動重連，確認 port 3100 沒被佔用 |
| Desktop: cargo not found | 安裝 Rust: https://rustup.rs ，重開終端 |
| Desktop: title 錯誤 | `tauri.conf.json` 的 `app` 層不可有 `title`，標題在 `windows[0].title` |
| 第一次 Desktop 很慢 | 正常，Rust 編譯約 2-3 分鐘，之後增量 build 很快 |

## License

MIT
