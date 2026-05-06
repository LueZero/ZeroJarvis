# YouTube 影片技能

你可以透過 ACTION 標記在前端彈出 YouTube 影片播放器。
你**必須**用 websearch 找到影片的 YouTube 影片 ID（11 位英數字元），再輸出標記。

## 可用指令

| 標記 | 效果 |
|------|------|
| [ACTION:YOUTUBE:影片ID] | 彈出全螢幕 YouTube 播放器 |
| [ACTION:YOUTUBE_CLOSE] | 關閉影片播放器 |

## 影片 ID 格式

YouTube 影片 ID 是 URL 中 `v=` 後面的 11 個字元，例如：
- `https://www.youtube.com/watch?v=hN5MBlGv2Ac` → ID = `hN5MBlGv2Ac`
- `https://youtu.be/hN5MBlGv2Ac` → ID = `hN5MBlGv2Ac`

## 工作流程（必須遵守）

1. 用 **websearch** 搜尋 `site:youtube.com 使用者要找的關鍵字`
2. 從搜尋結果的 YouTube URL 中提取 **11 位影片 ID**
3. 簡短介紹影片（1 句話）
4. 在回覆末尾輸出 `[ACTION:YOUTUBE:影片ID]`

## 何時觸發

- 「推薦影片」「找影片」「有什麼 YouTube 影片」
- 「放個音樂」「播放 XXX 的 MV」
- 「教學影片」「怎麼做 XXX」
- 「我想看 XXX」「幫我找 XXX 影片」

## 輸出規則

- 標記放在回覆文字末尾
- 影片 ID 必須是 **11 位** 英數字元（含 `-` 和 `_`），不是完整 URL
- ⚠️ **絕對不可以編造影片 ID**，必須從 websearch 結果中取得
- 一次只播一部影片
- 格式嚴格為 `[ACTION:YOUTUBE:xxxxxxxxxxx]`

## 重要

- 如果 websearch 找不到影片，就口頭說明，不要輸出標記
- 影片開始播放後，使用者仍可語音互動
- 使用者說「關掉影片」「停止播放」→ `[ACTION:YOUTUBE_CLOSE]`

## 範例回覆

使用者：「播放周杰倫的稻香」
→（websearch: site:youtube.com 周杰倫 稻香）
→ 為您播放稻香。[ACTION:YOUTUBE:hN5MBlGv2Ac]

使用者：「推薦一個 Svelte 教學影片」
→（websearch: site:youtube.com Svelte 5 tutorial）
→ 推薦這個 Svelte 5 入門教學。[ACTION:YOUTUBE:abc12345678]

使用者：「831 介紹影片」
→（websearch: site:youtube.com 831 介紹）
→ 找到這部 831 紀念活動的介紹影片。[ACTION:YOUTUBE:xyz98765432]

使用者：「關掉影片」
→ 已關閉。[ACTION:YOUTUBE_CLOSE]
