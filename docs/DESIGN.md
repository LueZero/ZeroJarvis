# ZeroJarvis — Jarvis 語音個人助理設計文件

> **版本**：0.7.0  
> **日期**：2026-05-11  
> **代號**：ZeroJarvis (零代理 — 零打字互動)

---

## 1. 產品定位

一個以**語音為主要互動方式**的個人 AI 助理，結合：
- **語音輸入** → STT → LLM Agent → TTS 語音回覆
- **攝像頭視覺** → 全螢幕相機 + 圖像分析 → LLM 回覆（Vision 流程）
- **桌面 + Web 雙端** 通用 UI
- **OpenCode Server** 作為 LLM 統一中樞（Agent Loop + bash Tools）

---

## 2. 核心功能

### F1：語音互動（Voice Pipeline）
```
🎤 麥克風 → VAD 自動偵測 → STT 轉文字 → OpenCode Agent → TTS 語音回覆
```
- 頁面載入自動開始聆聽（無需按鈕、無喚醒詞）
- VAD (Silero) 偵測語音活動，無聲時 idle 待命
- VAD 參數針對走動式使用優化（閾值 0.5、靜音容忍 900ms、minSpeech 250ms）
- 常駐浮動麥克風按鈕 + 鍵盤 M 鍵可隨時暫停/恢復聆聽
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
| `[ACTION:NOTEBOOK:{json}]` | 彈出 NotebookLM 內容覆蓋（報告/測驗/心智圖等） |
| `[ACTION:NOTEBOOK_CLOSE]` | 關閉 NotebookLM 覆蓋 |
| `[ACTION:NEW_SESSION]` | 建立新對話（當前保留背景） |
| `[ACTION:SESSION_PREV]` | 切到上一個對話 |
| `[ACTION:SESSION_NEXT]` | 切到下一個對話 |
| `[ACTION:LISTEN_PAUSE]` | 暫停 VAD 聆聽 |
| `[ACTION:LISTEN_RESUME]` | 恢復 VAD 聆聽 |

ACTION 格式支援 payload：`[ACTION:NAME:PAYLOAD]`，向下相容無 payload 的舊格式。
JSON payload（如 NOTEBOOK）使用 brace-counting 解析，不受巢狀 `]` 影響。

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

### F6：工具擴充（CLI + bash + MCP）
- 透過 OpenCode 的 `bash` 工具直接呼叫外部 CLI
- 透過 OpenCode 的 MCP Server 連接專用自動化服務
- AI 自主判斷何時呼叫工具
- 目前已整合：`notebooklm-py`（Google NotebookLM CLI）、`food-search`（OpenTable MCP Server）

### F7：螢幕截圖分析（Screen Capture）
```
使用者: "幫我看螢幕上這個錯誤"
  → AI 回覆 + [ACTION:SCREENSHOT]
  → 前端彈出框選截圖工具（getDisplayMedia 持久串流）
  → 使用者框選區域 + 可加標註框線
  → 送出 → base64 JPEG → Gateway → Vision Agent 分析
```
- 由 Skill 驅動（`.opencode/skills/screenshot/SKILL.md`）
- 與 CAPTURE 區分：CAPTURE = 攝像頭實體拍照，SCREENSHOT = 電腦螢幕
- 第一次截圖需授權螢幕分享（僅一次），後續零彈窗
- 使用者可框選重點區域並加上標註框線幫助 AI 聚焦

