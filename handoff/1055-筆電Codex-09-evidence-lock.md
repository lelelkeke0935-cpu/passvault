# 第 9 項：證據驗證與鎖住橫幅

供筆電 Claude 整合，謝謝您接續驗收。

- 做了什麼：每秒讀取 `/api/evidence/verify` 與 `/api/lockdown`。驗證完整顯示筆數與六碼指紋；遭改動顯示紅字與筆次。鎖住時主內容頂端出現深墨色橫幅，暫時隱藏授權卡，避免同頁誤顯仍可用。連線失敗保留鎖定提示與紅色驗證結果，不自行判定安全。
- 改了哪些檔案：src/panel/panel.ts、panel.css、evidence-model.ts、qa/bonus-check.ts。
- 怎麼驗（指令＋結果）：`/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107-codex/src/panel/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts` 五項通過，涵蓋完整紀錄、零筆、遭改動位置、缺值及不合法指紋。TypeScript 檢查通過。核對後端 verifyChain 的 brokenAt 為從 1 起算，不另加減。
- 卡住什麼：截圖仍由筆電 Claude 補驗；未改後端或資料庫。
- 下一棒：請補驗面板 1280 與 390 寬。驗證失敗情境請用隔離測試資料，勿改正式資料。有需調整之處請回傳。
