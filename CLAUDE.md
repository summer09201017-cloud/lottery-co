# CLAUDE.md

此檔提供 Claude Code 在本專案工作時的指引。

## 專案概覽

**跑馬燈抽獎機**（Marquee Lottery Machine）是一款 React + TypeScript + Vite 打造的 PWA 抽獎工具，支援多種動畫風格、主題切換、多視窗投影、離線使用，並已整合圖片名單、抽 N 名、倒數、撤銷、CSV 匯出、QR、OBS、大字幕、點擊翻牌等進階功能。

- **技術棧**：React 19、TypeScript 5.9、Vite 7、Vanilla CSS（無 CSS 框架）、qrcode lib
- **執行平台**：瀏覽器（桌面 + 行動），可安裝為 PWA
- **語系**：繁體中文（介面文字硬編於元件內）

## 開發指令

```bash
npm install       # 第一次執行前安裝依賴（產生 node_modules/）
npm run dev       # 啟動 Vite dev server（host 0.0.0.0，可區網訪問）
npm run build     # tsc 型別檢查 + Vite production build → 輸出到 dist/
npm run preview   # 在本機啟動 dist/ 的靜態伺服器
```

> 沒有 lint / test 指令。如需驗證型別正確性，執行 `npx tsc --noEmit`。

## 在本機開啟網站

### 0. 一鍵啟動（Windows）

雙擊根目錄 `start.bat`：

- 自動偵測 Node.js（找不到會提示去 nodejs.org 下載）
- 第一次執行自動跑 `npm install`
- 啟動 `npm run dev -- --open`，瀏覽器自動開啟 `http://localhost:5173/`
- 視窗為 UTF-8 codepage，中文不亂碼

### 1. 開發模式（即時熱重載，最常用）

```bash
npm run dev
```

啟動後會看到類似：

```
  VITE v7.3.2  ready in 412 ms
  ➜  Local:    http://localhost:5173/
  ➜  Network:  http://192.168.x.x:5173/
```

打開瀏覽器進入：

| 用途 | 網址 |
|---|---|
| 主畫面（控制端） | `http://localhost:5173/` |
| 純投影視窗（給投影機用） | `http://localhost:5173/?display=1` |
| OBS 透明背景模式（直播疊圖） | `http://localhost:5173/?obs=1` |
| 觀眾彩蛋模式（任意鍵觸發歡呼） | `http://localhost:5173/?cheer=1` |
| 載入分享名單 | `http://localhost:5173/?list=<base64>&mode=marquee&theme=neon` |
| 行動裝置區網訪問 | 用 `Network` 那行 IP 在手機瀏覽器開啟 |

> 區網 IP 訪問需要手機與電腦在同一 Wi-Fi。Windows 防火牆若擋下要在「私人網路」放行 Node.js。

### 2. 預覽 production build

```bash
npm run build      # 先打包
npm run preview    # 啟動 preview server（預設 http://localhost:4173/）
```

`preview` 模式才是 Service Worker / PWA 安裝按鈕真正生效的環境，dev mode 下 SW 已被排除。

### 3. 中斷與重啟

- 在 PowerShell / Terminal 視窗按 `Ctrl + C` 停止 dev server。
- 如果 port 5173 被佔用：`Get-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess` 找出佔用程式後手動關閉，或在 `vite.config.ts` 改 `server.port`。

### 4. 安裝為桌面/手機 App（PWA）

1. 跑 `npm run preview`
2. Chrome/Edge 右上角網址列會出現「安裝」圖示，或在主畫面點「安裝」按鈕
3. 安裝後可離線使用（Service Worker 已快取靜態資源）

### 5. 雙視窗投影流程

1. 開主視窗 `http://localhost:5173/` → 拖到操作螢幕
2. 點右上角 `MonitorUp` 圖示 → 自動開啟 `?display=1` 純展示視窗
3. 把展示視窗拖到投影機螢幕並按全螢幕（`F11` 或右上角全螢幕鈕）
4. 主視窗按「開始抽獎」，動畫會同步在投影視窗播放（透過 BroadcastChannel）
5. 若主視窗開啟「點擊翻牌」，**投影視窗會自動 fallback 走逐張揭曉動畫**，避免被卡在等待點擊

## 玩法與主題

- **遊戲模式**（`GameMode`）：`marquee`（跑馬燈）/ `wheel`（轉盤）/ `slot`（拉霸）/ `gacha`（抽卡盲盒）
- **主題**（`ThemeName`）：`neon`（霓虹電玩）/ `temple`（廟口籤筒）/ `casino`（賭場拉霸）/ `future`（科技大螢幕）/ `sakura`（櫻花飄雪，含 `<SakuraLayer>` 動態飄落花瓣）

