# CLAUDE.md

此檔提供 Claude Code 在本專案工作時的指引。

## 專案概覽

**跑馬燈抽獎機**（Marquee Lottery Machine）是一款 React + TypeScript + Vite 打造的 PWA 抽獎工具，支援多種動畫風格、主題切換、多視窗投影、離線使用。

- **技術棧**：React 19、TypeScript 5.9、Vite 7、Vanilla CSS（無 CSS 框架）
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

## 架構

```
src/
├── App.tsx          # 主元件（含所有遊戲模式 stage、控制邏輯、BroadcastChannel）
├── App.css          # 全部樣式（含 4 主題、動畫 keyframes、RWD）
├── types.ts         # 型別定義（GameMode、ThemeName、DrawItem、AppSettings…）
├── storage.ts       # localStorage 讀寫 + 預設值
├── randomEngine.ts  # 加權隨機（crypto.getRandomValues 為基礎）+ 名單解析
├── fx.ts            # Web Audio 合成音 + Vibration API
├── main.tsx         # React 入口 + Service Worker 註冊
public/
├── sw.js            # Cache-first Service Worker
├── manifest.webmanifest
└── icon.svg
```

### 重點設計決策

1. **單檔 App.tsx**：刻意維持單檔以利通讀，所有 stage 子元件（`MarqueeStage`、`WheelStage`、`SlotStage`、`GachaStage`）皆於同檔。如需重構，先確認檔案大小與可讀性的取捨。
2. **`crypto.getRandomValues`**：所有隨機決策（抽獎、洗牌、轉盤抖動）都走 Web Crypto，避免 `Math.random` 的可預測性。
3. **BroadcastChannel 雙視窗同步**：`?display=1` 為純展示視窗，控制視窗發送 `SYNC`/`DRAW` 訊息；display 視窗收到 `DRAW` 後重播動畫。
4. **localStorage v1 schema**：`marquee-lottery-machine:v1`。改動 `PersistedState` 形狀時，需在 `loadState` 內維持向後相容（fallback 預設值）。
5. **CSS 主題變數**：`--accent`、`--accent-2`、`--accent-3` 由 `.theme-{name}` class 控制，子元件全部使用 CSS 變數，新增主題只要加一個 class 區塊。
6. **動畫由 `setTimeout` 鏈組成**：所有 timer ID 統一收進 `timeoutsRef` / `intervalsRef`，`clearMotionTimers()` 一次清除，避免抽獎中斷後殘留 timer。

## 程式碼慣例

- 元件採函式式 + Hooks，不使用 class component。
- 不使用 CSS Modules / styled-components，所有樣式集中於 `App.css`。
- 圖示一律使用 `lucide-react`。
- 型別定義集中於 `types.ts`，不在元件內 inline 定義對外型別。
- 字串直接硬編中文（暫無 i18n）。
- 嚴禁 `any` 與 `as unknown as T` 跳過型別檢查。

## 已知限制 / 待改進

- Service Worker 採用簡易 cache-first，版本更新時需手動清快取。
- 無單元測試與 e2e 測試。
- 介面文字未抽離 i18n bundle。
- 名單存於 localStorage，無雲端備份。

## 修改提示

- 變更 `AppSettings` 形狀：同步更新 `types.ts` + `storage.ts:defaultSettings` + `App.tsx` 內初始化邏輯。
- 新增遊戲模式：`types.ts:GameMode` + `App.tsx:modeOptions` + `ModeStage` switch + 對應 `animateXxx` 函式 + CSS。
- 新增主題：`types.ts:ThemeName` + `App.tsx:themeOptions` + `App.css:.theme-xxx`。
- 動畫測試：dev server 啟動後在瀏覽器手動驗證；無自動化視覺回歸。