### F8：餐廳訂位（OpenTable 自動化）
```
使用者: "幫我訂湯棧中山店，兩位，今晚七點"
  → AI 載入 food-map skill
  → MCP: search_opentable("湯棧 中山", partySize=2, date=今天, time=19:00)
  → CDP 連接真實 Chrome → 開 OpenTable 頁面 → 擷取可訂位時段
  → AI 選擇最佳時段 → book_opentable(slotIndex)
  → 自動填表（姓名/電話/email）→ 提交 → 處理 auth iframe
  → 需要簡訊驗證 → AI 請使用者提供驗證碼
  → 使用者: "499883" → complete_booking(code="499883")
  → 自動填入驗證碼 → 填寫詳細資料 → 完成訂位
```
- **MCP Server**（`services/gateway/src/food/mcp-server.cjs`）— JSON-RPC 2.0 over stdio
- **Playwright CDP** 連接真實 Chrome（`--remote-debugging-port=9234`）
- 保留使用者登入狀態（`--user-data-dir` 持久化 profile）
- **Auth iframe 處理**：自動偵測 `#authenticationModalIframe` → 選國碼 → 填電話 → 驗證碼 → 詳細資料
- **Overlay 清除**：`dismissOverlays()` 處理 cookie consent、privacy banner、ReactModal
- 訂位人資訊存放在 `config/booking.json`
- 由 Skill 驅動（`.opencode/skills/food-map/SKILL.md`）

**MCP 工具清單：**
| 工具 | 功能 |
|------|------|
| `search_restaurants` | Google Maps 搜尋餐廳評分、營業狀態 |
| `search_opentable` | OpenTable 查詢可訂位時段（CDP 自動化） |
| `book_opentable` | 選時段 → 填表 → 提交 → 處理 auth iframe |
| `complete_booking` | 填入簡訊驗證碼 + 詳細資料 → 完成訂位 |

**訂位三態回應：**
- `success: true` → 訂位完成
- `needsVerification + needsCode` → 等使用者提供簡訊驗證碼
- `waitingForUserSubmit` → 頁面已準備好，等使用者手動確認

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
- **覆蓋層暫停/恢復**：切走時攝像頭/地圖暫停隱藏（不釋放資源），切回時恢復
- **全 Skill 驅動**：所有 session 指令由 AI 透過 session 技能判斷並輸出 ACTION 標記
- 背景 session 完成時 tab 閃爍通知
- Vision 仍使用獨立臨時會話（不受多會話系統影響）
- 由 Skill 驅動（`.opencode/skills/session/SKILL.md`）

### F11：聆聽控制（Listen Control）
```
使用者: "安靜一下" → AI 回覆 + [ACTION:LISTEN_PAUSE] → VAD 停止
使用者: 按 M 鍵 / 點擊浮動麥克風按鈕 → VAD 重啟
```
- **統一控制入口 `toggleListening()`**：所有聆聽開關路徑共用同一函式
- 觸發方式：
  - 右下角常駐浮動麥克風按鈕（FAB，z-index 9999，覆蓋所有 overlay）
  - 鍵盤快捷鍵 `M`（輸入框聚焦時不觸發）
  - 選單「停止聆聽 / 開始聆聽」
  - AI Skill `[ACTION:LISTEN_PAUSE]` / `[ACTION:LISTEN_RESUME]`
- 暫停時：FAB 顯示紅色斜線麥克風、無脈動光效、header 隱藏綠色 mic-dot
- 開啟時：FAB 顯示青色麥克風 + 脈動光暈
- `submitUserSpeechOnPause: true`：暫停瞬間自動送出已錄音訊（不丟失語音）
- 手機版 FAB 縮小至 48px，上移避開底部 UI
- 觸發詞：「安靜」「不要聽了」「暫停聆聽」
- 由 Skill 驅動（`.opencode/skills/listen-control/SKILL.md`）

