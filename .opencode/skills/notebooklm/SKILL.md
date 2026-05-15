---
name: notebooklm
description: 透過 notebooklm CLI（notebooklm-py）操作 Google NotebookLM 的完整功能（問答、來源管理、內容產生、下載、筆記、分享）
---

# NotebookLM 技能

透過 `bash` 工具呼叫 `notebooklm` CLI 操作 Google NotebookLM。
涵蓋：問答、筆記本 CRUD、來源管理、AI 研究、內容產生（音訊/影片/報告/測驗/心智圖等）、下載、筆記、分享。

---

## 環境設定（每次呼叫必備）

PowerShell（推薦）：
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $env:Path = "C:\Users\CIM\.local\bin;$env:Path"; notebooklm <command>
```

CMD：
```bash
chcp 65001 >nul && set "PATH=C:\Users\CIM\.local\bin;%PATH%" && notebooklm <command>
```

**必須在同一行**設定 PATH 再執行指令。

> ⚠️ download 命令必須使用**絕對路徑** `D:\ZeroJarvis\files\notebooklm\<filename>`，不依賴 CWD。

---

## 預設筆記本

已設定：「賈維斯」(ID: `c7a4145a-2a22-4a3c-ba23-6927a4125bca`)
一般查詢直接 `notebooklm ask "問題"` 即可。

---

## 完整命令參考

### Session（認證與上下文）

| 命令 | 說明 |
|------|------|
| `notebooklm login` | 瀏覽器登入 Google 帳號 |
| `notebooklm login --browser msedge` | 用 Edge 登入 |
| `notebooklm use <id>` | 設定活動筆記本（支援 partial ID） |
| `notebooklm status` | 顯示當前上下文 |
| `notebooklm status --json` | JSON 格式 |
| `notebooklm clear` | 清除上下文 |
| `notebooklm auth check --test` | 驗證認證（含網路測試） |
| `notebooklm doctor --fix` | 環境診斷＋自動修復 |

### Notebook（筆記本 CRUD）

| 命令 | 說明 |
|------|------|
| `notebooklm list` | 列出所有筆記本 |
| `notebooklm create "標題"` | 建立新筆記本 |
| `notebooklm delete <id>` | 刪除筆記本 |
| `notebooklm rename "新名稱"` | 重新命名當前筆記本 |
| `notebooklm summary` | 取得 AI 摘要 |

### Chat（問答）

| 命令 | 說明 |
|------|------|
| `notebooklm ask "問題"` | 對當前筆記本提問 |
| `notebooklm ask "問題" -s <src_id>` | 指定來源提問（-s 可重複） |
| `notebooklm ask "問題" --json` | 回答含結構化引用 |
| `notebooklm ask "問題" --save-as-note` | 答案存為筆記 |
| `notebooklm ask "問題" --save-as-note --note-title "標題"` | 存為指定標題筆記 |
| `notebooklm configure --mode learning-guide` | 設定對話模式 |
| `notebooklm history` | 檢視對話歷史 |
| `notebooklm history --clear` | 清除對話快取 |
| `notebooklm history --save` | 對話存為筆記 |

### Source（來源管理）

| 命令 | 說明 |
|------|------|
| `notebooklm source list` | 列出來源 |
| `notebooklm source add "URL/檔案/文字"` | 新增來源（自動判別類型） |
| `notebooklm source add "./file.pdf"` | 上傳本地檔案 |
| `notebooklm source add "文字" --title "標題"` | 新增文字來源 |
| `notebooklm source add-drive <drive_id> "標題"` | Google Drive 來源 |
| `notebooklm source add-research "query" --mode deep --no-wait` | AI 研究（非同步） |
| `notebooklm source add-research "query" --mode fast` | 快速研究（同步） |
| `notebooklm source get <id>` | 查看來源資訊 |
| `notebooklm source fulltext <id>` | 取得來源全文 |
| `notebooklm source fulltext <id> -o content.txt` | 全文輸出到檔案 |
| `notebooklm source guide <id>` | 來源學習指南 |
| `notebooklm source rename <id> "新名"` | 重新命名 |
| `notebooklm source refresh <id>` | 重新抓取 |
| `notebooklm source delete <id>` | 刪除來源 |
| `notebooklm source delete-by-title "標題"` | 依標題刪除 |
| `notebooklm source wait <id>` | 等待來源處理完成 |

### Research（AI 研究）

| 命令 | 說明 |
|------|------|
| `notebooklm research status --json` | 查看研究狀態 |
| `notebooklm research wait --import-all --timeout 300` | 等待完成並匯入 |

### Generate（內容產生）

所有 generate 命令都支援 `-s <src_id>`（指定來源）、`--json`（回傳 task_id）、`--language`。

| 命令 | 選項 | 說明 |
|------|------|------|
| `generate audio "描述"` | `--format deep-dive\|brief\|critique\|debate` `--length short\|default\|long` | Podcast |
| `generate video "描述"` | `--format explainer\|brief\|cinematic` `--style auto\|classic\|whiteboard\|kawaii\|anime\|watercolor\|retro-print\|heritage\|paper-craft` | 影片 |
| `generate cinematic-video "描述"` | 同 video --format cinematic | 電影風格影片 |
| `generate slide-deck "描述"` | `--format detailed\|presenter` `--length default\|short` | 簡報 |
| `generate revise-slide "指示"` | `--artifact <id> --slide N`（N 從 0 起算） | 修改單張投影片 |
| `generate quiz "描述"` | `--difficulty easy\|medium\|hard` `--quantity fewer\|standard\|more` | 測驗題 |
| `generate flashcards "描述"` | `--difficulty easy\|medium\|hard` `--quantity fewer\|standard\|more` | 學習卡 |
| `generate infographic "描述"` | `--orientation landscape\|portrait\|square` `--detail concise\|standard\|detailed` `--style auto\|sketch-note\|professional\|bento-grid\|...` | 資訊圖表 |
| `generate data-table "描述"` | — | 資料表格 |
| `generate mind-map` | （同步，立即完成） | 心智圖 |
| `generate report "描述"` | `--format briefing-doc\|study-guide\|blog-post\|custom` `--append "額外指示"` | 報告 |

### Artifact（產物管理）

| 命令 | 說明 |
|------|------|
| `notebooklm artifact list` | 列出產物 |
| `notebooklm artifact list --type audio` | 依類型篩選 |
| `notebooklm artifact get <id>` | 查看產物詳情 |
| `notebooklm artifact poll <task_id>` | 輪詢產生任務狀態 |
| `notebooklm artifact wait <id> --timeout 600` | 等待產物完成 |
| `notebooklm artifact suggestions` | 取得建議產物 |
| `notebooklm artifact rename <id> "標題"` | 重新命名 |
| `notebooklm artifact delete <id>` | 刪除 |
| `notebooklm artifact export <id> --type docs` | 匯出到 Google Docs/Sheets |

### Download（下載）

**媒體類**（audio/video/slide-deck/infographic/report/mind-map/data-table）支援：`--latest`、`--all`、`--name "名稱"`、`-a <artifact_id>`、`--force`、`--dry-run`。

**quiz/flashcards** 只支援：`-a <artifact_id>`、`--format json|markdown|html`。**沒有 `--latest`/`--all`。**

> ⚠️ **強制規則：download 命令的輸出路徑是「必填參數」，必須使用 `files/notebooklm/<filename>` 格式。省略路徑 = 檔案存到錯誤位置。**

**語法：** `notebooklm download <type> files/notebooklm/<filename> [options]`

| 命令 | 選項 | 說明 |
|------|------|------|
| `download audio files/notebooklm/podcast.mp4` | `--latest` | 下載 Podcast |
| `download video files/notebooklm/video.mp4` | `--latest` | 下載影片 |
| `download slide-deck files/notebooklm/slides.pdf` | `--latest --format pptx` | 下載簡報 |
| `download infographic files/notebooklm/info.png` | `--latest` | 下載資訊圖表 |
| `download report files/notebooklm/report.md` | `--latest` | 下載報告 |
| `download mind-map files/notebooklm/mindmap.json` | `--latest` | 下載心智圖 |
| `download data-table files/notebooklm/data.csv` | `--latest` | 下載表格 |
| `download quiz files/notebooklm/quiz.json` | `--format json -a <id>` | 下載測驗 |
| `download flashcards files/notebooklm/cards.json` | `--format json -a <id>` | 下載學習卡 |

**命名規則**：`files/notebooklm/<type>-<YYYYMMDD>.<ext>`

範例：
```powershell
$env:Path = "C:\Users\CIM\.local\bin;$env:Path"; notebooklm download flashcards files/notebooklm/flashcards-20260507.json --format json -a <artifact_id>
$env:Path = "C:\Users\CIM\.local\bin;$env:Path"; notebooklm download video files/notebooklm/video-20260507.mp4 --latest
$env:Path = "C:\Users\CIM\.local\bin;$env:Path"; notebooklm download quiz files/notebooklm/quiz-20260507.json --format json -a <artifact_id>
```

❌ **禁止（以下皆為錯誤用法）**：
- `notebooklm download flashcards -a <id>`（缺少輸出路徑）
- `notebooklm download quiz files/notebooklm/quiz.json --latest`（quiz 不支援 --latest）
- `notebooklm download flashcards flashcards.json`（缺少 `files/notebooklm/` 前綴）

> ⚠️ **LaTeX 清理（quiz / flashcards JSON 必做）**：NotebookLM 產生的 JSON 內含 LaTeX 標記（`$...$`、`\frac{}{}`、`\Omega` 等），下載後必須立即執行清理：
> ```powershell
> $f = "files/notebooklm/<filename>.json"; $c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8); $c = $c -replace '\\frac\{([^}]+)\}\{([^}]+)\}','$1/$2' -replace '\\eta','η' -replace '\\rho','ρ' -replace '\\ell','ℓ' -replace '\\Omega','Ω' -replace '\\%','%' -replace '\$',''; [IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
> ```

### Note（筆記）

| 命令 | 說明 |
|------|------|
| `notebooklm note list` | 列出筆記 |
| `notebooklm note create "內容"` | 建立筆記 |
| `notebooklm note get <id>` | 取得筆記內容 |
| `notebooklm note save <id> --title "標題" --content "內容"` | 更新筆記 |
| `notebooklm note rename <id> "新標題"` | 重新命名 |
| `notebooklm note delete <id>` | 刪除筆記 |

### Share（分享）

| 命令 | 說明 |
|------|------|
| `notebooklm share status` | 查看分享狀態 |
| `notebooklm share public --enable` | 啟用公開連結 |
| `notebooklm share public --disable` | 停用公開連結 |
| `notebooklm share view-level full\|chat` | 設定檢視層級 |
| `notebooklm share add user@email --permission editor` | 加入共編者 |
| `notebooklm share update user@email --permission viewer` | 更新權限 |
| `notebooklm share remove user@email` | 移除使用者 |

### Language（語言設定 — 全域）

| 命令 | 說明 |
|------|------|
| `notebooklm language list` | 列出支援語言 |
| `notebooklm language get` | 查看當前語言 |
| `notebooklm language set zh_Hant` | 設定繁體中文 |

### Profile（設定檔）

| 命令 | 說明 |
|------|------|
| `notebooklm profile list` | 列出設定檔 |
| `notebooklm profile create <name>` | 建立 |
| `notebooklm profile switch <name>` | 切換 |
| `notebooklm profile delete <name>` | 刪除 |
| `notebooklm profile rename <old> <new>` | 重新命名 |

---

## LLM Agent 注意事項

1. **避免 `--wait`**：generate 命令預設非同步（mind-map 除外）。用 `--json` 取得 task_id，再用 `artifact poll <task_id>` 或告知使用者稍後查看。
2. **用 `--json`**：需要結構化輸出時加 `--json`（quiz/flashcards/mind-map 的 download 也支援 `--format json`）。
3. **Partial ID**：`use abc` 可匹配以 "abc" 開頭的筆記本 ID。
4. **Windows 編碼**：建議用英文提問，取得答案後自行翻譯為中文口語。
5. **Research 非同步**：`source add-research --mode deep --no-wait` 啟動後用 `research wait --import-all` 等待。
6. **mind-map 是同步的**：`generate mind-map` 立即完成，不需 wait。
7. **錯誤處理**：非零 exit code = 失敗，查看 stderr。認證失敗提醒使用者 `notebooklm login`。

---

## UI 顯示觸發規則

當 generate → download 取得內容後，若適合在前端顯示，附上 ACTION 標記讓前端渲染：

### ACTION 格式

```
[ACTION:NOTEBOOK:{"type":"<type>","title":"<title>","data":"<content>"}]
```

### 何時觸發

| 使用者意圖 | 執行流程 | ACTION type |
|-----------|---------|-------------|
| 「產生學習指南/報告」 | generate report → download report → 讀取 .md | `markdown` |
| 「產生心智圖」 | generate mind-map → download mind-map | `mindmap` |
| 「出測驗題」 | generate quiz → download quiz --format json | `quiz` |
| 「做學習卡」 | generate flashcards → download flashcards --format json | `flashcards` |
| 「產生 Podcast/影片」 | generate audio/video → download → 取得檔案路徑 | `media` |
| 「比較概念做表格」 | generate data-table → download data-table | `table` |
| 「關閉顯示」 | — | 用 `[ACTION:NOTEBOOK_CLOSE]` |

### data 欄位格式

- `markdown`：Markdown 純文字
- `mindmap`：JSON 字串 `{"label":"根節點","children":[{"label":"子節點","children":[]}]}`
- `quiz`：JSON 陣列 `[{"question":"題目","options":["A","B","C","D"],"correct":0,"rationale":"解說"}]`
- `flashcards`：JSON 陣列 `[{"front":"正面","back":"背面"}]`
- `media`：檔案相對路徑（如 `files/notebooklm/video-20260507.mp4`），前端會自動嵌入播放器
- `table`：CSV 字串（含表頭行）

### 重要

- `data` 中的雙引號必須轉義為 `\"`
- 只有取得實際內容後才附 ACTION，不要在「開始產生」時附
- 同時用口語告知使用者結果摘要（1-2 句），ACTION 只是額外的視覺呈現
- **ACTION 標記必須放在回覆最末尾**，前面的口語部分先說完
- **嚴禁在口語回覆中輸出 JSON 內容**。JSON 只能放在 ACTION 的 data 欄位中

---

## 回覆規則

- NotebookLM 答案轉口語化、精簡（1-3 句）
- **移除所有引用標記** [1] [2] 和 markdown 格式
- 長答案摘要重點
- 找不到 → 「筆記本裡沒有相關內容」

## 觸發時機

- 「查筆記本 / 查一下 XX」→ `ask`
- 「我的筆記本有哪些」→ `list`
- 「切到 XX 筆記本」→ `use`
- 「加到筆記本」→ `source add`
- 「產生 Podcast / 影片 / 報告 / 測驗 / 學習卡 / 心智圖」→ `generate` 對應類型
- 「下載 XX」→ `download` 對應類型
- 「幫我研究 XX 主題」→ `source add-research`
- 「筆記本摘要」→ `summary`
- 「分享筆記本」→ `share`

## 注意事項

- 認證失敗 → 提醒 `notebooklm login`
- `ask` 通常 3-10 秒回應
- generate 耗時 3-30 分鐘（mind-map 除外）
- `notebooklm` 不存在 → PATH 未設定
- 自動偵測來源類型：http URL → 網頁、YouTube URL → 影片轉錄、檔案路徑 → 上傳
