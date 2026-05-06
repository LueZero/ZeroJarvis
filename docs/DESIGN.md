# ZeroJarvis — Jarvis 語音個人助理設計文件

> **版本**：0.4.0  
> **日期**：2026-05-06  
> **代號**：ZeroJarvis (零代理 — 零打字互動)

---

## 1. 產品定位

一個以**語音為主要互動方式**的個人 AI 助理，結合：
- **語音輸入** → STT → LLM Agent → TTS 語音回覆
- **攝像頭視覺** → 全螢幕相機 + 圖像分析 → LLM 回覆（Vision 流程）
- **桌面 + Web 雙端** 通用 UI
- **OpenCode Server** 作為 LLM 統一中樞（Agent Loop + MCP Tools）

---

## 2. 核心功能

### F1：語音互動（Voice Pipeline）
```
🎤 麥克風 → VAD 自動偵測 → STT 轉文字 → OpenCode Agent → TTS 語音回覆
```
- 頁面載入自動開始聆聽（無需按鈕、無喚醒詞）
- VAD (Silero) 偵測語音活動，無聲時 idle 待命
- STT 辨識後直接送入 OpenCode Agent
- Agent 回覆嵌入 ACTION 標記控制硬體
- TTS 串流語音回覆
- 支援打斷（Barge-in）
- AudioContext 自動解鎖（首次用戶互動時 unlock）

### F2：攝像頭視覺處理（Vision Pipeline）
```
📷 語音觸發 → 全螢幕相機滑入 → 擷取 → Vision Agent → TTS 回覆
```
- 語音觸發：「開啟攝像頭」→ 全螢幕相機從右側滑入
- 網格覆蓋：3×3 輔助網格 + 四角框 + REC 指示燈
- 語音拍照：「拍照」/「截圖分析」→ AI 發出 [ACTION:CAPTURE]
- 拍照後自動關閉相機，Vision Agent 分析圖片
- 相機模式下語音互動持續運作，文字字幕隱藏
- 圖片透過 FilePartInput (data URI) 傳送給 OpenCode

### F3：UI 設計（Jarvis HUD）
- SvelteKit 前端，Tauri 2.0 桌面包裝
- 深色科技風 HUD：Arc Reactor 聲波動畫
- 四態 UI：Idle / Listening / Thinking / Speaking
- 字幕浮動在底部（不佔佈局空間）
- 全螢幕相機覆蓋（fixed overlay，從右滑入）

### F4：ACTION 系統
AI 回覆中嵌入控制標記，由 Gateway 解析後轉發前端：
| 標記 | 效果 |
|------|------|
| `[ACTION:CAMERA_ON]` | 全螢幕開啟攝像頭 |
| `[ACTION:CAMERA_OFF]` | 關閉攝像頭 |
| `[ACTION:CAPTURE]` | 擷取畫面送 Vision Agent |
| `[ACTION:SCREENSHOT]` | 擷取電腦螢幕送 Vision Agent |
| `[ACTION:MAP:搜尋詞]` | 彈出 Google Maps 地圖 |
| `[ACTION:MAP_CLOSE]` | 關閉地圖 |
| `[ACTION:YOUTUBE:影片ID]` | 彈出 YouTube 影片播放器 |
| `[ACTION:YOUTUBE_CLOSE]` | 關閉影片播放器 |
| `[ACTION:NEW_SESSION]` | 建立新對話（當前保留背景） |
| `[ACTION:SESSION_PREV]` | 切到上一個對話 |
| `[ACTION:SESSION_NEXT]` | 切到下一個對話 |
| `[ACTION:LISTEN_PAUSE]` | 暫停 VAD 聆聽 |
| `[ACTION:LISTEN_RESUME]` | 恢復 VAD 聆聽 |

ACTION 格式支援 payload：`[ACTION:NAME:PAYLOAD]`，向下相容無 payload 的舊格式。

### F5：地圖導航（Map Overlay）
```
使用者: "附近有什麼好吃的？"
  → AI 介紹 + [ACTION:MAP:附近日式料理]
  → 前端彈出全螢幕 Google Maps iframe
  → 科幻 HUD 風格（掃描線、四角框、資料條）
```
- 由 Skill 驅動（`.opencode/skills/food-map/SKILL.md`）
- 不限美食：景點、加油站、飯店、便利商店等皆可觸發
- 語音說「關閉地圖」→ `[ACTION:MAP_CLOSE]`

