---
name: twinkle-hub
description: 當使用者詢問台灣相關資料（政府開放資料、不動產、醫療、交通、環境、公司查詢、地址、統編、身分證驗證等），透過 Twinkle Hub MCP 查詢台灣 52,960 筆資料集與 44 個在地工具
---

# Twinkle Hub — 台灣資料 MCP 技能

當使用者提到台灣相關的資料查詢、公開資料、政府資料、公司查詢、地址處理、驗證等需求時，透過 Twinkle Hub MCP 端點取得資料。

## 可用工具分類

### 一、OpenData 資料查詢（`opendata-*` 前綴）

涵蓋 20 個 domain，52,960 筆資料集：

| Domain | 代碼 | 典型問題 |
|--------|------|----------|
| 不動產與地政 | realestate_land | 某地段實價登錄、地價、建照 |
| 經濟、產業、公司 | economy_business | 公司登記、產業統計、外貿 |
| 政府採購與補助 | procurement_subsidy | 得標金額、廠商查詢、補助計畫 |
| 政府預決算 | public_finance | 預算趨勢、公共債務 |
| 稅務與稅收 | tax_revenue | 稅收統計、稅率、欠稅 |
| 交通運輸 | transport | 公路、鐵路、停車、事故 |
| 治安警消 | public_safety | 犯罪統計、災害、消防 |
| 司法法務 | judicial_legal | 判決、裁罰、法規查詢 |
| 立法院 | legislature | 議案、表決、質詢、委員資料 |
| 醫療衛生 | health_food | 醫院、健保、藥物、食品衛生 |
| 環境氣象 | environment | AQI、水質、氣象、生態 |
| 教育科研 | education_research | 學校、學生、研究計畫 |
| 農林漁牧 | agriculture_fisheries | 果菜行情、漁獲、畜牧 |
| 勞動就業 | labor_employment | 薪資、勞動條件、職災 |
| 社會福利人口 | social_population | 福利、戶政、人口、選舉 |
| 文化觀光體育 | culture_tourism_sport | 景點、旅宿、活動、文化資產 |
| 外交兩岸 | foreign_affairs | 進出口、外交聲明 |
| 政府公告 | gov_publication | 公報、出版品、文獻 |
| 地理底圖 | geo_basemap | 行政區界、道路網、地圖 |
| 能源水電電信 | utilities_telecom | 電力、水質、油品 |

### 二、TW 工具（`twtools-*` 前綴）

44 個在地工具，毫秒級回應：

**地址相關**：
- `normalize_taiwan_address` — 正規化台灣地址（全形→半形、異體字統一、升格對齊）
- `address_to_postal_code` — 地址查郵遞區號
- `address_zh_to_en` — 中文地址轉英文
- `address_en_to_zh` — 英文地址轉中文

**公司查詢**：
- `lookup_company_by_tax_id` — 統編查公司登記資料
- `search_company_by_name` — 公司名 fuzzy 查統編
- `lookup_company_executives` — 統編查董監事名單
- `lookup_company_branches` — 統編查分公司
- `lookup_industry_code` — 行業代碼查中文
- `lookup_company_status_code` — 公司狀態代碼查中文

**驗證工具**：
- `validate_taiwan_id_number` — 驗證身分證字號
- `validate_tax_id_number` — 驗證統一編號
- `validate_phone` — 驗證台灣電話
- `validate_postal_code` — 驗證郵遞區號
- `validate_license_plate` — 驗證車牌

**日期與時間**：
- `roc_year_to_western` — 民國年→西元年
- `western_year_to_roc` — 西元年→民國年
- `is_taiwan_business_day` — 是否台灣工作日
- `lookup_holidays` — 查國定假日
- `current_time_in` — 查各時區現在時間
- `solar_to_lunar` — 國曆→農曆
- `lunar_to_solar` — 農曆→國曆

**行政區**：
- `lookup_administrative_district` — 行政區三向 lookup
- `list_districts_in_county` — 列縣市內鄉鎮市區
- `lookup_county_basic_info` — 查縣市基本資料
- `align_legacy_county` — 舊縣名升格對應

**其他**：
- `lookup_bank_code` — 查銀行代碼
- `lookup_mrt_line` — 查捷運路線
- `lookup_government_agency_code` — 查政府機關代碼
- `fetch_url_as_markdown` — 抓網頁轉 Markdown
- `extract_pdf_text` — 抽 PDF 內文
- `simplified_to_traditional` — 簡體→繁體
- `traditional_to_simplified` — 繁體→簡體
- `format_chinese_numerals` — 阿拉伯↔國字大寫

## 何時觸發

- 使用者問台灣的任何公開資料（房價、空氣品質、醫院、學校、採購案、公司資訊…）
- 使用者需要驗證台灣的身分證、統編、電話、車牌、地址
- 使用者需要地址正規化、中英翻譯、查郵遞區號
- 使用者問民國年換算、國定假日、工作日判定
- 使用者查公司登記資料、董監事、統編
- 使用者問台灣行政區、捷運路線、銀行代碼
- 使用者提到「政府資料」「開放資料」「OpenData」

## 何時不觸發

- 非台灣相關的資料查詢（國際資料用 websearch）
- 餐廳美食推薦（那是 onetable-food 技能的範圍）
- 純粹的程式開發問題
- 一般閒聊

## 使用流程

1. 判斷使用者需求屬於哪個 domain 或工具
2. 呼叫對應的 `twinkle-hub` MCP 工具
3. 用 1-2 句口語化繁體中文回覆重點結果
4. 資料量大時摘要呈現，不要逐筆念出

## 範例回覆

使用者：「台積電的董監事有誰？」
→ 先用 `search_company_by_name` 查統編，再用 `lookup_company_executives` 查董監事名單，口語摘要回覆。

使用者：「信義區去年最貴的房子多少錢？」
→ 用 opendata 查詢 realestate_land domain 的實價登錄資料，摘要回覆前幾筆。

使用者：「幫我驗證這個統編 12345678」
→ 用 `validate_tax_id_number` 驗證，直接告知結果。

使用者：「民國 114 年是西元幾年？」
→ 用 `roc_year_to_western` 換算，回覆「西元 2025 年」。

使用者：「明天是不是上班日？」
→ 用 `is_taiwan_business_day` 查詢，直接回覆。

## 重要

- 所有工具透過同一個 MCP endpoint 呼叫，工具名前綴為 `twinkle-hub`
- 回覆保持口語化、精簡，不要列表式念出大量資料
- 資料來自政府開放資料，引用時可提及「根據政府開放資料」增加可信度
- 目前 Alpha 階段完全免費