**麥克風暫停（禁止聆聽）機制：**
- 暫停狀態由 `listening` + `listenPaused` 兩個旗標共同管理
- 暫停時 `stopVAD()` 立即停止語音活動偵測，不再送出任何音訊
- 暫停期間 AI 仍可正常回覆（TTS 播放不受影響）
- 恢復聆聽時自動呼叫 `ensureAudioContext()` → `startVAD()`
- AI 正忙（thinking/speaking）時恢復聆聽：設定旗標排隊，等 AI 回到 idle 後自動啟動 VAD
- **多會話切換時的行為**：
  - 切換 session 前先 `stopAudio()` 停止當前音訊播放
  - 切換後若新 session 狀態為 idle 且 mic 啟用 → 自動重啟 VAD
  - 切換後若新 session 為 thinking/speaking（歷史快照） → 強制重設為 idle（因音訊已失效）
  - 麥克風暫停狀態為全域共享（不隨 session 切換改變）

### F12：NotebookLM 整合（notebooklm-py CLI）
```
使用者: "幫我查筆記本裡關於 RAG 的內容"
  → AI 載入 notebooklm skill
  → bash: notebooklm ask "what is RAG"
  → Google RPC API → Gemini 2.5 帶引用回覆（3-10 秒）
  → AI 轉化為中文口語回覆
```
- 使用 `notebooklm-py` CLI（Python，透過 Google 內部 RPC API 直接呼叫）
- 無需 Chrome 瀏覽器，純 HTTP 請求，速度快且穩定
- 支援完整功能：筆記本 CRUD、問答、來源管理（URL/文字/檔案/AI 研究）、
  內容產生（音訊/影片/簡報/測驗/學習卡/心智圖/報告/資訊圖表/資料表格）、
  下載、筆記、分享、語言設定
- 由 Skill 驅動（`.opencode/skills/notebooklm/SKILL.md`）
- 首次需執行 `notebooklm login` 開瀏覽器登入 Google（一次性）
- 認證後 Cookie 保存在 `~/.notebooklm/storage_state.json`，後續純 API 操作

**NotebookLM Overlay（前端視覺呈現）：**
```
使用者: "幫我出個測驗"
  → AI: notebooklm generate quiz → download quiz --format json
  → 取得結構化資料
  → [ACTION:NOTEBOOK:{"type":"quiz","title":"...","data":"[...]"}]
  → 前端 NotebookOverlay 滑入顯示互動測驗卡片
```
支援 6 種內容類型渲染：
| type | 資料格式 | 渲染方式 |
|------|----------|----------|
| `markdown` | Markdown 文字 | HTML 渲染（報告、學習指南） |
| `mindmap` | JSON 樹結構 | 可展開節點（`<details>`） |
| `quiz` | JSON 題目陣列 | 多選卡片 + 互動答題 |
| `flashcards` | JSON 正反面 | 3D 翻轉動畫卡片 |
| `media` | 檔案路徑 | 下載按鈕 + 類型標籤 |
| `table` | CSV 字串 | HTML 表格渲染 |

### F13：背景任務系統（Background Task System）
```
使用者: "一分鐘後提醒我開會"
  → AI 查時間 → 計算排程 → 回覆 + [SCHEDULE:2026-05-11T11:45:00:提醒開會]
  → Gateway 解析排程 → TaskQueue 建立任務 → Scheduler 每 5 秒檢查
  → 時間到 → Worker 建立獨立 OpenCode session → 執行任務
  → 完成 → TTS 語音播報結果

使用者: "幫我比較三間日式餐廳"
  → AI 判斷為長任務 → 回覆 + [ASYNC_TASK:搜尋並比較三間日式餐廳]
  → Gateway 立即派發 Worker → 前台不卡住
  → 完成後語音通知使用者
```

**三種任務標記：**
| 標記 | 格式 | 觸發時機 |
|------|------|----------|
| `[ASYNC_TASK:描述]` | 即時背景任務 | 耗時操作（搜尋比較、訂位、多步驟工具鏈） |
| `[SCHEDULE:ISO時間:描述]` | 定時排程 | 「X 分鐘後」「明天早上」等時間指令 |
| `[SCHEDULE_REPEAT:頻率:HH:mm:描述]` | 重複排程 | 「每秒」「每分鐘」「每天」等週期指令（頻率：`Ns`/`Nm`/`Nh`/`daily`/`weekly`/`monthly`/`yearly`） |

