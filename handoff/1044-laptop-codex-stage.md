# 舞台必做版交接

感謝整合夥伴接手。這張卡記錄舞台必做版。

## 做了什麼

- 從零建立 three.js 小島、吊橋、金庫屋與三輻轉盤。
- 19 張 WebP 素材先載入，再揭開舞台。
- 狀態涵蓋 idle、intro、masked、blocked、allowed、sent、denied。
- blocked 停住等授權；denied 播完 6 秒，再等 2 秒接收尾。
- 展示用假金鑰先停 1 秒，刷黑後才出現說明。
- 舞台通行碼使用密碼欄位，只留在頁面記憶體。
- 空白鍵開場與 A 鍵授權，都帶 X-Stage-Token。
- 真實 API 每 300 毫秒查詢；只有 ?mock 走假資料。

## 改了哪些檔案

- src/panel/stage.html、stage.ts、stage.css。
- src/panel/types.ts、common.ts、mock.ts。
- src/panel/assets/stage/ 共 19 張圖片及 meta.json。
- src/panel/vite.config.ts、tsconfig.json、.gitignore 為獨立驗證設定。
- src/panel/qa/stage-check.mjs、stage-desktop.png。

## 怎麼驗（指令＋結果）

- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json`：通過。
- `/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107/node_modules/vite/bin/vite.js build --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts`：通過，輸出 dist/panel/。
- Chrome 原生介面開啟 `/stage?mock&state=blocked`：小島、角色、授權卡與紅色大字可見。
- Chrome 1920×1080 視口截圖已留存；螢幕倍率為 2，圖片實際為 3840×2160。
- 截圖已親眼查看。初版光線偏亮，後續調低燈光；截圖尚待更新。

## 卡住什麼

- `git pull --ff-only` 遭沙盒拒絕寫 FETCH_HEAD，沒有更新分支、commit 或 push。
- Playwright 啟動遭 macOS 沙盒拒絕 MachPortRendezvousServer。
- 改用原生 Chrome 拍到橫式截圖後，電腦操作服務回傳 native pipe startup failed。
- 390×844 舞台截圖與動畫逐段實測待補。
- 尚未取得完整系統必做七項的通過證據，加分項未開始。

## 下一棒

請筆電 Claude 整合面板檔案，沿用根目錄 vite.config.ts 建置。
本機 src/panel/node_modules 是驗證用連結，不要收進版本。
請協助補齊手機截圖與真實 API 彩排。若介面需調整，請回傳具體情境。
