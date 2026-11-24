# 香水櫃 交接文件

> 最後更新：2026-11-24。上線版號顯示在 App 上方。
> 給接手的開發者或 AI（例如 Codex）。改程式前請先讀完「0. 先讀這裡」和「2. 推薦邏輯」。

---

## 0. 先讀這裡：使用者已經決定的事

**以下是使用者刻意拿掉的，不要再加回或建議加回：**
- 推薦的「輪替」：最近噴過扣分、很久沒噴加分（commit `423de61`）
- 剩量「少」的香水降低推薦
- 櫃位顯示（第幾排第幾罐）
- 今日卡片上的「取消最後一筆」「標記用完」按鈕（刪紀錄改到紀錄頁，標記用完改到詳情頁）
- 手動調溫度、手動切換雨天（天氣全自動）

**其他規則：**
- 不要使用 Fragrantica 的 Algolia 搜尋金鑰（那是對方網站執行時才取得的，不是公開的）
- 發布會自動產生版號（見第 6 節）。不要手動改 `__APP_VERSION__`。改完要跟使用者回報上線的版號
- 使用者用 iPhone，從主畫面圖示打開 GitHub Pages 版本
- 介面文字一律用繁體中文

---

## 1. 專案概要

- 網址：https://jo830412.github.io/perfume-cabinet/
- 單一網頁 App，所有 HTML、CSS、JS 都在 `index.html`，沒有建置步驟
- repo 裡的檔案：

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個 App |
| `perfumes.json` | 內建 20 支香水、Fragrantica 分數（ratings）、完整資料（details）等網站資料 |
| `towns.json` | 全台 368 個鄉鎮的座標，以及各縣市的氣象署資料代碼 |
| `version.json` | 版號（發布時自動蓋上） |
| `bottle-masks/` | 瓶身圖的去背遮罩（以 Fragrantica ID 命名） |
| `.github/workflows/pages.yml` | 發布流程 |

- 本機測試：上層資料夾 `.claude/launch.json` 裡有 `perfume` 伺服器（`python -m http.server 5199`），開 `http://localhost:5199/web/index.html`。本機版號會顯示「開發中」，也不會檢查更新

---

## 2. 推薦邏輯（本次重點）

程式在 `recommend(today, ctx)`（約第 761 行）。

### 2.1 輸入

- `ctx.temp`、`ctx.wet` 由天氣決定（`weatherForOcc`，約第 418 行）：
  - 約會、夜晚聚會：用晚上（18～24 點）的體感溫度、降雨和濕度
  - 其他場合：用白天（6～18 點）的資料
  - 時段已經過去時，改用「目前」的資料
  - `wet` = 降雨機率 ≥ 50% 或濕度 ≥ 90%
- `ctx.occ`：使用者選的場合，包括 `office`（上班）、`casual`（休閒）、`date`（約會）、`formal`（正式）、`sport`（運動戶外）、`night`（夜晚聚會）
- 推薦和即時使用紀錄共用 `availableToWear(p)`。已用完的香水仍可在歷史紀錄查看與補登。

### 2.2 計分

每支香水把下表各項加總，分數最高的當主推薦。「換一支」是用 `S.offset` 轉動排序。

| 項目 | 規則 | 分數範圍 |
|---|---|---|
| 季節 | 見 2.3 | −3.5 ～ +1.5 |
| 日夜 | `dn` = 晚上場合用 `seasons.night`，其他用 `seasons.day`（缺值 70）；`(dn − 70) × 0.02` | −1.4 ～ +0.6 |
| 舊資料溫度 | 只有沒有 `seasons`、但有 `tMin`/`tMax` 時才用：在範圍內 +2.5，超出每度 −0.45 | — |
| 雨濕 | `wet` 時：`(fresh − 0.4) × 2.5 − heavy × 1.5`；擴散度 ≥ 4.5 再 −1 | 約 −3.5 ～ +1.5 |
| 場合 | **沒設定場合 +1**、符合 +2.5、不符合 −1 | −1 ～ +2.5 |
| 上班太濃 | 上班時，擴散度 ≥ 4.5 −1.5 | −1.5 或 0 |
| 留香久 | 約會、夜晚聚會、正式場合時，持久度 ≥ 4 +0.6 | 0 或 +0.6 |
| 評分 | `(rating − 3) × 0.7`；沒評分當 3，限制在 1～5 | −1.4 ～ +1.4 |
| 每日隨機 | `jitter(today + id) × 0.8`；同一天固定，隔天會變 | ±0.4 |

`fresh` 和 `heavy` 來自 `profile(p)`，用前 6 個香調的比例計算：
- 清爽：`citrus, aquatic, green, fresh, freshspicy, aromatic, herbal, tea, mineral`
- 厚重：`amber, oud, leather, smoky, sweet, vanilla, balsamic, animalic, warmspicy`

### 2.3 季節計分