**後端架構（4 個模組）：**

| 模組 | 檔案 | 職責 |
|------|------|------|
| **TaskQueue** | `task/queue.ts` | 記憶體任務儲存、生命週期管理、刪除、完成通知 |
| **Scheduler** | `task/scheduler.ts` | 每 5 秒檢查到期任務、持久化到 `config/schedules.json` |
| **Worker** | `task/worker.ts` | 建立 OpenCode worker session 執行任務（最多 3 並行） |
| **EventHub** | `task/event-hub.ts` | 單一 SSE 連線集中派發所有 session 事件 |

**任務生命週期：**
```
pending → running → done / error
              ↑
      Worker 建立 session
      → promptAsync(task-worker agent)
      → 監聽 SSE events
      → 收集 assistant 回覆
      → session.idle → 完成
```

**前端 Task Panel（科幻風格下拉面板）：**
- Header 右側 badge 按鈕顯示執行中任務數
- 展開面板列出所有任務：spinner（執行中）、✓（完成）、✕（失敗）
- 即時經過時間計時器（每秒更新）- 每個任務獨立刪除按鈕（hover 顯示，點擊透過 WS `task_delete` 刪除後端任務 + 排程）- 任務完成時自動暫停 VAD → 播報 TTS 結果 → 恢復聆聽
- RWD：≥768px 400px 寬、≤600px 全寬

**配置值：**
| 參數 | 值 | 說明 |
|------|------|------|
| `CHECK_INTERVAL_MS` | 5,000ms | 排程檢查頻率 |
| `MAX_CONCURRENT_WORKERS` | 3 | 最大並行 worker 數 |
| `WORKER_TIMEOUT_MS` | 180,000ms | 單一任務超時（3 分鐘） |
| 持久化檔案 | `config/schedules.json` | 重啟恢復排程（自動產生，git-ignored） |

**重複排程支援頻率：**
| 格式 | 說明 | 範例 |
|------|------|------|
| `Ns` | 每 N 秒 | `5s`、`30s` |
| `Nm` | 每 N 分鐘 | `1m`、`10m` |
| `Nh` | 每 N 小時 | `1h`、`2h` |
| `daily` | 每天固定時間 | HH:mm 指定 |
| `weekly` | 每週固定時間 | HH:mm 指定 |
| `monthly` | 每月固定時間 | HH:mm 指定 |
| `yearly` | 每年固定時間 | HH:mm 指定 |

### F14：記憶系統（Memory System）
```
使用者: 「我不吃辣」
  → AI 回覆 + [MEMORY:no-spicy:user:使用者不吃辣]
  → Gateway parseMemory() 解析標記
  → memory.saveMemory() → files/memory/no-spicy.md（YAML frontmatter MD）

下次背景任務（搜尋餐廳）：
  → Worker buildWorkerPrompt()
  → memory.loadAll() → 注入 [user] no-spicy: 不吃辣
  → Worker 自動排除辣味餐廳
```

**記憶類型：**
| 類型 | 說明 | 範例 |
|------|------|------|
| `user` | 使用者偏好 | 不吃辣、喜歡簡短回答 |
| `project` | 環境/專案事實 | 用 Mac、辦公室在信義區 |
| `task-history` | 過往任務結果摘要 | 任務「比較三間餐廳」完成 |
| `reference` | 外部參考資訊 | 常去的餐廳列表 |

**儲存格式（YAML frontmatter Markdown）：**
```markdown
---
name: no-spicy
type: user
description: 飲食偏好
created: 2026-05-11T14:30:00Z
updated: 2026-05-11T14:30:00Z
---
使用者不吃辣
```

**記憶標記格式：**
| 標記 | 格式 | 觸發時機 |
|------|------|----------|
| `[MEMORY:名稱:類型:內容]` | 主對話 + Worker 回覆 | AI 發現值得記住的資訊 |

