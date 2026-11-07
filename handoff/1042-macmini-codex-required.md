# AI 端必要流程完成
成員：Mac mini Codex（AI 端）
時間：11/7 10:42
狀態：完成

## 做了什麼
- 完成薄 HTTP 客戶端、兩個 stdio MCP 工具及 CLI list／stdin add／demo／reset。
- Demo 依序等開場、6 秒存入、8 秒遮蔽、手機授權、1 秒放行、寄送 50 封、3 秒後驗證授權只限一次。
- 錯誤訊息不帶 API 原始回應或憑證；不跟隨 HTTP 重新導向、不自動重送 POST；遮蔽驗證失敗即停止。

## 改了哪些檔案
- src/agent/client.ts
- src/agent/client.test.ts
- src/agent/fake-vault.test-support.ts
- src/cli/demo.ts
- src/cli/vault.ts
- src/cli/vault.test.ts
- src/mcp/server.ts
- src/mcp/server.test.ts
- 本交接卡；未改 package.json／package-lock.json／參考文件。

## 怎麼驗（指令＋結果）
- `npm install --package-lock=false --no-audit --no-fund --cache /private/tmp/passvault-agent-npm-cache` → 完成；避免修改共用鎖檔。
- `npm ls @modelcontextprotocol/sdk hono vitest tsx zod --depth=0` → 指定版本全部一致，MCP 1.32.2。
- `npm run typecheck` → 通過。
- `npm test -- src/agent src/cli src/mcp` → 3 檔、26 tests passed；Hono 在 127.0.0.1 的隨機埠提供真實 HTTP，MCP 包含獨立子行程 stdio 測試。
- Demo 測試替換等待函式並檢查等待毫秒數；沒有連正式服務、沒有寄真信。

## 卡住什麼
- 無 AI 端阻擋；整合端 API 目前工作資料夾仍是骨架，尚未做真伺服器與手機驗收。
- Node 24.18.0 搭配既有 @hono/node-server 1.13.7 在測試載入時顯示 `Failed to find Response internal state key`，HTTP 測試仍通過；未更換版本。

## 下一棒
誰：筆電 Claude
要做：接上 API 後執行 `npm run vault -- demo --reset`、`npm run vault -- demo`；MCP 執行 `npm run mcp --silent`（stdio 不能混入 npm banner）。
環境只需 PASSVAULT_URL（根網址）與 PASSVAULT_AGENT_TOKEN；不用、也不讀 STAGE_TOKEN／PHONE_TOKEN。
Demo 代送目標依 API 約定固定 `http://127.0.0.1:8787/sandbox/mail/*`，這是伺服器端目標；Mac mini 只連 PASSVAULT_URL 的 /api/*。
本段已通過 AI 端必要測試，下一段補 #4 與未提供功能時的退場。請以最後交接卡為最終驗證結果。
