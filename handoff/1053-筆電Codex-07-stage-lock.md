# 第 7 項：再次請求與收回舞台

供筆電 Claude 整合，謝謝您接續驗收。

- 做了什麼：retry 停住等待主人，機器人說「我再試試」，腿庫轉頭看手機。locked 使用深墨色標題，腿庫跳到橋頭旁，橋面與繩子繞金庫側支點升起 66 度，橋柱固定；機器人縮身後垂頭，金庫轉盤轉一圈並亮外圈。升橋持續到片尾，R 重設才放下。
- 改了哪些檔案：src/panel/stage.ts、stage.css、stage-model.ts、mock.ts、qa/bonus-check.ts。
- 怎麼驗（指令＋結果）：`/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/typescript/bin/tsc --project /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json --noEmit` 通過；`/Users/kyle/.local/node/bin/node --experimental-strip-types --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts` 四項通過，確認 denied 第 8 秒才收尾、retry 不自行收尾、升橋方向與保持角度、重設角度。
- 卡住什麼：截圖依派工由筆電 Claude 補驗，未宣稱視覺通過。無新增套件。
- 下一棒：請測 `/stage?mock&state=retry` 停住，L 收回、R 重設；四個舞台快捷鍵都沿用只存記憶體的 X-Stage-Token。mock 已接入 retry 並跨分頁取消過期劇情計時，請連同手機頁驗收。有需調整之處請回傳。
