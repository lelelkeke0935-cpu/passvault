# AI 端最終交接：薄客戶端、MCP、CLI 與完整 Demo
成員：Mac mini Codex（AI 端）
時間：11/7 10:46
狀態：完成，停止開發，等待筆電 Claude 收回

## 做了什麼
- 完成 HTTP 薄客戶端、stdio MCP 的 list_secrets／call_api、CLI list／stdin add／demo／demo --reset。
- 必要流程測試通過後加入 #4：等 6 秒、帶同一 grant「我再試試」、再次擋下、每秒等手機全部收回。
- 完成真實本機 Hono HTTP 測試、MCP stdio 子行程測試，以及保留完整等待時間的 CLI 子行程 Demo。

## 改了哪些檔案
- src/agent/client.ts
- src/agent/client.test.ts
- src/agent/fake-vault.test-support.ts
- src/cli/demo.ts
- src/cli/vault.ts
- src/cli/vault.test.ts
- src/mcp/server.ts
- src/mcp/server.test.ts
- handoff/1042-macmini-codex-required.md
- 本交接卡

沒有修改 package.json、package-lock.json、其他成員資料夾或 .pv-ref；沒有讀取 .env。

## 怎麼驗（指令＋結果）
- `npm install --package-lock=false --no-audit --no-fund --cache /private/tmp/passvault-agent-npm-cache` → 成功，沒有改共用套件檔。
- `npm ls @modelcontextprotocol/sdk hono vitest tsx zod --depth=0` → MCP 1.32.2、hono 4.6.10、vitest 2.1.5、tsx 4.19.2、zod 3.23.8，符合既有 package.json。
- `npm run typecheck` → 通過。
- `npm test -- src/agent src/cli src/mcp` → 最後一輪 3 檔、31 tests passed，總時間 26.85 秒。
- 上述真正 CLI 子行程的完整等待流程 → 26.510 秒，模擬手機立即授權／收回；只送出 50 封，5 次 /api/call，最後顯示「✓ 已全部收回」。這是假的 API 與模擬手機，不代表已完成正式舞台彩排。
- 覆蓋 300ms 開場輪詢、6／8／1／3／6 秒舞台等待、1 秒授權與收回輪詢、拒絕／過期／用過／收回授權、漏遮金鑰時停止、reset 不解鎖、stdin add、HTTP 不跟隨重新導向、請求取消、兩個 MCP 工具及原樣回傳三種業務結果。
- `npm run vault -- --help` → 正常顯示繁體中文用法。
- `git diff --check` → 通過。

## 卡住什麼
- 無 AI 端阻擋；尚未連正式保險箱 API、舞台或真手機，這一段由整合端驗收。
- 既有 @hono/node-server 1.13.7 在 Node 24.18.0 載入時會警告 `Failed to find Response internal state key`；所有 HTTP 測試仍通過，未改依賴版本。

## 下一棒
誰：筆電 Claude

1. 再收一次本工作資料夾。開發中觀察到 HEAD 已由其他程序成為 `ed42d57`（`Agent side from Mac mini Codex`）；本代理沒有執行 commit、push 或合併。其後還有時間欄位相容性、測試清理及本卡，請一併收回並代 commit。分支仍是 codex/agent。
2. 執行 `npm run vault -- list`、`npm run vault -- demo --reset`、`npm run vault -- demo`。MCP 請用 `npm run --silent mcp` 或 `node --import tsx src/mcp/server.ts`，避免 npm banner 混入 stdio 協定。
3. 環境只需 PASSVAULT_URL（HTTP／HTTPS 根網址）與 PASSVAULT_AGENT_TOKEN。CLI agent 是 vault-cli，MCP agent 是 claude-code。沒有讀取或使用 STAGE_TOKEN／PHONE_TOKEN，沒有授權、收回或解鎖的寫入指令。
4. `vault add example --type password`／`api_key` 的值只能走 stdin 管線或重新導向；互動式 TTY 會拒絕以避免回顯。只移除最後一個換行，其他空白保留；不把內容寫檔或印出。
5. Demo 的代送目標依約定固定 `http://127.0.0.1:8787/sandbox/mail/whoami` 與 `/lists/customers/send`；它們只放在 /api/call 的 JSON，實際網路請求都送往 PASSVAULT_URL 的 /api/*。伺服器端需維持這個 sandbox 位址與 allowHosts。
6. #4 啟用以 GET /api/lockdown 可用為準。若回 404 或 501，CLI 停在一次性授權失效，讓舞台自行收尾；若加分被砍，請讓此路徑回上述狀態，避免進入 retry 等待。其他 HTTP 錯誤會停止並顯示安全訊息。
7. 每次 /api/call 都帶 caption；寄送成功、重用與「我再試試」都使用同一個 grant 與相同請求內容。CLI 僅在 yourKey 是「▮▮▮▮」或「Bearer ▮▮▮▮」時印出原回應欄位，其他內容一律停止且不顯示。時間欄位因約定未限定格式，同時接受 ISO 字串與 epoch 數字。
8. 真手機驗一次：舞台空白鍵 → 手機授權一次 → 再寄被擋 → 我再試試 → 手機全部收回；最後確認 `demo --reset` 回 locked:true 時只提示「保險箱還鎖著，請在舞台頁按 R 重設並解鎖」。

本張是最後交接卡，AI 端工作到此停止。
