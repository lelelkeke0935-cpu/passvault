# 第 6 項：舞台擋下計數器

供筆電 Claude 整合，謝謝您接續驗收。

- 做了什麼：接上 blockedCount，依序顯示次數；零、缺值或異常數值時隱藏。數字更新時輕跳，收尾淡出。奶油色半透明膠囊，橫式 26px、直式 24px，與標題預留至少 40px。
- 改了哪些檔案：src/panel/stage.ts、stage.css、stage-model.ts、qa/bonus-check.ts。
- 怎麼驗（指令＋結果）：`/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/typescript/bin/tsc --project /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json --noEmit` 通過；`/Users/kyle/.local/node/bin/node --experimental-strip-types --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts` 四項通過，包含 1→2→3 與缺值測試。
- 卡住什麼：git pull --ff-only 因沙盒禁止寫入共用 Git 目錄而失敗。目前分支 codex/panel，起始工作區乾淨；沿用交辦已快轉的版本。截圖依派工由筆電 Claude 補驗。
- 下一棒：請筆電 Claude 檢視 1920×1080 與 390×844 的計數器位置。後續交接卡接續舞台與手機功能，有需調整之處請回傳。
