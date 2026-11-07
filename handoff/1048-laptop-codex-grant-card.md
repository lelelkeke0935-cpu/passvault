# 面板授權卡交接

感謝整合夥伴接手。以下記錄本段程式與待驗事項。

## 做了什麼

已寫好紅色「已擋下」橫幅，呈現誰、金鑰名稱、動作與單次範圍。每秒查 /api/grants；allowed、used 顯示「已授權，只限這一次」。面板不顯示 phoneUrl，授權在手機進行。

## 改了哪些檔案

src/panel/panel.ts、panel.css、types.ts。

## 怎麼驗（指令＋結果）

- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json`：通過。
- `/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/contract-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/transport-check.ts`：共 11 項通過。
- TypeScript 檢查通過；尚待瀏覽器確認待授權與已授權切換。

## 卡住什麼

本機 Chromium 被沙盒擋住；原生瀏覽器操作服務也已中斷。
目前沒有本段的 1280 與 390 寬截圖，不把程式建置成功當成畫面驗收通過。

## 下一棒

請筆電 Claude 整合後執行 src/panel/qa/browser-check.mjs，並親眼查看截圖。
該腳本只使用假資料，尚未成功執行；真實 API 彩排另行驗證。
若操作與預期不同，請回傳狀態與回應欄位，方便定位。
