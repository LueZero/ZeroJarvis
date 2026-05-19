---
name: youtube
description: 當使用者想搜尋 YouTube 影片、分析影片數據、研究頻道表現、查看熱門趨勢、比較影片、做 SEO 關鍵字研究、規劃影片內容、優化標題時觸發。即使只是隨口問「推薦個影片」「這部影片表現怎樣」「幫我找 XX 相關的影片」也要觸發。
---

# YouTube 技能

透過 YouTube MCP 工具搜尋、分析、比較 YouTube 內容，並在前端顯示影片卡片。

## 可用指令

| 標記 | 效果 |
|------|------|
| `[ACTION:YOUTUBE_URL:https://youtube.com/watch?v=xxx]` | 在瀏覽器開啟影片 |
| `[ACTION:YOUTUBE_CLOSE]` | 關閉 YouTube 覆蓋 |

> **注意**：呼叫 MCP 工具後，Gateway 會**自動**將結果渲染成覆蓋層卡片，你不需要手動構建 `[ACTION:YOUTUBE:{json}]`。

**覆蓋層自動顯示**：當你呼叫以下 5 個 MCP 工具時，Gateway 會自動將回傳資料渲染成影片卡片覆蓋層，**不需要**手動構建 YOUTUBE ACTION：
- `youtube_search` → search 覆蓋
- `youtube_video_info` → video 覆蓋
- `youtube_channel_info` → channel 覆蓋
- `youtube_trending` → trending 覆蓋
- `youtube_compare` → compare 覆蓋

以下 3 個工具為**純文字分析**，不會觸發覆蓋層，直接用口語化摘要回覆即可：
- `youtube_comments` — 留言分析
- `youtube_transcript` — 字幕查詢
- `youtube_keyword_ideas` — 關鍵字研究

**開啟影片**：當使用者明確想看某支影片（如「幫我播這個」「打開這部」），使用 `[ACTION:YOUTUBE_URL:影片URL]` 在瀏覽器開啟。可同時開多個。

## MCP 工具：youtube-toolkit

### youtube_search — 搜尋影片

使用者想找影片、推薦影片時呼叫。

參數：
- `query`（必填）：搜尋關鍵字
- `maxResults`（選填）：回傳數量，預設 10
- `order`（選填）：排序 relevance / date / viewCount / rating
- `type`（選填）：video / channel / playlist
- `publishedAfter`（選填）：只搜尋此日期之後，ISO 8601 格式
- `regionCode`（選填）：地區代碼，預設 TW

### youtube_video_info — 影片詳情

使用者提供影片連結或想深入了解某支影片時呼叫。

參數：
- `videoId`（擇一）：影片 ID
- `url`（擇一）：完整 YouTube URL

回傳：標題、描述、標籤、觀看數、按讚數、留言數、時長、縮圖等。

### youtube_channel_info — 頻道資訊

使用者問某個頻道的表現、訂閱數、近期影片時呼叫。

參數：
- `channelId`（擇一）：頻道 ID（UC 開頭）
- `handle`（擇一）：頻道名稱或 @handle

回傳：訂閱數、影片數、總觀看數、近 10 支影片。

### youtube_trending — 熱門排行

使用者問「最近什麼影片很紅」「YouTube 熱門」時呼叫。

參數：
- `regionCode`（選填）：地區代碼，預設 TW
- `categoryId`（選填）：類別（10=音樂, 20=遊戲, 24=娛樂, 25=新聞, 28=科技）
- `maxResults`（選填）：數量，預設 20

### youtube_comments — 影片留言

使用者想了解觀眾反應、留言情緒時呼叫。

參數：
- `videoId` 或 `url`（擇一）：影片
- `maxResults`（選填）：數量，預設 20
- `order`（選填）：relevance / time

### youtube_compare — 比較多部影片

使用者想比較幾支影片的表現時呼叫。

參數：
- `videoIds`（必填）：影片 ID 或 URL 陣列（至少 2 個）

回傳：觀看數、按讚數、互動率、排名。

### youtube_keyword_ideas — 關鍵字研究

使用者想做 SEO 研究、找選題方向時呼叫。

參數：
- `keyword`（必填）：關鍵字
- `regionCode`（選填）：地區，預設 TW

回傳：相關關鍵字建議、競爭頻道、內容方向。

### youtube_transcript — 字幕查詢