### F6：工具擴充（MCP Tools）
- 透過 OpenCode MCP 機制掛載外部工具
- AI 自主判斷何時呼叫工具

### F7：螢幕截圖分析（Screen Capture）
```
使用者: "幫我看螢幕上這個錯誤"
  → AI 回覆 + [ACTION:SCREENSHOT]
  → Desktop: Tauri 原生截圖 (xcap, 無彈窗)
  → Web: getDisplayMedia (瀏覽器授權彈窗)
  → base64 JPEG → Vision Agent 分析
```
- 由 Skill 驅動（`.opencode/skills/screenshot/SKILL.md`）
- 與 CAPTURE 區分：CAPTURE = 攝像頭實體拍照，SCREENSHOT = 電腦螢幕
- Desktop 模式零延遲（Rust xcap 原生 API，不需用戶確認）
- Web 模式觸發系統畫面分享對話框

### F8：YouTube 影片播放（YouTube Overlay）
```
使用者: "推薦一個 Svelte 教學影片"
  → AI 用 websearch 搜尋 site:youtube.com Svelte tutorial
  → 取得影片 ID + 簡短介紹
  → [ACTION:YOUTUBE:xxxxxxxxxxx]
  → 前端彈出全螢幕 YouTube 嵌入式播放器
```
- 由 Skill 驅動（`.opencode/skills/youtube/SKILL.md`）
- AI 必須透過 websearch 確認影片存在，不可編造 ID
- 科幻 HUD 風格（紅色主題，與 Map 的藍色區分）
- 語音說「關掉影片」→ `[ACTION:YOUTUBE_CLOSE]`

### F9：多會話管理（Multi-Session）
```
使用者: "新對話" → 建立新 session（上一個繼續背景處理）
使用者: "上一個" → 切回上一個 session 看結果
使用者: "下一個" → 切到下一個 session
使用者: "在新對話中幫我查天氣" → AI Skill 判斷 → [ACTION:NEW_SESSION]
```
- 無上限平行會話，每個 session 獨立 OpenCode session ID
- **Per-Session 獨立狀態**：每個 session 擁有獨立的 UI 狀態（LLM 文字、STT、覆蓋層、錯誤）
- 底部 tab 列顯示所有 session 狀態（⏳ processing / ✅ done / ❌ error）
- **覆蓋層暫停/恢復**：切走時攝像頭/地圖/YouTube 暫停隱藏（不釋放資源），切回時恢復
- **全 Skill 驅動**：所有 session 指令由 AI 透過 session 技能判斷並輸出 ACTION 標記
- 背景 session 完成時 tab 閃爍通知
- Vision 仍使用獨立臨時會話（不受多會話系統影響）
- 由 Skill 驅動（`.opencode/skills/session/SKILL.md`）

### F11：聆聽控制（Listen Control）
```
使用者: "安靜一下" → AI 回覆 + [ACTION:LISTEN_PAUSE] → VAD 停止
使用者: 點擊「恢復聆聽」浮動按鈕 → VAD 重啟
```
- AI 可透過 ACTION 標記暫停/恢復 VAD 聆聽
- 暫停後前端顯示「恢復聆聽」浮動按鈕（解決語音無法恢復的矛盾）
- 觸發詞：「安靜」「不要聽了」「暫停聆聽」
- 由 Skill 驅動（`.opencode/skills/listen-control/SKILL.md`）

### F10：Gateway 串流日誌（Streaming Logs）
```
[14:32:05.123] [EVENT] message.part.updated — "好的，讓我幫你查一下..."
[14:32:05.456] [TOOL:CALL] websearch("site:youtube.com Svelte tutorial")
[14:32:07.890] [TOOL:DONE] websearch → 3 results (2434ms)
[14:32:08.100] [EVENT] session.idle
[TIMING] stt=320ms polish=150ms llm=4200ms tts=800ms total=5470ms
```
- Gateway cmd 終端機即時印出完整 AI 處理過程
- 每個 SSE 事件：`[HH:MM:SS.ms] [TYPE] detail`
- Tool call：工具名稱 + 參數摘要 + 耗時
- 文字串流：印出前 80 字元 preview
- 階段計時：STT / Polish / LLM / TTS 各階段耗時

---

## 3. 系統架構

