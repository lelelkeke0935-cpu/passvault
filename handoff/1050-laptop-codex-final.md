# 筆電 Codex 最終交接

感謝筆電 Claude 接手整合。必做版程式已留在工作資料夾，尚未完整驗收。

## 做了什麼

- 舞台優先完成必做版：小島、吊橋、金庫、角色換圖、開場收納、假金鑰刷黑、擋下等待、授權放行、單次失效與保底收尾。
- 面板有四類列表、搜尋、拖放、密碼及金鑰輸入、加密確認與容量顯示。
- 授權卡與證據區每秒輪詢，最近紀錄使用約定的 ProxyLog 欄位。
- 單張手機授權與固定遙控頁已寫好。包含重複點按防護、舊輪詢防覆蓋、過期狀態與 Wake Lock。
- 舞台通行碼只在記憶體；手機保留原有固定網址以支援重新整理。不在畫面、儲存空間或紀錄輸出通行碼。
- 真實 API 與 ?mock 明確分開；連不上時不切成假資料。

## 改了哪些檔案

僅 src/panel/ 與 handoff/。
沒有改 package.json、package-lock.json、server.ts 或其他成員目錄。
完整檔案說明見 src/panel/README.md。
建置產物為 dist/panel/，由原有伺服器靜態路由提供。
src/panel/node_modules 是本機驗證用連結，已忽略，請勿收進版本。

## 怎麼驗（指令＋結果）

- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json`：通過。
- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/vite/bin/vite.js build --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts`：通過，四個 HTML 與 19 張 WebP 產出完成。
- `/Users/kyle/.local/node/bin/node --import /Users/kyle/passvault-1107/node_modules/tsx/dist/loader.mjs --test /Users/kyle/passvault-1107-codex/src/panel/qa/contract-check.ts /Users/kyle/passvault-1107-codex/src/panel/qa/transport-check.ts`：11 項通過。
- 額外以 TypeScript 檢查 src/panel/qa/*.ts：通過。
- 四個建置後頁面都回 HTTP 200，HTML 有正確模組入口。
- 所有 HTML 引用的建置資源都存在。
- 中文用語逐檔掃描：0 筆違規。
- `git diff --check`：通過。
- 初版舞台已在 Chrome 親眼查看。截圖：src/panel/qa/stage-desktop.png。

注意：11 項是資料與傳輸測試，不是必做七項的整合驗收。

## 卡住什麼

1. `git pull --ff-only` 被沙盒擋住 FETCH_HEAD 寫入。沒有 commit、push 或合併。
2. Playwright 啟動被 macOS 沙盒擋住；原生 Chrome 操作服務隨後也中斷，重連仍失敗。
3. 只拍到初版舞台橫式。視口 1920×1080、DPR 2，圖片 3840×2160；後續燈光、手機鏡頭與屋體調整尚未補拍。
4. 面板 1280／390、舞台 390×844、手機四種狀態截圖與實際點按仍待驗。
5. 真實 API、手機同步、完整 60 秒彩排與加密／外洩驗收需由整合端進行。

## 下一棒

請先整合 src/panel/，沿用主專案根目錄的 Vite 設定建置。
本機已留下建置版預覽：http://127.0.0.1:5177/ 。舞台可開 /stage?mock&state=blocked。

請在可啟動 Chromium 的環境執行：

`/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/qa/browser-check.mjs`

此腳本尚未成功執行。它使用假資料，補拍指定尺寸並檢查授權、拒絕、上傳與擋下停住。
請逐張親眼查看，再做真實 API 與實機手機彩排。

加分 #24、#4、#21 與收尾數字卡尚未開始，因必做尚未完整通過。
目前遙控頁授權後停在「已授權，只限這一次」；舞台支援 denied 後保底收尾。
請勿直接接上 retry／locked 加分劇本。需等必做驗收通過，再依 13:45 凍結規則安排。

程式與逐段交接卡皆已留存。若整合時有差異，請回傳具體狀態與約定欄位，謝謝。
