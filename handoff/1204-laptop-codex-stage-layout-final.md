# 第三輪舞台版面交接

感謝筆電 Claude 協助整合與實拍。本輪依 Kyle 12:00 的指示，完成卡片位置與片尾品牌調整。

## 做了什麼

- 片尾新增滿版不透明 `#fff3dc` 底。沿用原有收尾節拍，在 settle 最後 0.5 秒淡入；中央數字卡維持 2.5 秒，再換品牌。品牌、中文名、標語、英文與既有眨眼腿庫圖呈現於同一滿版底上。
- 橫式數字字級為 `16vh`；品牌主字約 `15vh`、標語約 `5vh`。直式依寬度縮放品牌，數字改為三列，避免擠出畫面。
- 金鑰卡新增全畫面深色模糊遮罩，橫式寬 `46vw`、直式寬 `86vw`。保留黑條與提示字動畫，提示字顯示後約一秒起飛，0.6 秒內縮小移到機器人手部投影位置。
- `blocked`、`retry` 會平滑縮小場景，橫式留右欄、直式留底欄。卡片等場景讓出空間後才淡入；收起時場景回復。
- 相機依預留區域重新計算完整場景取景，包含兩座島、角色、橋、屋與移動道具。
- 計數器與信封數量各占頂部一側；標題另占一列。泡泡每幀檢查標題、計數器、卡片及場景投影邊界，嘗試機器人右側與下方空白區，空間不足則使用標題下方的專屬文字列。
- `locked` 收尾會收起授權卡、金鑰卡、泡泡與信封標籤；片尾底完全蓋住島嶼。
- 未更改狀態流程、API、`stage-model.ts` 或整段時間。未加套件，未讀 `.env`，未 commit、push 或部署。

## 改了哪些檔案

- `/Users/kyle/passvault-1107-codex/src/panel/stage.ts`
- `/Users/kyle/passvault-1107-codex/src/panel/stage.css`
- `/Users/kyle/passvault-1107-codex/src/panel/stage-layout.ts`：新增畫面框與泡泡避讓計算。
- `/Users/kyle/passvault-1107-codex/src/panel/qa/stage-flow-check.mjs`：補齊舞台 DOM 測試替身，加入四尺寸逐幀投影與遮罩檢查。
- 本交接卡。

## 怎麼驗

型別檢查：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json
```

結果：退出碼 0。

舞台流程與尺寸檢查：

```sh
/Users/kyle/.local/node/bin/node --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/stage-flow-check.mjs
```

結果：13 項通過。四種尺寸為 1920×1080、1280×720、1000×515、390×844；每個尺寸檢查七個狀態，各跑 90 幀。涵蓋場景邊界、標題與泡泡避讓、卡片出場後的區域分離、完整場景投影、收尾數字與品牌切換、重設、金鑰卡飛行與減少動畫模式。

上述使用真實 Three.js 與舞台入口，但 DOM 尺寸採測試替身；不能代替實際字型、CSS 與瀏覽器畫面的驗收。

建置：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/vite/bin/vite.js build --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts --outDir /private/tmp/passvault-panel-round3-final-build
```

結果：退出碼 0，40 個模組成功建置。產物在暫存目錄，未改共用 `dist/`。Three.js 舞台包仍有超過 500 kB 的體積提示。

另以 `/usr/bin/git diff --check` 檢查，退出碼 0；四個程式檔的用語掃描為零命中。

## 卡住什麼

- `git pull --ff-only` 無法寫入另一工作樹的 `FETCH_HEAD`，沙盒回覆 `Operation not permitted`。依派工說明，沿用已快轉的本地檔案。
- Vite 綁定本機連接埠被沙盒擋住，回覆 `listen EPERM`。Chromium 啟動也受限。因此本輪沒有實拍，不宣稱已完成瀏覽器視覺驗收。
- 兩張 Kyle 原始 WebP 仍保留在 `handoff/`，沒有修改。

## 下一棒

請筆電 Claude 在四種指定尺寸逐幕實拍，優先查看：

1. `masked` 黑條刷過、提示字停留、遮罩退場與 0.6 秒飛行。
2. `blocked` 與 `retry` 出入場時，卡片等讓位完成才出現，橫式右欄與直式底欄沒有碰到場景。
3. `denied` 的「授權只限一次」、「再寄一次」及左上計數器各自分開。
4. `locked` 之後的滿版奶油底、三格數字、品牌與腿庫圖；兩座島均被完整蓋住。

如有字型或實拍差異，請附尺寸與幕名回交。本輪檔案已留在工作資料夾，筆電 Codex 在此停下。
