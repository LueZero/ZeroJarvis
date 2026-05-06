---
name: notebooklm
description: 透過 MCP 工具操作 Google NotebookLM（問答、來源管理、Podcast 產生、筆記本管理）
---

# NotebookLM 技能

當使用者想對 Google NotebookLM 的筆記本進行操作時使用此技能。
適用範圍：詢問筆記本內容、新增來源、產生 Podcast（Audio Overview）、管理筆記本等。

## 可用工具（MCP 自動提供，前綴 `notebooklm_`）

### 問答
| 工具 | 用途 |
|------|------|
| `ask_question` | 對筆記本提問，支援 session 重用、引用擷取。參數：`question`（必填）、`source_format`（none/inline/footnotes/json） |

### 來源與音訊
| 工具 | 用途 |
|------|------|
| `add_source` | 新增來源到筆記本。支援 `type=url`（網頁）和 `type=text`（貼上文字） |
| `generate_audio` | 產生 Audio Overview（Podcast）。可帶 `custom_prompt`、`timeout_ms` |
| `get_audio_status` | 查詢音訊產生狀態（非阻塞） |
| `download_audio` | 下載已完成的音訊檔為 `.m4a`。需先 `generate_audio` |

### 筆記本管理
| 工具 | 用途 |
|------|------|
| `add_notebook` | 用 NotebookLM 分享連結新增筆記本到本地資料庫 |
| `list_notebooks` | 列出所有筆記本 |
| `get_notebook` | 查看單一筆記本詳情 |
| `select_notebook` | 設為預設筆記本（`ask_question` 會用這本） |
| `update_notebook` | 更新筆記本名稱、描述、標籤等 |
| `remove_notebook` | 從本地資料庫移除（不刪除遠端筆記本） |
| `search_notebooks` | 依名稱、描述、標籤搜尋 |
| `get_library_stats` | 資料庫統計資訊 |

### 系統
| 工具 | 用途 |
|------|------|
| `setup_auth` | 首次 Google 登入（開 Chrome 視窗） |
| `re_auth` | 重新登入 / 切換帳號 |
| `get_health` | 檢查伺服器狀態、認證狀態 |
| `list_sessions` | 列出的瀏覽器 session |
| `close_session` | 關閉特定 session |
| `reset_session` | 清除 session 聊天歷史但保留 ID |
| `cleanup_data` | 清除所有儲存資料（謹慎使用） |

## 使用流程

### 新增筆記本

1. 使用者提供 NotebookLM 分享連結（形如 `https://notebooklm.google.com/notebook/xxx`）
2. 呼叫 `add_notebook`，傳入 URL
3. 用 `select_notebook` 設為預設

### 提問（最常用）

1. 確認已有選中的筆記本（如有需要先 `list_notebooks` → `select_notebook`）
2. 呼叫 `ask_question`，參數 `question` = 使用者的問題
3. 將回覆的答案用口語化方式朗讀給使用者

### 產生 Podcast

1. 確認已有選中的筆記本
2. 呼叫 `generate_audio`（可帶 `custom_prompt` 指定主題）
3. 告知使用者「正在產生中，大約需要幾分鐘」
4. 可用 `get_audio_status` 查詢進度
5. 完成後用 `download_audio` 下載

### 新增來源

1. 呼叫 `add_source`，參數 `type` = "url" 或 "text"，`content` = URL 或文字內容
2. 確認新增成功後告知使用者

## 回覆規則

- 從 NotebookLM 取得的答案要轉化為口語化、精簡的回覆（1-3 句）
- 不要原封不動地念出引用標記、`_provenance` 或 markdown 格式
- 如果答案很長，摘要重點即可
- 如果筆記本中找不到答案，直接說「筆記本裡沒有相關內容」

## 觸發時機

- 「幫我查筆記本裡關於 X 的內容」→ ask_question
- 「我的筆記本有哪些」→ list_notebooks
- 「切到 XX 筆記本」「用 XX 那本」→ select_notebook
- 「把這個網址加到筆記本」→ add_source (type=url)
- 「產生 Podcast」「做一個語音摘要」→ generate_audio
- 「建一個新筆記本」→ add_notebook（需要使用者提供分享連結）
- 「找一下有沒有關於 X 的筆記本」→ search_notebooks
- 「登入 NotebookLM」「重新登入」→ setup_auth 或 re_auth
- 「Podcast 好了沒」「音訊產生到哪了」→ get_audio_status

## 注意事項

- 首次使用前需要先完成 Google 認證（`setup_auth`），如果工具回報認證失敗，提醒使用者需要重新登入
- `generate_audio` 耗時較長（3-10 分鐘），呼叫後先回覆使用者再等待結果
- `ask_question` 可能需要 10-30 秒，這是正常的
- 一次只能操作一個筆記本，需要切換時先 `select_notebook`
- `add_notebook` 需要 NotebookLM 的分享連結（不是隨便的 URL）
- 如需顯示瀏覽器視窗，可在工具呼叫時加 `show_browser=true`