`seasonWeights(date, temp)` 以冬季 13°C、夏季 30°C、春秋 22°C 計算氣溫權重。春秋共用 22°C 的權重，再按日期平滑分配。春季在 4 月初占 90%，秋季在 10 月初占 90%，全年保留兩季的資料。

計算方式：
- 各代表氣溫的權重 = `exp(−((體感 − 代表氣溫) / 5)²)`。22°C 的權重再乘上對應的春秋比例。
- `fit` = 這支香水各季節適用度的加權平均（0～100，缺值當 70）
- `seasonScore` = `(fit − 70) × 0.05`

內建季節資料來自 Fragrantica 的「何時使用」。每支香水投票最多的季節是 100，其他季節換算成相對比例。Scento 只填列出的季節與時段，編輯只更新變更勾選的欄位。

### 2.4 推薦理由的文字

**主推薦**最多顯示 3 條，依分數影響大小排序：
- 季節：`fit ≥ 80` 時，顯示加權後加分最多的季節，例如「季節適用度加分（秋季 100）」
- 晚上場合、晚上適用度 ≥ 85 時，顯示「晚上適用度 N」
- 雨濕天：「清爽香調適合潮濕天氣」
- 留香久、你給它滿分、你的高分愛用款
- 不寫「適合上班」這類理由，因為使用者已經選了場合，寫出來是重複的
- 一條理由都沒有時寫「綜合今天的天氣與場合排序」

**其他選擇**（`altReasons`，約第 818 行）會跟主推薦比較，寫出它哪裡不一樣，三支盡量不重複：
- 更清爽、更溫暖厚重
- 換個口味：某某調
- 留香比較久、比較輕盈
- 擴散比較強、比較低調
- 你評分比較高
- 缺少可顯示的差異時寫「另一個選擇」。

### 2.5 自動預選場合 `suggestOcc(p)`

| 場合 | 條件 |
|---|---|
| 休閒 | 一律加入 |
| 上班 | 擴散度 ≤ 4，而且厚重比例 < 0.4 |
| 運動戶外 | 清爽比例 ≥ 0.5，而且擴散度 ≤ 4 |
| 約會 | 晚上投票 ≥ 75，或厚重比例 ≥ 0.3 |
| 正式 | 主要香調有 沉香、皮革、琥珀、粉感其中之一，或有木質而且厚重比例 ≥ 0.15 |
| 夜晚聚會 | 晚上投票 ≥ 85，或擴散度 ≥ 4.5 |

什麼時候會用到：
- 新增香水時，表單已經有香調或季節資料（例如從搜尋帶入），而且還沒選場合，就先預選，並在表單顯示「已依香調先選好，可以再調整」
- 儲存時沿用表單裡的場合設定，包括全部取消。補上 Fragrantica 完整資料時保留儲存的場合。

拿內建 20 支來試，自動預選的結果大多和使用者原本的設定相同。

### 2.6 舊版計分對照（commit `3e4fe86`）

| 問題 | 修改前 | 修改後 |
|---|---|---|
| 11 月 21°C 判成哪個季節 | 春天（只看溫度） | 秋天（看月份） |
| 複製一支 Hero、只清空場合，上班排第幾（共 21 支） | 第 19 名 | 第 12 名 |
| 同上，休閒排第幾 | 第 17 名 | 第 10 名 |

修改後，11 月 21°C 上班連續 30 天的主推薦：Bleu de Chanel Parfum 15 天、Orphéon 5 天、Terre 5 天、Hero 4 天、Sur la Route 1 天。這是依網友投票算出來的結果，不是 bug。

### 2.7 已知但沒改的地方

- **主推薦會集中在少數幾支**：因為沒有輪替，同樣條件下 30 天只會輪到 5～7 支。使用者知道這件事，選擇保留
- **晚上打開時**，「上班」用的是現在的體感溫度，不是明天白天的。使用者還沒要求改
- **晚上 11 點後第一次打開，可能抓不到今天的天氣**（推測，未驗證）：`buildWeather` 只取今天日期的逐時資料，沒有就判定失敗。氣象署的資料從下一個整點開始，所以 23 點以後可能沒有今天的資料

---

## 3. 資料格式

### 3.1 手機上的資料（localStorage `perfume-cabinet-v1`）

```js
{
  perfumes: { [id]: { ...香水欄位, t, b?, del? } },
  wears:    { [id]: { id, date:"YYYY-MM-DD", time?:"HH:MM", perfumeId, occ?, temp?, wet?, t, del? } }
}
```

- 每筆資料都有 `t`（修改時間）。同步時每筆各自比 `t`，新的勝出；刪除是寫入 `del:true`，資料不會真的被移除
- 一天可以記錄多筆（補香）。舊資料是一天一筆、以日期當 id，程式會照樣沿用
- 香水的主要欄位：`brand, name, conc, families, accords:[[key,%]], seasons:{spring,summer,fall,winter,day,night}, strength, longevity, votes, notes, occ:[...], rating, remaining, photo, source（Fragrantica 網址）, own?:"wish"|"tried", triedOn?, detailsVer?`
- `b` = 這支是網站內建的、它的資料版本；使用者自己完整編輯過後就會拿掉

