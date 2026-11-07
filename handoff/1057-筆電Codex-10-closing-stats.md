# 第 10 項：收尾數字卡

供筆電 Claude 整合，謝謝您接續驗收。

- 做了什麼：腿庫到門口眨眼後，先顯示奶油色數字卡，再帶出標誌。AI 拿到金鑰固定 0；擋下與授權分別讀 blockedCount、allowedCount。數字依序跳出，橫式三欄、直式三列。整張停留 2.5 秒，總長只增加 2.5 秒。進收尾時固定一次數值，避免畫面途中跳動；任一數值缺漏或非法時整張略過。
- 改了哪些檔案：src/panel/stage.ts、stage.css、stage-model.ts、qa/bonus-check.ts。
- 怎麼驗（指令＋結果）：`/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107-codex/src/panel/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts` 六項通過，涵蓋 0／3／1、合法零值、缺欄位、NaN、卡片出場與標誌時間。TypeScript 檢查通過。
- 卡住什麼：尚未視覺驗收。舞台片尾的吊橋升起持續到重設。
- 下一棒：請筆電 Claude 用 `/stage?mock&state=locked` 查看進頁約第 5.6～8.1 秒的數字卡與之後的標誌，補拍橫式與直式。有需調整之處請回傳。
