# 第四輪舞台交接

感謝筆電 Claude 協助實拍。本輪修正三項退件，提供檔案與量測結果，供四尺寸複驗。

## 做了什麼

- 泡泡改用機器人圖像的實際投影頂端定位，水平置中，卡身距頭頂 16 px，尾巴朝下。只有頂端標題或計數器碰到泡泡時，才改放頭部右側，尾巴朝左。取消角落與下方備援位置。
- `×50` 每幀跟隨信封右上角，位於信封頂端上方 12 px。信封隱藏、離開可見區域或進入片尾時，標記同步隱藏。
- 相機以各物件的實際幾何範圍取景，納入角色、信封及附屬文字所需空間。取消泡泡占用的整排空白，標題與計數器能共列時共列。矮橫式的間距改為 16 px，其他橫式維持 20 px。
- 直式泡泡最多寬 112 px，必要時換行；直式信封高度為 1.05 個場景單位，數量標記字級為 14 px。
- 為避免退返信封穿過頭頂泡泡，回程改落在機器人右前方。保留原本第 2 秒開始返回、第 4 秒後隱藏的節拍，僅調整空間路線。
- 保留金鑰全畫面遮罩與片尾奶油底、品牌、腿庫。狀態、API、流程與秒數未變；沒有增加套件。

## 改了哪些檔案

- `/Users/kyle/passvault-1107-codex/src/panel/stage.ts`
- `/Users/kyle/passvault-1107-codex/src/panel/stage-layout.ts`
- `/Users/kyle/passvault-1107-codex/src/panel/stage.css`
- `/Users/kyle/passvault-1107-codex/handoff/1216-laptop-codex-stage-round4-final.md`

## 怎麼驗（指令＋結果）

型別檢查：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/typescript/bin/tsc --noEmit -p /Users/kyle/passvault-1107-codex/src/panel/tsconfig.json
```

結果：退出碼 0。

既有流程檢查：

```sh
/Users/kyle/.local/node/bin/node --test /Users/kyle/passvault-1107-codex/src/panel/qa/bonus-check.ts
/Users/kyle/.local/node/bin/node --test --test-name-pattern='actual stage|masked presentation' /Users/kyle/passvault-1107-codex/src/panel/qa/stage-flow-check.mjs
```

結果：6 項與 3 項通過。涵蓋計數、等待、升橋、收尾、重設、減少動畫模式與金鑰卡飛行。另直接檢查 `placeBubble` 的上方定位與右側避讓，均通過。

本輪幾何量測：

```sh
/Users/kyle/.local/node/bin/node /private/tmp/passvault-round4-check.mjs
/Users/kyle/.local/node/bin/node /private/tmp/passvault-round4-motion.mjs
```

結果：退出碼均為 0。沿用既有測試替身，執行真實舞台程式與 Three.js 投影；DOM 字卡尺寸以 CSS 推估，並非瀏覽器實測。兩座島的圓柱頂點投影寬度如下；吊橋在兩島之間，未增加額外寬度。

| 尺寸 | blocked／卡片左區 | denied／全畫面 | retry／卡片左區 |
| --- | ---: | ---: | ---: |
| 1920×1080 | 80.4% | 75.7% | 81.9% |
| 1280×720 | 78.5% | 71.9% | 80.4% |
| 1000×515 | 76.5% | 62.5% | 78.5% |

以上在各狀態進入後約 1.44 秒量測。三個橫式尺寸均通過 75%／60% 門檻。390×844 亦檢查泡泡頭頂位置及信封標記附著。

動態檢查涵蓋四尺寸的 blocked、allowed、sent、denied、retry，各跑 300 幀，共 6,000 幀。檢查泡泡與信封、泡泡與數量標記、數量標記與角色投影框的交疊，皆為零；標記可見性同步檢查通過。這些幾何結果不能取代瀏覽器實拍。

既有 `stage-flow-check.mjs` 的四尺寸舊版面案例，要求泡泡完全位於畫布之外，也要求舊的大立方體全部入鏡，與本輪貼頭頂及緊密取景要求不同。本輪未執行這四項舊斷言，亦未改動 QA 檔案。

建置：

```sh
/Users/kyle/.local/node/bin/node /Users/kyle/passvault-1107-codex/src/panel/node_modules/vite/bin/vite.js build --config /Users/kyle/passvault-1107-codex/src/panel/vite.config.ts --outDir /private/tmp/passvault-panel-round4-final-build
```

結果：40 個模組成功建置，未改共用 dist。Three.js 舞台包仍有超過 500 kB 的體積提示。

`/usr/bin/git diff --check` 通過；三個舞台檔與本交接卡完成用語掃描，零命中。

## 卡住什麼

- `git pull --ff-only` 無法寫入另一工作樹的 FETCH_HEAD，回覆 `Operation not permitted`。修改前分支為 `codex/panel`，工作目錄乾淨；沿用本機版本。
- Vite 本機埠受限，回覆 `listen EPERM`；Chromium 啟動亦被沙盒拒絕。因此本輪沒有新的實拍截圖，尚待瀏覽器視覺驗收。

## 下一棒

請筆電 Claude 在 1920×1080、1280×720、1000×515、390×844 實拍複驗。除六格總覽外，請查看 denied 第 2 至 4 秒、sent 移動期間，以及出入授權卡的過渡畫面。請以真實字型重測比例，並更新沿用舊版面規則的 QA 斷言。

檔案已留在工作資料夾，未 commit、push、合併或部署。筆電 Codex 在此停下；如需調整，請附尺寸與狀態回交。
