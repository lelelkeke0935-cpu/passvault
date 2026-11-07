# 第二輪最終交接：第 6～10 項

本卡供筆電 Claude 收件與整合，謝謝您接續現場驗收。

## 做了什麼

第 6～10 項程式已完成：舞台擋下計數器、retry 與 locked、L／R 快捷鍵、手機全部收回、面板紀錄驗證與鎖住橫幅、收尾數字卡。每項另有一張交接卡。

重要行為已驗：retry 不自行放行或收尾；denied 到第 8 秒才保底收尾；橋面與繩子升起 66 度，橋柱固定；腿庫離開橋面；片尾保持升橋，R 重設才落下。數字卡額外使用 2.5 秒；缺少任一數值就略過。手機連點只發一次收回請求，延遲的舊輪詢不能覆蓋成功結果。

## 改了哪些檔案

所有程式變更均在 `/Users/kyle/passvault-1107-codex/src/panel/`：

- stage.ts、stage.css、stage-model.ts、mock.ts。
- phone.ts、phone.css。
- panel.ts、panel.css、evidence-model.ts。
- qa/bonus-check.ts、qa/phone-flow-check.mjs、qa/stage-flow-check.mjs。

另新增 handoff/ 的五張分項卡與本卡。沒有改 package.json、後端、Git 設定或部署檔，沒有新增套件。

## 怎麼驗（指令＋結果）

型別檢查通過：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/typescript/bin/tsc --project /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json --noEmit
```

24 項測試全部通過：

```sh
/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107-codex/src/panel/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/contract-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/transport-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/phone-flow-check.mjs /Users/kyle/passvault-1107-codex/src/panel/qa/stage-flow-check.mjs
```

手機測試執行實際入口打包結果，模擬 DOM、HTTP 與時鐘。舞台測試執行實際入口與 Three.js 場景物件，模擬 GPU、圖片載入、DOM、HTTP 與時鐘；涵蓋動畫時序、固定橋柱、升橋方向、片尾數字、L／R 標頭、減少動態效果及缺值保底。這些不等同瀏覽器排版或真實後端串接驗收。

正式模式打包通過，39 個模組、4 個 HTML 入口與角色素材均輸出：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/vite/bin/vite.js build --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts --outDir /private/tmp/passvault-panel-bonus-final
```

測試打包放在暫存目錄，未覆寫工作區原 dist。正式設定仍沿用 dist/panel/。`git diff --check` 通過；逐檔禁語與授權用詞掃描無命中。

## 卡住什麼

起始分支為 codex/panel，工作區乾淨。git pull --ff-only 因沙盒無法寫共用 Git 目錄的 FETCH_HEAD 而失敗，因此沿用派工已快轉的現有版本。沒有 commit、push、合併或部署。

依派工不拍截圖。未宣稱橫直式畫面或公開網址已通過驗收，真實手機串接留給總整合。

## 下一棒

請筆電 Claude 逐檔收件，代為 commit、整合與部署，並補驗：

1. 舞台 1920×1080、390×844：計數器 1→2→3；retry 停住；L 後升橋、轉盤與外圈；收尾 0／3／1；R 回 idle。計數器與大字間隔、角色與授權提示是否遮擋，也請一起查看。
2. 手機 390×844：等待、待授權、全部收回、已全部收回四態；retry 脈動；按下奶油色漣漪；網路失敗可重試。單張授權頁不出現全部收回。
3. 面板 1280 與 390 寬：完整紀錄指紋、隔離資料的遭改動紅字、鎖住深墨色橫幅。
4. 真實 API 跑完整段，確認手機按鈕與舞台同步，並計時仍在 60 秒內。

快速預覽可用 `/stage?mock&state=retry`，按 L 收回；直接開 `/stage?mock&state=locked`，進頁約第 5.6～8.1 秒顯示數字卡。手機可用 `/m/remote?mock&state=retry`。這些網址不含主人通行碼。

本輪交件到此，筆電 Codex 停止修改。有需調整之處，請另開下一輪派工。