使用者想知道影片有沒有字幕、支援哪些語言時呼叫。

參數：
- `videoId` 或 `url`（擇一）：影片
- `lang`（選填）：偏好語言，預設 zh-TW

## 何時觸發

- 使用者說「找影片」「推薦影片」「搜尋 XX 影片」→ 呼叫 `youtube_search`
- 使用者貼 YouTube 連結或說「這部影片表現怎樣」→ 呼叫 `youtube_video_info`
- 使用者問某個 YouTuber 或頻道 → 呼叫 `youtube_channel_info`
- 使用者問「YouTube 現在什麼最紅」「熱門影片」→ 呼叫 `youtube_trending`
- 使用者說「比較這幾支影片」→ 呼叫 `youtube_compare`
- 使用者問「XX 這個主題好不好做」「幫我想選題」→ 呼叫 `youtube_keyword_ideas`
- 使用者說「幫我想影片標題」「這個標題好不好」→ 呼叫 `youtube_search` 參考 + 提供建議
- 使用者說「分析我的頻道」或提供頻道連結 → 呼叫 `youtube_channel_info` + 改進建議
- 使用者說「關閉 YouTube」「關掉影片」→ 回覆 + `[ACTION:YOUTUBE_CLOSE]`
- 使用者問非 YouTube 相關的事 → 不觸發

## 創作者輔助

當使用者想**規劃影片內容**時，結合 MCP 數據提供建議：

### 選題建議
- 呼叫 `youtube_keyword_ideas` 找高潛力主題
- 呼叫 `youtube_trending` 追蹤趨勢方向
- 呼叫 `youtube_search` 評估競爭程度
- 結合分析提供「做什麼 + 為什麼做」

### 標題優化
- 提供 3-5 個標題選項（好奇型 / 教學型 / 比較型）
- 包含目標關鍵字、控制 60 字元以內
- 用 `youtube_search` 參考同類影片標題模式

### 頻道改進
使用者說「分析我的頻道」或提供頻道連結時：
1. `youtube_channel_info` 取得概況
2. 分析近期影片表現分布
3. 找出最好/最差的影片
4. 具體建議：上傳頻率、內容方向、標題改進

**建議要具體可行**：
- ❌「標題要有吸引力」
- ✅「試試看『3 個你不知道的 XX 技巧』這種結構」

## 回覆風格

- 用 1-2 句口語化摘要（適合語音朗讀）
- 數字口語化：「三百萬觀看」而非「3,000,000」
- 推薦影片時提及 1-2 支片名和亮點
- 分析影片時講重點數據（觀看數、互動率、觀眾評價）
- 主動提供洞察（例：「這支的互動率比同類型影片高很多」）
- **不要逐項列出所有結果**，講重點就好，詳細資料由前端覆蓋層顯示

## 範例

使用者：「幫我找 Python 教學影片」
→ （呼叫 youtube_search，query="Python 教學"）
→ 找到不少 Python 教學，Corey Schafer 的系列最多人看，超過五百萬觀看。

使用者：「最近 YouTube 什麼影片最紅？」
→ （呼叫 youtube_trending）
→ 台灣今天熱門第一名是 XXX 的新影片，觀看數已經破兩百萬。

使用者：「分析這部 https://youtube.com/watch?v=xxx」
→ （呼叫 youtube_video_info + youtube_comments）
→ 這支影片有一百二十萬觀看，互動率百分之三點五，留言普遍正面。

使用者：「老高的頻道表現怎樣？」
→ （呼叫 youtube_channel_info，handle="老高與小茉"）
→ 老高目前六百多萬訂閱，近期影片平均兩百萬觀看，上傳頻率大約一週一支。

使用者：「關閉 YouTube」
→ 好的。[ACTION:YOUTUBE_CLOSE]

使用者：「幫我想個影片主題，關於 AI 工具」
→ （呼叫 youtube_keyword_ideas，keyword="AI 工具" + youtube_search 評估競爭）
→ AI 工具這個主題搜尋量不錯，但競爭很激烈。建議可以切「免費 AI 工具推薦」或「AI 工具實測比較」，這類長尾關鍵字競爭較少。

使用者：「分析我的頻道」（提供頻道連結）
→ （呼叫 youtube_channel_info）
→ 你的頻道目前一萬兩千訂閱，近期影片平均五千觀看。教學類影片表現最好，建議增加這類內容的比例。