**後端架構：**

| 模組 | 檔案 | 職責 |
|------|------|------|
| **Memory Store** | `task/memory.ts` | 記憶 CRUD + 索引管理 + Prompt 摘要產生 |
| **Worker 注入** | `task/worker.ts` | `buildWorkerPrompt()` 載入記憶 + 父 session 上下文 |
| **任務持久化** | `task/queue.ts` | `complete()` 雙寫 JSON + 記憶摘要 |
| **標記解析** | `llm/opencode.ts` | `parseMemory()` 解析 `[MEMORY:...]` |

**Worker 記憶注入流程：**
```
Worker 啟動 → buildWorkerPrompt()
  → memory.loadAll() 載入所有持久記憶
  → client.session.messages(parentSessionId) 取最近 3 輪對話
  → 組合成含「記憶 + 對話上下文 + 任務」的完整 prompt
  → prompt 上限 2000 字元（超過截斷最舊記憶）
```

**任務結果持久化：**
```
任務完成 → queue.complete()
  → files/tasks/{taskId}.json（完整 metadata + result）
  → files/memory/task-{short-id}.md（結果摘要作為記憶）
  → Gateway 啟動時掃描 files/tasks/ 載入最近 20 筆
```

**配置值：**
| 參數 | 值 | 說明 |
|------|------|------|
| 記憶儲存路徑 | `files/memory/` | YAML frontmatter MD 檔案 |
| 任務持久化路徑 | `files/tasks/` | JSON 完整紀錄 |
| 索引檔 | `files/memory/MEMORY.md` | 自動產生 |
| Worker prompt 上限 | 2,000 字元 | 超過截斷 |
| 歷史載入筆數 | 20 筆 | 啟動時載入 |
| 歷史過期時間 | 30 天 | 超過不載入 |

### F10：Gateway 串流日誌（Streaming Logs）
```
[14:32:05.123] [EVENT] message.part.updated — "好的，讓我幫你查一下..."
[14:32:05.456] [TOOL:CALL] websearch("附近日式料理")
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
│  │ Mic/VAD  │ │ Camera   │ │ HUD/Viz  │ │  TaskPanel   │ │
│  │ (Silero) │ │(MediaAPI)│ │ (Canvas) │ │  (即時狀態)  │ │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └──────────────┘ │
└───────┼─────────────┼─────────────────────────────────────┘
        │ ws:binary   │ ws:json(image)
        │ (Float32)   │ (base64)
┌───────▼─────────────▼─────────────────────────────────────┐
│           Voice Gateway (Bun + Hono)  :3100                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   STT    │ │   TTS    │ │  Vision  │ │  Session Mgr │ │
│  │(Groq API)│ │(edge-tts)│ │(OpenCode)│ │ (OpenCode)   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Background Task System                              │ │
│  │  EventHub (SSE) │ TaskQueue │ Scheduler │ Worker     │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Memory System                                       │ │
│  │  Memory Store (files/memory/) │ Task Persist (files/tasks/) │
│  └──────────────────────────────────────────────────────┘ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
└───────┼────────────┼────────────┼───────────────┼─────────┘
        │            │            │               │
┌───────▼────────────▼────────────▼───────────────▼─────────┐
│           OpenCode Server (LLM Hub)  :4096                 │
│  ┌────────────────┐ ┌────────────┐ ┌───────────────────┐  │
│  │   Providers    │ │   Agent    │ │   bash + CLI      │  │
│  │ github-copilot │ │   Loop     │ │ (notebooklm-py    │  │
│  │ claude-sonnet-4│ │            │ │  websearch, etc)  │  │
│  └────────────────┘ └────────────┘ └───────────────────┘  │
│                         │                                  │
│                    ┌────▼──────────────────────────────┐   │
│                    │  MCP: food-search (stdio)         │   │
│                    │  Playwright CDP → Chrome :9234    │   │
│                    │  (OpenTable 自動訂位)              │   │
│                    └───────────────────────────────────┘   │
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
| **工具系統** | OpenCode bash + CLI + MCP | AI 直接呼叫系統指令 / MCP Server |
| **瀏覽器自動化** | Playwright CDP | 連接真實 Chrome，保留登入狀態 |
| **NotebookLM** | notebooklm-py (Python CLI) | Google RPC API，非 Chrome 自動化 |
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
     │ 1. 儲存圖片到 files/captures/
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

### 5.5 背景任務流程（F13）

```
[使用者語音] "30 秒後告訴我現在幾點"
     │
     ▼ (STT → LLM → bash Get-Date → 計算時間)