### 3.2 網站資料（`perfumes.json`）

| 欄位 | 內容 |
|---|---|
| `perfumes` | 內建的 20 支 |
| `version` | 版本，改了資料就要換 |
| `ratings` | `{ Fragrantica ID: 分數 }` |
| `details` | `{ Fragrantica ID: { accords, families, seasons, strength, longevity, votes, notes, rating, ver } }` |
| `replaces`、`variants` | Codex 加的版本更正資料 |

合併順序：
1. `Store.mergeBundle`：`version` 改變時更新內建香水，但保留 `USER_FIELDS`（評分、剩量、場合、照片等使用者的設定）
2. `Store.applyDetails`：香水的 Fragrantica 網址 ID 對得上 `details`，而且 `ver` 和上次不同，就把完整資料補進去

---

## 4. 天氣

1. 取得手機定位，用 `towns.json` 找出最近的鄉鎮
2. 抓中央氣象署該縣市的鄉鎮 3 天預報（`F-D0047-0XX`），授權碼 `CWA_KEY` 在 `index.html`
3. 拿不到定位時改用新北市淡水區
4. 結果快取 30 分鐘（localStorage `wx`）

氣象署授權碼放在公開網頁上，使用者知道也同意，最壞情況只是被別人用到每日上限。

---

## 5. Google 雲端硬碟同步

- 權限範圍是 `drive.file`，只碰得到這個 App 自己建立的檔案。備份檔名「香水櫃備份.json」
- `GOOGLE_CLIENT_ID` 在 `index.html`，這個 ID 本來就是公開的
- Google Cloud 專案名稱是 `perfume-cabinet`，目前在測試模式，只有使用者本人的帳號是測試使用者
- Google 的登入大約一小時失效，需要使用者點一下才能重新登入。按「今天噴這支」時也會順便處理

---

## 6. 版本與發布

- push 到 `main` 就會自動發布（`.github/workflows/pages.yml`），分成兩個步驟：
  1. **build**：把 `__APP_VERSION__` 換成「月/日 時:分 · commit 前 7 碼」（台灣時間），寫進 `index.html` 和 `version.json`，然後打包上傳
  2. **deploy**：發布到 GitHub Pages
- 原本是同一個步驟，11/24 遇到發布時找不到剛上傳的檔案，所以拆成兩段
- GitHub Pages 會讓手機快取網頁 10 分鐘。所以 App 打開或切回來時會執行 `checkUpdate()`：比對 `version.json`，版號不同就帶著 `?v=新版號` 重新載入。同一個版號只重試一次，避免一直重新整理

---

## 7. 補香水資料的流程

使用者說「幫我補某支香水的資料」時：
1. 用瀏覽器打開 fragrantica.asia 該香水的頁面，執行上層資料夾的 `tools/fragrantica-extract.js`，取得香調比例、季節投票、擴散和持久度的票數、分數
2. 把香調描述改成繁體中文，格式是「首調：…｜中調：…｜基調：…」
3. 執行 `node tools/add-details.mjs <資料.json>`，寫進 `web/perfumes.json` 的 `details` 和 `ratings`，並自動更新版本
4. commit、push。使用者下次打開 App 就會自動帶入

`tools/` 在 repo 外面的上層資料夾，不會被發布。

---

## 8. 主要程式位置（`index.html`，行號大約）

| 位置 | 內容 |
|---|---|
| 360 | `seasonCenters`：季節代表氣溫（依月份） |
| 418～440 | `weatherForOcc`、`applyWeather`：決定 `ctx.temp`／`ctx.wet` |
| 442 | `Store`：資料、合併、同步用的時間戳記 |
| 551～630 | `buildWeather`、`Weather`：氣象署資料 |
| 634 | `Sync`：Google 雲端硬碟 |
| 728～830 | `lastWorn`、`profile`、`suggestOcc`、`recommend`、`altReasons` |
| 961 | `renderToday` |
| 1042 | `renderShelfResults`：木頭層架，一排 3～4 罐 |
| 1215 | `detailSheet` |
| 1360 | `scentoProfile`：從搜尋帶入的季節、香調、中文香調名稱 |
| 1581、1740 | `editSheet`、`submitForm`：新增和編輯香水 |
| 2066 | `APP_VERSION`、`checkUpdate` |

---

## 9. 怎麼驗證推薦邏輯

在本機複製一份 `index.html`，把 `S.weather = lsGet("wx"); applyWeather();` 改成：

```js
window.__t = {recommend, S, suggestOcc}; S.weather = lsGet("wx"); applyWeather();
```

就能在瀏覽器裡直接呼叫，例如 `__t.recommend("2026-11-24", {temp:21, occ:"office", wet:false})`。
**這份測試用的複本不要 commit。**
