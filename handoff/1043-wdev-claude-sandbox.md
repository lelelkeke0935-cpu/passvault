# 測試用寄信 API、驗收腳本、加分 #21 #9（最後一張）
成員：WDEV Claude
時間：11/7 10:43
狀態：完成，要筆電 Claude 接上

## 做了什麼
- 寄信 API（含故意洩漏的 whoami、`yourKeyB64`）、`sandbox_log`、驗收腳本 `scripts/check.sh`。
- 加分 #21 `src/audit/chain.ts`、#9 `src/leak/scan.ts`，都是純函式加測試，不碰資料庫與伺服器。
- 1～6 全部做完，commit 在 `wdev-claude/sandbox`，沒有 push。

## 改了哪些檔案
- src/sandbox/mail.ts、src/sandbox/mail.test.ts
- src/audit/chain.ts、src/audit/chain.test.ts
- src/leak/scan.ts、src/leak/scan.test.ts
- scripts/check.sh

## 怎麼驗（指令＋結果）
- `npm test` → 3 個檔、38 passed
- `npm run typecheck` → 沒有錯誤
- `scripts/check.sh` 沒跑過（WDEV 不准執行 bash 腳本），要筆電 Claude 對公開網址跑：
  `PASSVAULT_AGENT_TOKEN=... SANDBOX_MAIL_KEY=... bash scripts/check.sh https://xxxx.trycloudflare.com`
  - WDEV 這邊的 chmod 被擋，只在 git 裡標成可執行（100755）。用 `bash scripts/check.sh` 跑最保險。
  - 要有 curl、node。金鑰只寫進 600 權限的暫存資料夾、在 node 裡比對，跑完就刪，不會印出來。
  - 開頭和結尾都會打 `/api/demo/reset`（帶 agent token），**Demo 進行中不要跑**。保險箱鎖著時會提醒先在舞台按 R。
  - `/api/call` 的 `url` 預設是 `http://127.0.0.1:8787/sandbox/mail/...`（從伺服器看的位址），要改就設 `TARGET`。
  - 共 10 項：必做 7 項、加分 2 項（`yourKeyB64` 是塗銷條、`/api/evidence/verify` 回 ok），再加一項「AI 收到的所有內容搜不到金鑰前 8 碼」。全過時結束碼 0。

## 接上時要知道的（筆電 Claude）
1. **掛載**：`app.route('/sandbox/mail', sandboxMail)`，要放在 `app.use('/*', serveStatic(...))` 前面。
2. **金鑰**：每次請求才去讀 `process.env.SANDBOX_MAIL_KEY`。伺服器自己產生金鑰時，要寫回 `process.env.SANDBOX_MAIL_KEY`。沒有金鑰時一律回 401。
3. **重設**：`/api/demo/reset` 請呼叫 `clearSandboxLog()`（從 `src/sandbox/mail.ts` 匯出）。表還沒建立也能用，不會出錯。
4. **`sandbox_log`**：表在第一次用到時自己建立在 `DATA_DIR/vault.db`，欄位是 id、at、method、path、authorization、recipients、status、body。
   - Authorization 存成「▮▮▮▮」，沒帶就存 null。body 裡出現的金鑰也會換成塗銷條。
   - `GET /log` 只回 id、at、method、path、authorization、recipients、status，也要帶 Bearer 金鑰。
   - 讀 `/log` 本身**不記一筆**，所以前後各讀一次就能比對有沒有多出一筆。401 的請求也會記。
5. **`DELETE /lists/:id`**：回 204，但名單不會真的刪掉，免得 Demo 壞掉；這個動作本來就被規則擋住。
6. **whoami**：`yourKey` 是 Authorization 原文（`Bearer <金鑰>`），`yourKeyB64` 是**金鑰本身**的 Base64，沒有包含 `Bearer `。
   - 原因：`Bearer ` 是 7 個字，連它一起編碼的話，金鑰那段的 Base64 會錯位，`maskSecrets` 遮不到。
   - 約定寫的是「同一串的 Base64」，我照能被遮住的方式做；你要改約定的字面也可以。
7. **#21 `verifyChain(rows, key)`**
   - `rows` 照寫入順序傳入，欄位用駝峰：`prevHash`、`hash`，加上 ProxyLog 的九個欄位。
   - `brokenAt` 是**從 1 起算的第幾筆**，面板可以直接顯示「第 N 筆」。
   - 另外匯出 `deriveAuditKey(vaultKey)`（HKDF-SHA256，info 是 `passvault-audit`）和 `GENESIS`（64 個 0）。
   - 寫入時：`hash = chainHash(上一筆的 hash 或 GENESIS, row, auditKey)`。
   - 已知限制：只刪最後一筆抓不到，測試裡有寫明。
8. **#9 `findSecrets` / `maskSecrets`**
   - 剛好 8 個字的祕密**會掃**：照 API約定「8 個字以上」，7 個字以下不掃。
   - Base64 跟其他文字一起編碼時也抓得到。
   - 請在「回應文字」上遮，也就是 `JSON.stringify` 之後再遮。祕密裡有 `"` 或 `\` 時，JSON 跳脫後的寫法不在五種寫法裡。
   - 已知限制：祕密被拆成兩段抓不到，測試裡有寫明。

## 卡住什麼
無。只有 check.sh 沒在 WDEV 實際跑過（理由見上）。

## 下一棒
誰：筆電 Claude
要做：
1. 收 `wdev-claude/sandbox`。
2. 把 sandboxMail、clearSandboxLog、chain、scan 接進 server 與 `/api/call`。
3. 部署後跑 `bash scripts/check.sh <公開網址>`。