[LLM 回覆] "好的，30 秒後告訴您。[SCHEDULE:2026-05-11T11:42:52:告訴使用者現在幾點]"
     │
     ▼ (Gateway: parseSchedule())
[TaskQueue: createTask(scheduled)] → [Scheduler: 每 5 秒檢查]
     │                                     │
     ▼ (前端)                               ▼ (時間到)
[task_created → TaskPanel 顯示]      [Worker: execute(task)]
                                          │
                                          ▼
                                    [OpenCode: session.create()]
                                    [promptAsync(task-worker agent)]
                                          │
                                          ▼ (EventHub SSE 監聽)
                                    [收集 assistant 回覆文字]
                                    [session.idle → finishWorker()]
                                          │
                                          ▼
                                    [TaskQueue: complete(taskId, result)]
                                    [onDone → Gateway 通知前端]
                                          │
                                    ┌─────┴─────┐
                                    ▼           ▼
                              [task_done]   [TTS 語音播報]
                              [TaskPanel    [前端暫停 VAD
                               更新狀態]     播完恢復聆聯]
```

### 5.6 記憶系統流程（F14）

```
[使用者語音] "我住在高雄市"
     │
     ▼ (STT → chatStream → LLM)
[Jarvis 回覆] "好的，我記住了。[MEMORY:user-location:project:使用者住在高雄市]"
     │
     ▼ (handler.ts onDone)
[parseMemory()] → 解析 [MEMORY:...] 標記
     │
     ▼
[memory.saveMemory()] → files/memory/user-location.md
     │
     ▼ (下次有背景任務時)
[Worker buildWorkerPrompt()]
     │ 1. memory.loadAll() 載入所有記憶
     │ 2. client.session.messages(parentSession) 取最近 3 輪
     ▼ 3. 組合成含記憶+上下文的 prompt
[Worker 知道使用者住，可以搜尋附近餐廳]

--- 任務完成時的記憶持久化 ---

[Worker 完成] → finishWorker()
     │
     ├─ parseMemory(resultText) → 儲存 Worker 產出的新記憶
     ├─ queue.complete() → files/tasks/{id}.json（完整紀錄）
     └─ memory.saveMemory("task-xxx") → files/memory/task-xxx.md（結果摘要）