```
┌───────────────────────────────────────────────────────────┐
│            前端 UI (SvelteKit + Tauri)  :3000              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Mic/VAD  │ │ Camera   │ │ HUD/Viz  │ │  Subtitle    │ │
│  │ (Silero) │ │(MediaAPI)│ │ (Canvas) │ │  (打字機)    │ │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └──────────────┘ │
└───────┼─────────────┼─────────────────────────────────────┘
        │ ws:binary   │ ws:json(image)
        │ (Float32)   │ (base64)
┌───────▼─────────────▼─────────────────────────────────────┐
│           Voice Gateway (Bun + Hono)  :3100                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   STT    │ │   TTS    │ │  Vision  │ │  Session Mgr │ │
│  │(Groq API)│ │(edge-tts)│ │(OpenCode)│ │ (OpenCode)   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
└───────┼────────────┼────────────┼───────────────┼─────────┘
        │            │            │               │
┌───────▼────────────▼────────────▼───────────────▼─────────┐
│           OpenCode Server (LLM Hub)  :4096                 │
│  ┌────────────────┐ ┌────────────┐ ┌───────────────────┐  │
│  │   Providers    │ │   Agent    │ │    MCP Tools      │  │
│  │ github-copilot │ │   Loop     │ │  (Pencil, etc.)   │  │
│  │ claude-sonnet-4│ │            │ │                   │  │
│  └────────────────┘ └────────────┘ └───────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## 4. 技術選型

| 模組 | 技術 | 備註 |
|------|------|------|
| **前端框架** | SvelteKit 2.x + Svelte 5 | Runes 響應式 |
| **桌面包裝** | Tauri 2.0 | Rust 後端、跨平台 |
| **語音閘道** | Bun + Hono | WebSocket Server |
| **VAD** | @ricky0123/vad-web (Silero ONNX) | 瀏覽器端語音活動偵測 |
| **STT** | Groq Whisper API (whisper-large-v3) | 免費、快速、支援中文 |
| **TTS** | edge-tts | 免費、多語言 |
| **LLM** | OpenCode Server + @opencode-ai/sdk | Agent Loop + 工具 |
| **LLM Model** | github-copilot/claude-sonnet-4 | 免費 (Copilot) |
| **Vision** | 同上 (Claude Sonnet 支援圖片) | 原生多模態 |
| **攝像頭** | MediaDevices API | Web 標準 |
| **工具系統** | OpenCode MCP | 標準化工具協定 |
| **Monorepo** | pnpm workspace | apps/ + services/ + packages/ |

---

## 5. 資料流

### 5.1 語音流程（當前實作）

```
[使用者說話]
     │
     ▼
[VAD 偵測語音結束] ────→ 自動停止 VAD
     │ Float32Array
     ▼ (WebSocket binary)
[Gateway: STT (Groq Whisper)]
     │ text
     ▼
[Gateway: OpenCode chatStream()]
     │ 1. event.subscribe() → SSE stream
     │ 2. session.promptAsync() → 觸發 Agent Loop
     │ 3. 讀取 message.part.updated 事件
     ▼
[串流 llm_delta → 前端打字機顯示]
     │ llm_done
     ▼
[Gateway: TTS (edge-tts)]
     │ binary audio
     ▼
[前端播放語音 + Waveform 震動]
     │ 播放完畢
     ▼
[回到 idle → 自動重啟 VAD]
```

### 5.2 視覺流程

```
[使用者語音] "開啟攝像頭"
     │
     ▼ (LLM 回覆含 [ACTION:CAMERA_ON])
[前端：全螢幕相機從右側滑入]
     │
[使用者語音] "拍照分析"
     │
     ▼ (LLM 回覆含 [ACTION:CAPTURE])
[前端：截圖 base64 + 自動關閉相機]
     │ ws: { type: "image", data, query }
     ▼
[Gateway: processVision]
     │ 1. 儲存圖片到 .captures/
     │ 2. 建立 vision 專用 session
     │ 3. 送 FilePartInput (data:image/jpeg;base64,...)
     │ 4. 訂閱 events 取得回覆
     ▼
