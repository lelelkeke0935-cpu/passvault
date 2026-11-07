# 推庫面板交付說明

感謝整合夥伴接手。本資料夾包含舞台與面板的必做版程式。

## 頁面

- `/`：保險箱、授權卡、證據區。
- `/stage`：腿庫小島。
- `/m/grants/:id?token=`：單張手機授權。
- `/m/remote?token=`：固定手機遙控。

只有網址帶 `?mock` 才使用合成資料。沒有 `mock` 時直接呼叫約定 API，失敗也不切換到假資料。
測試固定狀態可使用 `?mock&state=blocked`。
不指定 state 的 mock 頁面會透過 localStorage 同步合成舞台狀態。
localStorage 只保存合成中繼資料，不保存使用者輸入的內容或通行碼。

## 建置

整合到主專案後使用根目錄原有的 Vite 設定，輸出仍為 `dist/panel/`。
`src/panel/vite.config.ts` 是這個隔離工作資料夾的本機驗證設定。
`src/panel/node_modules` 是指向既有套件的本機連結，已忽略，不要收進版本。
沒有更改 package.json、package-lock.json，也沒有安裝或更換套件。

本機預覽指令：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/vite/bin/vite.js --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts
```

預覽網址為 http://127.0.0.1:5177/ 。

## 已驗證與未驗證

- TypeScript 檢查：通過，包含額外檢查 QA 的 TypeScript 檔。
- Vite 正式建置：通過，四個 HTML 與 19 張 WebP 均有輸出。
- Node 資料與傳輸測試：11 項通過。
- 舞台橫式初版：已在 Chrome 查看並拍照，截圖位於 qa/stage-desktop.png。
- 截圖視口為 1920×1080，DPR 為 2；圖片為 3840×2160。
- 截圖之後已調整燈光、手機鏡頭、信封標記與屋體；新版尚未補拍。
- 1280 與 390 寬面板、手機點按與動畫逐段驗收：尚未完成。
- 完整 60 秒彩排、真實 API、實機手機同步、加密與外洩證據：需整合端驗證。

瀏覽器截圖與互動檢查腳本：`qa/browser-check.mjs`。
此腳本已準備，因瀏覽器啟動受限而未成功執行。
它會產出指定尺寸截圖，並檢查授權、拒絕、上傳與擋下停住。
所有測試輸入都是假資料；不要把真實通行碼加到測試網址。

## 功能界線

目前完成的是必做版程式，尚未宣告必做驗收通過。
手機授權後停在「已授權，只限這一次」。
加分 #24 計數器、#4 吊橋收回與按鈕、#21 紀錄指紋及收尾數字卡尚未開始。
舞台目前支援到 denied 後的保底收尾；請勿先接啟用 retry／locked 的完整加分劇本。
必做驗收通過後，才能開始加分項。若超過 13:45，依凍結規則交由整合端決定。

請依 handoff/ 的逐段交接卡核對；若介面有異動，請先回傳約定差異。