```

---

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
  | { type: "task_delete"; taskId: string }         // 刪除任務

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
  // 背景任務系統 (F13)
  | { type: "task_created"; taskId: string; description: string }  // 任務已建立
  | { type: "task_done"; taskId: string; text: string }            // 任務完成（附結果）
  | { type: "task_error"; taskId: string; error: string }          // 任務失敗
  | { type: "task_deleted"; taskId: string }                       // 任務已刪除

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
│   │   │   │   │   ├── NotebookOverlay.svelte # NotebookLM 內容顯示 (6 種渲染)
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
│           ├── logger.ts            # 結構化日誌
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
│           ├── task/                 # 背景任務系統 (F13) + 記憶系統 (F14)
│           │   ├── event-hub.ts     # 全域 SSE 事件派發
│           │   ├── memory.ts        # 記憶 CRUD + 索引 + prompt 摘要
│           │   ├── queue.ts         # 任務佇列 + 生命週期 + 持久化
│           │   ├── scheduler.ts     # 定時排程（5 秒檢查）
│           │   └── worker.ts        # OpenCode worker session 執行（含記憶注入）
│           ├── ws/
│           │   └── handler.ts       # WebSocket 訊息路由
│           └── food/
│               └── mcp-server.cjs   # OpenTable MCP Server (CDP)
├── config/
│   ├── booking.json                 # 訂位人資訊（姓名/電話/email）
│   └── schedules.json               # 排程持久化（自動產生，git-ignored）
├── files/                           # 產生的檔案（git-ignored 內容）
│   ├── captures/                    # 攝像頭截圖 (.jpg)
│   ├── memory/                      # 持久記憶（YAML frontmatter MD）
│   │   ├── MEMORY.md               # 自動產生索引
│   │   └── *.md                     # 個別記憶檔案
│   ├── tasks/                       # 任務結果持久化（JSON）
│   │   └── {taskId}.json            # 完整任務紀錄
│   └── notebooklm/                  # NotebookLM CLI 下載
│       ├── report-*.md
│       ├── quiz-*.json
│       ├── mindmap-*.json
│       ├── podcast-*.mp4
│       └── ...
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

Skills 是 Markdown 文件，定義 AI 在特定情境下的行為規則。
分為**自訂技能**（ZeroJarvis 專屬）與**社群技能**（來自 [skills.sh](https://skills.sh/) 生態系），分別存放在不同路徑：

```
.opencode/skills/              ← 自訂技能（ZeroJarvis 專屬）
├── hardware-control/SKILL.md  # 攝像頭控制 (CAMERA_ON/OFF/CAPTURE)
├── food-map/SKILL.md          # 地圖導航 + 餐廳訂位 (MAP/MAP_CLOSE + MCP 訂位)
├── screenshot/SKILL.md        # 螢幕截圖 (SCREENSHOT)
├── session/SKILL.md           # 多會話管理 (NEW_SESSION/SESSION_PREV/NEXT)
├── listen-control/SKILL.md   # 聆聽控制 (LISTEN_PAUSE/LISTEN_RESUME)
└── notebooklm/SKILL.md       # NotebookLM 完整操作 (NOTEBOOK/NOTEBOOK_CLOSE)
                               #   問答、來源、產生、下載、筆記、分享
                               #   + 6 種 overlay 渲染（報告/心智圖/測驗/學習卡/媒體/表格）

.agents/skills/                ← 社群技能（skills.sh 安裝）
├── find-skills/SKILL.md       # 自動搜尋並安裝新技能 (vercel-labs/skills)
├── skill-creator/SKILL.md     # 建立/改善自訂 SKILL.md (anthropics/skills)
├── mcp-builder/SKILL.md       # 建立高品質 MCP Server (anthropics/skills)
├── claude-api/SKILL.md        # Claude API/SDK 最佳實踐 (anthropics/skills)
├── frontend-design/SKILL.md   # 高品質前端 UI 設計 (anthropics/skills)
├── web-design-guidelines/SKILL.md # UI/UX 最佳實踐審查 (vercel-labs/agent-skills)
├── pdf/SKILL.md               # PDF 讀寫處理 (anthropics/skills)
├── docx/SKILL.md              # Word 文件處理 (anthropics/skills)
└── xlsx/SKILL.md              # Excel 試算表處理 (anthropics/skills)
```

OpenCode 會自動從 `.opencode/skills/` 和 `.agents/skills/` 兩個路徑發現技能。

### 社群技能管理（skills.sh CLI）

透過 [skills.sh](https://skills.sh/) 開源生態系安裝社群技能（自動安裝到 `.agents/skills/`）：

```bash
# 安裝技能
npx skills add <owner/repo> --skill <name> -a opencode -y

