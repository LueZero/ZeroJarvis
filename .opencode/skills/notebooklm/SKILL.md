---
name: notebooklm
description: 透過 MCP 工具操作 Google NotebookLM（問答、來源管理、Podcast 產生、筆記本管理）
---

# NotebookLM 技能

當使用者想對 Google NotebookLM 的筆記本進行操作時使用此技能。
適用範圍：詢問筆記本內容、新增來源、產生 Podcast（Audio Overview）、管理筆記本等。

## 可用工具（MCP 自動提供）

| 工具 | 用途 |
|------|------|
| `notebooklm_ask_question` | 對目前選中的筆記本提問，回傳帶引用的答案 |
| `notebooklm_list_notebooks` | 列出所有筆記本 |
| `notebooklm_select_notebook` | 切換/選擇特定筆記本 |
| `notebooklm_search_notebooks` | 搜尋筆記本名稱 |
| `notebooklm_add_notebook` | 建立新筆記本 |
| `notebooklm_add_source` | 加入來源（URL 或文字） |
| `notebooklm_generate_audio` | 產生 Audio Overview（Podcast 風格摘要） |
| `notebooklm_download_audio` | 下載已產生的音檔 |
| `notebooklm_setup_auth` | 首次認證（開啟 Chrome 登入 Google） |
| `notebooklm_get_health` | 檢查 MCP 伺服器狀態 |

## 使用流程

### 提問（最常用）

1. 確認已有選中的筆記本（如有需要先 `list_notebooks` → `select_notebook`）
2. 呼叫 `ask_question` 並傳入使用者的問題
3. 將回覆的答案用口語化方式朗讀給使用者

### 產生 Podcast

1. 確認已有選中的筆記本
2. 呼叫 `generate_audio`
3. 告知使用者「正在產生中，大約需要幾分鐘」
4. 產生完成後通知使用者

### 新增來源

1. 呼叫 `add_source`，傳入 URL 或文字內容
2. 確認新增成功後告知使用者

## 回覆規則

- 從 NotebookLM 取得的答案要轉化為口語化、精簡的回覆（1-3 句）
- 不要原封不動地念出引用標記或 markdown 格式
- 如果答案很長，摘要重點即可
- 如果筆記本中找不到答案，直接說「筆記本裡沒有相關內容」

## 觸發時機

- 「幫我查筆記本裡關於 X 的內容」→ ask_question
- 「我的筆記本有哪些」→ list_notebooks
- 「切到 XX 筆記本」「用 XX 那本」→ select_notebook
- 「把這個網址加到筆記本」→ add_source
- 「產生 Podcast」「做一個語音摘要」→ generate_audio
- 「建一個新筆記本」→ add_notebook
- 「找一下有沒有關於 X 的筆記本」→ search_notebooks

## 注意事項

- 首次使用前需要先完成 Google 認證（`setup_auth`），如果工具回報認證失敗，提醒使用者需要重新登入
- `generate_audio` 耗時較長（3-10 分鐘），呼叫後先回覆使用者再等待結果
- `ask_question` 可能需要 10-30 秒，這是正常的
- 一次只能操作一個筆記本，需要切換時先 `select_notebook`
