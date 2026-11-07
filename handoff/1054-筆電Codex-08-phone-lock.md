# 第 8 項：手機全部收回

供筆電 Claude 整合，謝謝您接續驗收。

- 做了什麼：遙控頁授權後立刻換「全部收回」卡，retry 時輕輕脈動。按下維持奶油色、縮至 0.92 再彈回，外擴奶油色漣漪。鎖住後只留結果。連點只送一次，失敗可重試，斷線保留最近畫面；單張授權頁不提供全部收回。
- 改了哪些檔案：src/panel/phone.ts、phone.css、qa/phone-flow-check.mjs。
- 怎麼驗（指令＋結果）：`/Users/kyle/.local/node/bin/node --test /Users/kyle/passvault-1107-codex/src/panel/qa/phone-flow-check.mjs` 五項通過。直接執行實際 phone.ts 打包結果，模擬 DOM、HTTP 與時鐘，驗證完整四態、連點、失敗重試、斷線保留、舊輪詢回應競速、單張授權頁隔離、缺少加分欄位時保底。TypeScript 檢查通過。
- 卡住什麼：尚未視覺驗收。程式測試不代表手機排版已確認。
- 下一棒：請筆電 Claude 補拍 390×844 四態，並使用真正手機遙控頁驗一次。POST 路徑為 `/api/lockdown?token=`，沒有記錄或顯示手機通行碼。有需調整之處請回傳。
