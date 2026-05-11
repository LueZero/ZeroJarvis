# 貢獻指南

感謝你對 ZeroJarvis 的興趣！以下是參與開發的指南。

## 開發環境

```bash
# 前置需求
Node.js >= 20, pnpm >= 9, Bun >= 1.1

# 安裝
git clone https://github.com/user/ZeroJarvis.git
cd ZeroJarvis
pnpm install

# 啟動開發模式
.\start.ps1
```

## 提交規範

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
feat: 新功能描述
fix: 修復問題描述
docs: 文件更新
refactor: 重構（不影響功能）
style: 格式調整（不影響邏輯）
chore: 雜項（建構、CI 等）
```

範例：
```
feat: add weather query skill
fix: VAD not restarting after TTS playback
docs: update skill system documentation
```

## 分支策略

- `main` — 穩定版本
- `feature/*` — 新功能開發
- `fix/*` — 問題修復

## 新增功能的流程

### 1. 新增 Skill（教 AI 新行為）

在 `.opencode/skills/` 下建立目錄，撰寫 `SKILL.md`：

```markdown
---
name: my-new-skill
description: 描述此技能的觸發時機與行為
---

# 技能說明

## 何時觸發
- 使用者說了什麼時觸發

## 可用指令
| 標記 | 效果 |
|------|------|
| [ACTION:MY_ACTION] | 執行某動作 |

## 輸出規則
- 口語化繁體中文
- 1-2 句精簡回覆
```

### 2. 新增 ACTION（前端互動）

1. **Gateway 端**：`parseActions()` 已支援任意 `[ACTION:NAME:PAYLOAD]` 格式，無需修改
2. **前端端**：在 `apps/web/src/lib/components/HUD.svelte` 的 `handleAction()` 新增 case

### 3. 新增 Overlay（全螢幕覆蓋 UI）

建立 `apps/web/src/lib/components/NewOverlay.svelte`，在 `HUD.svelte` 中引入並由 ACTION 觸發。

### 4. 新增 MCP Server（外部工具整合）

參考 `services/gateway/src/food/mcp-server.cjs`，建立新的 MCP Server 並在 `opencode.json` 中註冊。

## 程式碼風格

- TypeScript 為主
- Svelte 5 Runes 響應式（`$state`、`$derived`、`$effect`）
- 所有 AI 回覆為口語化繁體中文
- 變數/函式使用英文命名

## Pull Request 須知

1. 確保所有型別檢查通過：`pnpm --filter web check`
2. 測試基本語音流程正常運作
3. 若新增 Skill，確認 `SKILL.md` 包含 `name` 和 `description` frontmatter
4. 更新相關文件（`README.md`、`docs/DESIGN.md`）

## 問題回報

開 [Issue](https://github.com/user/ZeroJarvis/issues) 時請包含：

1. 問題描述
2. 重現步驟
3. 預期行為 vs 實際行為
4. 環境資訊（OS、Node 版本、瀏覽器）
5. Gateway 終端日誌（如有）