[TTS 語音回覆分析結果]
```

### 5.3 OpenCode Session 管理

```
[首次對話] → session.create() → 儲存 sessionId
[後續對話] → 重用 sessionId（多輪上下文）
[新對話按鈕] → resetSession() → 下次自動 create 新 session
[每次 chatStream] → event.subscribe() + promptAsync(sessionId)
```

### 5.4 多會話流程（F9）

```
[使用者語音] "幫我查一下 Svelte 教學" (Session #1 開始處理)
     │
     ▼ (STT → chatStream → LLM 在背景處理中...)
[使用者語音] "新對話"
     │
     ▼ (Gateway 關鍵字攔截，不送 AI)
[Gateway: sessionManager.createSession()]
     │ 1. Session #1 繼續背景處理
     │ 2. Session #2 建立為 active
     │ 3. ws.send({ type: "session_list", sessions })
     ▼
[前端：底部 tab 列更新，切到 Session #2]
     │
[使用者語音] "現在的天氣如何？" (送到 Session #2)
     │
     ▼ ...Session #1 完成...
[Gateway: ws.send({ type: "session_done", sessionId: "#1", text })]
     │
     ▼ (前端：tab #1 從 ⏳ 變 ✅，閃爍通知)
[使用者語音] "上一個"
     │
     ▼ (Gateway 攔截 → switchPrev())
[Gateway: ws.send({ type: "session_switch", sessionId: "#1", state })]
     ▼
[前端：顯示 Session #1 完整回覆]
```

**語音指令攔截邏輯：**
```
STT 結果 → 關鍵字比對
  ├─ match "新對話|開新的|new chat"    → createSession()
  ├─ match "上一個|切到上一個|previous" → switchPrev()
  ├─ match "下一個|切到下一個|next"     → switchNext()
  └─ no match → 正常送到 active session 的 chatStream
```

---

## 6. UI 設計

### 6.1 配色方案（深色科技風 — 青藍 + 紫色）

| 元素 | 顏色 | 用途 |
|------|------|------|
| 背景 | `#0a0a0f` | 深黑微藍 |
| 主色 | `#00d4ff` | 青色 (Arc Reactor 核心) |
| 輔色 | `#7b61ff` | 紫色 (次要高亮) |
| 金色 | `#e8b830` | 刻度、細節 |
| 文字 | `#e8eaf0` | 冷白色 |
| 暗文字 | `#6b7280` | 灰色 |
| 面板 | `rgba(15, 20, 40, 0.85)` | 半透明深藍 |
| 危險 | `#ff5577` | 錯誤 |
| 成功 | `#55ff99` | 確認 |

### 6.2 主畫面（HUD）

```
┌──────────────────────────────────────────────────────────┐
│  ◆ Z.E.R.O.J.A.R.V.I.S              [狀態] 🎤  [≡]    │
│                                                          │
│                                                          │
│              ┌─────────────────────┐                     │
│             ╱   Arc Reactor 動畫    ╲                    │
│            │  ● Idle: 呼吸光暈       │                   │
│            │  ● Listen: 音頻圓環     │                   │
│            │  ● Think: 旋轉弧線      │                   │
│            │  ● Speak: 線條震動+能量 │                   │
│             ╲                       ╱                    │
│              └─────────────────────┘                     │
│                    SPEAKING                              │
│                                                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ ◆ AI 回覆文字 (浮動字幕，不佔佈局)                │ │
│  └────────────────────────────────────────────────────┘ │
│                    [■ 打斷]                              │
└──────────────────────────────────────────────────────────┘
```

### 6.3 全螢幕相機模式

```
┌──────────────────────────────────────────────────────────┐
│  ● REC                                           [✕]    │
│  ┌──┐                                        ┌──┐      │
│                                                          │
│          │                      │                        │
│          │                      │                        │
│  ────────┼──────────────────────┼────────────────────   │
│          │    攝像頭畫面         │                        │
│          │    (object-fit:cover) │                        │
│  ────────┼──────────────────────┼────────────────────   │
│          │                      │                        │
│          │                      │                        │
│                                                          │
│  └──┘                                        └──┘      │
│                                                          │
│                      ╭────╮                              │
│                      │ ●● │  ← 圓形快門                 │
│                      ╰────╯                              │
└──────────────────────────────────────────────────────────┘
 - 3×3 網格線 (cyan 0.2 透明度)
 - 四角白色框 (定位標記)
 - 從右側滑入 (translateX 動畫)
 - 語音互動持續，文字隱藏
```

---

## 7. WebSocket Protocol

```typescript
// Client → Server
type ClientMessage =
  | { type: "audio"; data: ArrayBuffer }           // (JSON-wrapped) 音訊
  | { type: "audio_text"; text: string }           // 瀏覽器端 STT 結果
  | { type: "image"; data: string; query: string } // 圖片 base64 + 問題
  | { type: "confirm"; text: string }              // 確認送出文字給 LLM
  | { type: "cancel" }                             // 取消
  | { type: "interrupt" }                          // 打斷
  | { type: "new_chat" }                           // 新對話 (reset session)
  | { type: "config"; settings: Partial<Config> }  // 設定

// Server → Client
type ServerMessage =
  | { type: "stt_partial"; text: string }          // STT 中間結果
  | { type: "stt_final"; text: string }            // STT 最終結果
  | { type: "polished"; data: PolishResult }       // 整理結果
  | { type: "llm_delta"; text: string }            // LLM 串流 delta
  | { type: "llm_done"; text: string }             // LLM 完成
  | { type: "tts_audio"; data: ArrayBuffer }       // TTS 音訊 binary
  | { type: "tts_end" }                            // TTS 結束信號
  | { type: "action"; action: string; payload?: string } // ACTION 指令
  | { type: "tool_call"; name: string; args: any } // 工具呼叫通知
  | { type: "state"; state: AgentState }           // 狀態變更
  | { type: "error"; message: string }             // 錯誤
  // 多會話系統 (F9)
  | { type: "session_list"; sessions: SessionTab[] }  // 所有 session 狀態
  | { type: "session_switch"; sessionId: string; state: SessionSnapshot } // 切換 session
  | { type: "session_done"; sessionId: string; text: string }  // 背景 session 完成

// Session 型別 (F9)
interface SessionTab {
  id: string;
  title: string;               // 第一條訊息前 20 字
  status: "processing" | "done" | "error";
  active: boolean;
}

interface SessionSnapshot {
  llmText: string;             // 該 session 的 LLM 回覆
  agentState: AgentState;      // 該 session 的 UI 狀態
}

// Binary Protocol:
// Client → Server: Raw Float32Array PCM audio
// Server → Client: Raw audio bytes (edge-tts MP3)
```

---

## 8. 專案結構

```
zerojarvis/
├── opencode.json                    # OpenCode 設定 (model, provider)
├── .env                             # 環境變數 (GROQ_API_KEY)
├── docs/
│   └── DESIGN.md                    # 本文件
├── apps/
│   ├── web/                         # SvelteKit 前端 (:3000)
│   │   ├── src/
│   │   │   ├── app.css              # 全域 CSS 變數
│   │   │   ├── app.html
│   │   │   ├── lib/
│   │   │   │   ├── audio/
│   │   │   │   │   ├── mic.ts       # 麥克風 API
│   │   │   │   │   ├── vad.ts       # VAD (Silero ONNX)
│   │   │   │   │   └── player.ts    # 音訊播放器
│   │   │   │   ├── capture/
│   │   │   │   │   ├── camera.ts    # 攝像頭開啟/擷取
│   │   │   │   │   └── screen.ts    # 螢幕截圖 (Tauri/Web)
│   │   │   │   ├── components/
│   │   │   │   │   ├── HUD.svelte          # 主 HUD 介面
│   │   │   │   │   ├── Waveform.svelte     # Arc Reactor 動畫
│   │   │   │   │   ├── Subtitle.svelte     # 字幕 (玻璃面板)
│   │   │   │   │   ├── CameraPreview.svelte # 攝像頭預覽 (科幻 HUD)
│   │   │   │   │   ├── MapOverlay.svelte    # 地圖覆蓋 (科幻 HUD)
│   │   │   │   │   ├── YouTubeOverlay.svelte # YouTube 影片播放器
│   │   │   │   │   ├── SessionTabs.svelte   # 多會話底部 tab 列 (F9)
│   │   │   │   │   └── ConfirmPanel.svelte  # 確認面板
│   │   │   │   ├── stores/
│   │   │   │   │   └── agent.svelte.ts     # 全域狀態 (Svelte 5 Runes)
│   │   │   │   └── ws/
│   │   │   │       └── client.ts           # WebSocket 客戶端
│   │   │   └── routes/
│   │   │       └── +page.svelte
│   │   └── vite.config.ts           # Vite 代理設定
│   └── desktop/                     # Tauri 桌面包裝
│       └── src-tauri/
├── services/
│   └── gateway/                     # Voice Gateway (:3100)
│       └── src/
│           ├── index.ts             # Hono + WebSocket Server
│           ├── llm/
│           │   ├── client.ts        # OpenCode SDK 客戶端
│           │   └── opencode.ts      # chatStream (event SSE)
│           ├── stt/
│           │   └── whisper.ts       # Groq Whisper API
│           ├── tts/
│           │   └── edge-tts.ts      # Edge TTS
│           ├── vision/
│           │   └── processor.ts     # 圖片分析
│           ├── session/
│           │   └── manager.ts       # Session 管理
│           └── ws/
│               └── handler.ts       # WebSocket 訊息路由
└── packages/
    └── shared/                      # 共用型別 + 常數
        └── src/
            ├── types.ts             # ClientMessage, ServerMessage, etc.
            ├── constants.ts         # WS_PATH, etc.
            └── index.ts
```

---

## 9. 啟動方式

### Web 版（瀏覽器）
```bash
# Windows 一鍵啟動
.\start.bat
# 或 PowerShell
.\start.ps1

# 手動啟動
opencode serve --port 4096
pnpm --filter @zerojarvis/gateway dev   # Gateway :3100
pnpm --filter @zerojarvis/web dev       # Web UI :3000
```
開啟 https://localhost:3000

### Desktop 版（Tauri 桌面應用）
```bash
# Windows 一鍵啟動
.\start-desktop.bat
# 或 PowerShell
.\start-desktop.ps1
```
需要安裝 Rust (`rustup`)，第一次 build 約 2-3 分鐘。
Desktop 版載入 Web UI（https://localhost:3000），額外支援：
- 全域快捷鍵 `Ctrl+Space` 喚醒視窗
- 原生螢幕截圖 `[ACTION:SCREENSHOT]`（xcap，不需用戶確認）

---

## 10. 環境變數

| 變數 | 用途 | 預設 |
|------|------|------|
| `GROQ_API_KEY` | Groq Whisper STT | (必填) |
| `OPENCODE_URL` | OpenCode Server URL | `http://localhost:4096` |
| `TTS_VOICE` | TTS 語音 | `zh-TW-HsiaoChenNeural` |

---

## 11. Skill 系統

Skills 是 Markdown 文件，定義 AI 在特定情境下的行為規則：

```
.opencode/skills/
├── hardware-control/SKILL.md  # 攝像頭控制 (CAMERA_ON/OFF/CAPTURE)
├── food-map/SKILL.md          # 地圖導航 (MAP/MAP_CLOSE)
├── screenshot/SKILL.md        # 螢幕截圖 (SCREENSHOT)
├── youtube/SKILL.md           # YouTube 影片 (YOUTUBE/YOUTUBE_CLOSE)
├── session/SKILL.md           # 多會話管理 (NEW_SESSION/SESSION_PREV/NEXT)
└── listen-control/SKILL.md   # 聆聽控制 (LISTEN_PAUSE/LISTEN_RESUME)
```

新增功能的步驟：
1. 撰寫 `.opencode/skills/新功能/SKILL.md` — 定義 AI 行為
2. 在 `.opencode/agents/jarvis.md` 引用新 skill
3. 若需前端互動：在 `HUD.svelte` 的 `handleAction()` 新增 case
4. 若需新 overlay：建立 `apps/web/src/lib/components/NewOverlay.svelte`

---

## 12. 對話記憶

- OpenCode 使用 **Session** 持久化對話歷史
- 同一 Session 內所有對話保留上下文（AI 記得之前說過的話）
- 多會話管理由 Session Manager 統一控制
- **Per-Session 獨立狀態**：每個 session 擁有獨立的 UI 快照（LLM 文字、STT、覆蓋層狀態、錯誤）
- 切換 session 時覆蓋層暫停隱藏（不釋放資源），切回時恢復原狀
- 語音快捷攔截：「新對話」「上一個」「下一個」→ Gateway 直接處理
- AI 智慧攔截：複合語句由 session Skill 驅動 → `[ACTION:NEW_SESSION]` 等
- Vision 使用獨立 Session（不污染主對話，用完即刪）

---

## 13. 未來規劃

- [x] 螢幕截圖分析（Tauri 系統截圖 + Web getDisplayMedia）
- [x] YouTube 影片播放（AI websearch 找影片 ID + 嵌入播放器）
- [x] 多會話管理（平行對話 + 語音切換 + 底部 tab 列）
- [x] Gateway 串流日誌（完整 SSE 事件 + timing）
- [x] Per-Session 獨立狀態（每個 session 獨立 UI 快照，覆蓋層暫停/恢復）
- [x] 聆聽控制技能（AI 可暫停/恢復 VAD）
- [ ] Session 持久化（SQLite，重啟保留歷史）
- [ ] 語音快捷指令（自訂短語對應動作）
- [ ] 喚醒詞 "Jarvis" 支援
- [ ] 記憶系統（向量 DB 長期記憶）
- [ ] 多語言 TTS 切換
