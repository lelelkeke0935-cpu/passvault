# 單張手機授權頁交接

感謝整合夥伴接手。以下記錄本段程式與待驗事項。

## 做了什麼

已寫好 /m/grants/:id?token=，含深色卡、大字、單次範圍、授權與拒絕。按鈕送出期間停用；處理過的授權不受舊輪詢覆蓋。過期、已使用、拒絕及收回都有結果文案。通行碼沿用手機固定網址，方便重新整理；不寫入儲存空間或頁面文字。

## 改了哪些檔案

src/panel/m.html、phone.ts、phone.css、common.ts。

## 怎麼驗（指令＋結果）

- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json`：通過。
- `/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/contract-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/transport-check.ts`：共 11 項通過。
- TypeScript 與通行碼存放測試通過。尚待 390×844 真實點按與截圖。

## 卡住什麼

本機 Chromium 被沙盒擋住；原生瀏覽器操作服務也已中斷。
目前沒有本段的 1280 與 390 寬截圖，不把程式建置成功當成畫面驗收通過。

## 下一棒

請筆電 Claude 整合後執行 src/panel/qa/browser-check.mjs，並親眼查看截圖。
該腳本只使用假資料，尚未成功執行；真實 API 彩排另行驗證。
若操作與預期不同，請回傳狀態與回應欄位，方便定位。