## 進階功能

| 功能 | 入口 | 關鍵實作 |
|---|---|---|
| 圖片名單（每筆附縮圖） | 名單欄位「圖片」按鈕；左下「批次匯入圖片」可整批上傳 | `compressImage` 自動壓 256×256 JPEG，存於 `DrawItem.image` |
| 抽 N 名（1/3/5/10/全部） | 「效果」區數字輸入 + 預設按鈕 | `weightedPickN` 不重複加權抽取，多得主排成 `winners-row` |
| 倒數（0/3/5 秒） | 「效果」區下拉 | `startDrawWithCountdown` → `setInterval` 倒數 → `runDraw()` |
| 撤銷上一次 | 「紀錄」區 | `undoLastDraw` 用 `batchId` 一次撤一整批連抽 |
| CSV 匯出歷史 | 「紀錄」區 | `exportHistoryCsv` UTF-8 BOM + CRLF |
| QR Code 分享 | 上方 `QrCode` 圖示 | 透過 `qrcode` 套件 `generateQrSvg` 產生純 SVG，無外部 API 依賴 |
| OBS 透明背景 | URL `?obs=1` | `.obs-mode` 移除 panel 與背景，便於直播疊圖 |
| 觀眾彩蛋 | URL `?cheer=1` | 任意鍵觸發 `playCheer` 多音歡呼 |
| 大字幕得獎走馬燈 | 抽中時自動觸發 | `bannerKey/bannerName` 橫向飛過全螢幕後淡出 |
| 抽獎中鎖定編輯 | 自動 | `editingDisabled = isDrawing \|\| countdownRemaining !== null` 阻擋名單修改 |
| 點擊翻牌（gacha） | 「效果」區 `MousePointerClick` 圖示，預設 ON | 見下方〈點擊翻牌〉專節 |

## 架構

```
src/
├── App.tsx          # 主元件（含所有 stage、控制邏輯、BroadcastChannel）— ~1900 行
├── App.css          # 全部樣式（含 5 主題、動畫 keyframes、RWD）— ~1600 行
├── types.ts         # 型別定義（GameMode、ThemeName、DrawItem、AppSettings…）
├── storage.ts       # localStorage 讀寫 + 預設值（saveState 失敗時自動剝除圖片重試）
├── randomEngine.ts  # 加權隨機（crypto.getRandomValues 為基礎）+ weightedPickN + parseImportText + compressImage
├── fx.ts            # Web Audio 合成音 + Vibration API + playCheer 多音歡呼
├── qr.ts            # generateQrSvg：用 qrcode lib 直接產 SVG 字串
├── main.tsx         # React 入口 + Service Worker 註冊
public/
├── sw.js            # Cache-first Service Worker
├── manifest.webmanifest
└── icon.svg
start.bat            # Windows 一鍵啟動腳本
```

### 重點設計決策

1. **單檔 App.tsx**：刻意維持單檔以利通讀，所有 stage 子元件（`MarqueeStage`、`WheelStage`、`SlotStage`、`GachaStage`、`SakuraLayer`）皆於同檔。檔案逼近 2000 行，未來若再大幅擴張要評估拆檔。
2. **`crypto.getRandomValues`**：所有隨機決策（抽獎、洗牌、轉盤抖動）都走 Web Crypto，避免 `Math.random` 的可預測性。
3. **BroadcastChannel 雙視窗同步**：`?display=1` 為純展示視窗，控制視窗發送 `SYNC`/`DRAW` 訊息；display 視窗收到 `DRAW` 後重播動畫。**display-only 模式強制走自動動畫**（即使 host 開了點擊翻牌），避免投影端卡住。
4. **localStorage v1 schema**：`marquee-lottery-machine:v1`。改動 `PersistedState` 形狀時，需在 `loadState` 內維持向後相容（fallback 預設值）。`saveState` 在 quota 爆量時會自動剝除圖片再存一次並回報 `{ ok: false, error }`。
5. **CSS 主題變數**：`--accent`、`--accent-2`、`--accent-3` 由 `.theme-{name}` class 控制，子元件全部使用 CSS 變數，新增主題只要加一個 class 區塊。
6. **動畫由 `setTimeout` 鏈組成**：所有 timer ID 統一收進 `timeoutsRef` / `intervalsRef`，`clearMotionTimers()` 一次清除，避免抽獎中斷後殘留 timer。
7. **連抽逐張揭曉**：`gachaRevealIds: string[]`（複數）+ `buildGachaDeck(pool, winnersList)` 把所有得主放進牌組，`animateGacha` 依 `revealStep` 間隔逐張揭露。
8. **撤銷一整批**：連抽 record 共用同一 `batchId`，`undoLastDraw` 以 batchId 一次清整批並還原 `drawn` 狀態。