# 列出可用技能
npx skills add <owner/repo> --list -a opencode

# 列出已安裝 / 搜尋 / 更新 / 移除
npx skills list
npx skills find <keyword>
npx skills update
npx skills remove <name>
```

### 新增功能的步驟

1. 撰寫 `.opencode/skills/新功能/SKILL.md` — 定義 AI 行為
2. 在 `.opencode/agents/jarvis.md` 引用新 skill
3. 若需前端互動：在 `HUD.svelte` 的 `handleAction()` 新增 case
4. 若需新 overlay：建立 `apps/web/src/lib/components/NewOverlay.svelte`

---

## 12. 對話記憶與持久記憶系統

### 12.1 Session 記憶（單次對話）
- OpenCode 使用 **Session** 持久化對話歷史
- 同一 Session 內所有對話保留上下文（AI 記得之前說過的話）
- 多會話管理由 Session Manager 統一控制
- **Per-Session 獨立狀態**：每個 session 擁有獨立的 UI 快照（LLM 文字、STT、覆蓋層狀態、錯誤）
- 切換 session 時覆蓋層暫停隱藏（不釋放資源），切回時恢復原狀
- 語音快捷攚截：「新對話」「上一個」「下一個」→ Gateway 直接處理
- AI 智慧攚截：複合語句由 session Skill 驅動 → `[ACTION:NEW_SESSION]` 等
- Vision 使用獨立 Session（不污染主對話，用完即刪）

### 12.2 持久記憶系統（F14）
- **跨 Session 記憶**：使用者偏好、環境事實、歷史任務結果等持久化到磁碟
- **儲存格式**：YAML frontmatter Markdown 檔案，存在 `files/memory/`
- **標記機制**：AI 在回覆中嵌入 `[MEMORY:名稱:類型:內容]` 標記，Gateway 自動解析並儲存
- **Worker 注入**：背景任務啟動時自動載入所有記憶 + 父 session 最近 3 輪對話
- **任務持久化**：任務完成時自動雙寫 JSON 紀錄 + 記憶摘要
- **索引管理**：`files/memory/MEMORY.md` 自動產生，快速概覽所有記憶
- **啟動恢復**：Gateway 啟動時掃描 `files/tasks/` 載入最近 20 筆歷史任務

---

## 13. 未來規劃

- [x] 螢幕截圖分析（前端框選截圖 + 標註，送 Vision 分析）
- [x] 多會話管理（平行對話 + 語音切換 + 底部 tab 列）
- [x] Gateway 串流日誌（完整 SSE 事件 + timing）
- [x] Per-Session 獨立狀態（每個 session 獨立 UI 快照，覆蓋層暫停/恢復）
- [x] 聆聽控制技能（AI 可暫停/恢復 VAD）
- [x] NotebookLM 整合（notebooklm-py CLI，問答 + 來源管理 + 內容產生 + 前端 Overlay 顯示）
- [x] OpenTable 自動訂位（MCP Server + Playwright CDP + auth iframe 驗證流程）
- [x] 社群技能整合（skills.sh 生態系 — find-skills / skill-creator / mcp-builder / claude-api 等 9 個技能）
- [x] 背景任務系統（ASYNC_TASK 即時背景 + SCHEDULE 定時排程 + SCHEDULE_REPEAT 重複排程 + Task Panel UI）
- [x] 記憶系統（持久化檔案記憶 + Worker 記憶注入 + 任務結果持久化 + AI 主動寫入記憶）
- [ ] NotebookLM 線上播放（音視訊 serve + `<audio>`/`<video>` 播放器）
- [ ] Session 持久化（SQLite，重啟保留歷史）
- [ ] 語音快捷指令（自訂短語對應動作）
- [ ] 喚醒詞 "Jarvis" 支援
- [ ] 記憶系統進階（向量 DB 語意搜尋、前端記憶管理 UI）
- [ ] 多語言 TTS 切換