### 點擊翻牌（gacha）

設計思路：抽獎時**先決定 N 位得主但不指定卡片位置**，使用者點哪張卡，那張就翻出佇列裡下一位得主——強化「我自己抽的」儀式感。

- 設定：`AppSettings.clickToFlip`，預設 `true`，可在「效果」區關閉退回自動逐張揭曉。
- 狀態：
  - `pendingWinners: DrawItem[]` — 已選但尚未揭曉的得主佇列
  - `revealedAssignments: Record<cardId, DrawItem>` — 點擊位置 → 揭曉的得主
  - `allWinnersForDraw: DrawItem[]` — 給最後 `finishDraw` 用的完整名單
  - `drawContextRef` — 緩存 mode/poolSize/sourceSettings 給延後的 `finishDraw`
- 流程：
  1. 點擊「開始抽獎」→ `runDraw` gacha 分支判斷 `clickToFlip && !isDisplayOnly`，若是則：
     - 用 `shuffleDrawItems(playable).slice(0, deckSize)` 鋪一副**蓋牌（不放真正得主）**
     - 把 `pendingWinners` / `allWinnersForDraw` 設好，**不呼叫 `animateGacha`，立刻 return**
  2. 使用者點任一蓋牌 → `handleGachaCardTap(cardId)` pop 第一位 pending → 寫入 `revealedAssignments[cardId]` → 該卡 CSS 翻轉
  3. 翻完最後一張時 → `addTimeout(finishDraw(allWinnersForDraw, ...), 900)` 延 0.9 秒結算（給最後翻牌動畫時間）
- 視覺：
  - `.gacha-stage.is-click-mode` 啟用 `gachaInvite` 邀請動畫（取代 shuffle）
  - `.gacha-card.is-interactive` 設 `cursor: pointer` + hover lift
  - 卡牌正面內容由 `revealedAssignments[card.id] ?? card` 決定（蓋牌時不會洩漏真正得主）
- 鍵盤：每張卡 `tabIndex={0}` + `Enter`/`Space` 觸發翻牌，附 `aria-label="點擊翻牌"`

## 程式碼慣例

- 元件採函式式 + Hooks，不使用 class component。
- 不使用 CSS Modules / styled-components，所有樣式集中於 `App.css`。
- 圖示一律使用 `lucide-react`。
- 型別定義集中於 `types.ts`，不在元件內 inline 定義對外型別。
- 字串直接硬編中文（暫無 i18n）。
- 嚴禁 `any` 與 `as unknown as T` 跳過型別檢查。

## 已知限制 / 待改進

- Service Worker 採用簡易 cache-first，版本更新時需手動清快取（沒有 `skipWaiting + clientsClaim`）。
- 無單元測試與 e2e 測試；動畫無視覺回歸保護。
- 介面文字未抽離 i18n bundle。
- 名單存於 localStorage，無雲端備份；圖片過多會觸發 quota，`saveState` 會 fallback 剝除圖片。
- localStorage schema 沒有 migration 機制，未來改 `AppSettings` 形狀時舊資料會被預設值合併覆蓋。
- 動畫 timer 是 `setTimeout` 鏈，要做暫停/快轉會比較痛。

## 修改提示

- **變更 `AppSettings` 形狀**：同步更新 `types.ts` + `storage.ts:defaultSettings` + `App.tsx` 內初始化邏輯（`useState<AppSettings>(...)` + 設定面板 UI）。
- **新增遊戲模式**：`types.ts:GameMode` + `App.tsx:modeOptions` + `ModeStage` 分支 + 對應 `animateXxx` 函式 + `runDraw` 分派 + CSS。
- **新增主題**：`types.ts:ThemeName` + `App.tsx:themeOptions` + `App.css:.theme-xxx`，必要時加裝飾層元件（如 `SakuraLayer`）。
- **新增 URL 模式**（如 `?obs=1`）：在 `App.tsx` 上方解析 `urlParams` → 加 `is-xxx-mode` class → `App.css` 對應樣式。
- **動畫測試**：dev server 啟動後在瀏覽器手動驗證；無自動化視覺回歸。
- **跨視窗同步**：若新功能需要在 host 與 `?display=1` 之間同步即時狀態，記得在 `BroadcastChannel` 訊息協議加新 type 並更新 host/display 兩端 handler；display-only 模式對某些 host-only 功能要 fallback（如點擊翻牌走自動動畫）。
- **圖片功能**：圖片以 base64 dataURL 存進 `DrawItem.image`，記得 quota 風險與 `saveState` 失敗回報的 `notice`。
