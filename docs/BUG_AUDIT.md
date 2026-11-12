# Aether AI Studio 4.2.0 — Bug 稽核報告

稽核範圍：主程式前端（`frontend/src`）、後端（`backend/app`）、Tauri 啟動器（`launcher/`）、
Python 啟動器（`launcher.py`、`start.py`）、Electron 桌面殼（`desktop/`）。

- 所有列出的問題都已在本版修正；驗證方式見第三節（部分 Windows 行為未能實機測試，第三節最後一點列出）。
- 第二節的項目修正後使用方式有變動，表格最後一欄說明差異。

嚴重度：🔴 嚴重　🟠 高　🟡 中　⚪ 低

---

## 一、已修正

### 安全性

| 嚴重度 | 位置 | 問題 | 修正 |
|---|---|---|---|
| 🔴 | `backend/app/main.py` CORS 與中介層 | CORS 設為 `*`，且本機請求免 PIN。使用者開著 Aether 時瀏覽任何網站，該網站的 JavaScript 就能呼叫 `http://localhost:8000/api/terminal/exec` 在電腦上執行指令。 | CORS 只允許 Vite 開發來源；新增 Origin／`Sec-Fetch-Site` 檢查，跨站請求一律 403。需要額外來源時可設定環境變數 `AETHER_ALLOWED_ORIGINS`。 |
| 🟠 | `main.py` `_is_local_request` | 連線來自 127.0.0.1 就視為本機，DNS rebinding 或沒加標頭的反向代理都能繞過 PIN。 | 另外檢查 `Host` 必須是本機名稱。 |
| 🟠 | `main.py` `/api/auth/verify-pin` | PIN 驗證沒有次數限制，4 位數 PIN 幾秒內就能被暴力破解。 | 同一來源連續錯 5 次鎖定 60 秒（回 429）；改 PIN 時的舊 PIN 比對改用定時比較。 |
| 🟠 | `frontend/src/components/markdown/MathRenderer.tsx` | 數學式轉成 HTML 後直接以 `dangerouslySetInnerHTML` 插入，未跳脫。模型輸出（可能引用網頁或檔案內容）中的 `$<img onerror=…>$` 會執行腳本，進而以使用者身分呼叫終端 API。 | 先跳脫 HTML 再轉換；矩陣欄位分隔改用跳脫後的 `&amp;`。 |
| 🟠 | `MarkdownRenderer.tsx` 連結 | `[文字](javascript:…)` 會產生可點擊的 `javascript:` 連結。 | 只允許 http(s)、mailto、tel 與相對路徑（`utils/clipboard.ts` `safeHref`）。 |
| 🟠 | `CanvasPreviewModal.tsx` | 預覽 iframe 同時有 `allow-scripts` 與 `allow-same-origin`，等於沒有沙盒：模型產生的 HTML 能讀取存取權杖並呼叫本機 API。「新分頁開啟」的 blob 頁面同樣與主程式同源。 | 移除 `allow-same-origin`；新分頁改為外層包一個沙盒 iframe。 |
| 🟡 | `launcher/src-tauri/src/lib.rs` `find_python` | 寫死作者個人帳號的 Python 路徑（洩漏使用者名稱，對其他人也無效）。 | 移除。 |

### 功能錯誤

| 嚴重度 | 位置 | 問題 | 修正 |
|---|---|---|---|
| 🟠 | `launcher/ui/app.js` 埠號按鈕 | `click` 與 `mousedown` 各加一次，按一下跳 2 格（實測 8000→8002）。 | 改用 pointer 事件處理按住連發，鍵盤觸發另外處理；實測按一下 +1。 |
| 🟠 | `app.js` 埠號輸入 | 可手動輸入 99999，送到 Rust 的 `u16` 參數時解析失敗，啟動直接報錯。 | 輸入與送出時都限制在 1024–65535。 |
| 🟠 | `lib.rs` 所有指令 | 指令都是同步函式、跑在主執行緒，檢查更新、安裝、下載時整個視窗「沒有回應」。 | 耗時指令改為 `#[tauri::command(async)]`。 |
| 🟠 | `lib.rs` `close_all_instances` | 「一鍵關閉」會終止任何命令列含 `start.py` 的程序，以及佔用該埠的任何程式（不一定是 Aether），失敗也照樣計數。 | 只比對 Aether 特徵（`start.py … --port`、`test_backend.py`、該埠的 app 視窗；佔用埠的程序須是 Aether 伺服器），只計成功終止的。 |
| 🟠 | `backend/app/main.py` `create_project` | 使用未匯入的 `time`；以中文資料夾名稱建立專案時一律 500。 | 補上匯入；實測 `我的專案` 可建立。 |
| 🟠 | `main.py` 終端與 git 端點 | 在 async 函式裡呼叫阻塞的 `subprocess.run`（最長 30–60 秒），期間所有聊天串流與 API 全部停住。 | 改用 `asyncio.to_thread`。 |
| 🟠 | `main.py` git 端點 | 專案不在 metadata 時退回工作區根目錄，可能把 commit 做到錯的倉庫；`git add` 失敗直接拋 500。 | 與終端共用 `get_effective_workspace_dir`；補上非 git 目錄、逾時、未安裝 git 的處理。 |
| 🟠 | `main.py` `/api/git/ai-commit-msg` | 呼叫不存在的 `client.generate()`，永遠回傳固定訊息。 | 改用 `stream_chat` 收集回覆（`test_backend.py` 第 18 項現在拿到的是模型輸出）。 |
| 🟠 | `backend/app/agent/core.py` | 使用者按「停止生成」或斷線時，使用者訊息已存但回覆沒存：重新整理後回答消失，下一輪變成連續兩則使用者訊息。 | 中斷時把已生成的內容存檔；實測停止後重新整理仍在。 |
| 🟠 | `frontend/src/App.tsx` 串流中切換對話 | 串流時點其他對話不會載入，畫面仍是原對話；完成時回覆還可能被加到錯的對話畫面。 | 切換時正常載入；回到原對話時接回即時內容，完成後以伺服器存檔為準。實測通過。 |
| 🟠 | `App.tsx` 串流中編輯提示詞 | 舊串流的 `finally` 會把新串流的狀態重設為 idle（停止鈕消失、無法中止）。Code 模式停止需要數秒，新提示詞被靜默丟棄，但後續訊息已從資料庫刪除。 | 每次送出有編號，只有最新一次能重設狀態；編輯時等串流真的結束才刪除與重送。實測通過。 |
| 🟠 | `App.tsx` 與 `MessageItem` 記憶化 | `MessageItem` 只比較內容，舊訊息保留第一次拿到的回呼；編輯舊提示詞時用的是過期的訊息列表，找不到訊息就什麼都不做。 | 回呼改經由 ref 取得最新版本。 |
| 🟡 | `App.tsx` 錯誤狀態 | 串流錯誤時設成 `error`，同一個 tick 又被 `finally` 改回 `idle`，錯誤的紅色背景與徽章從未出現。 | 錯誤狀態保留 4 秒。 |
| 🟡 | `App.tsx` 節能模式 | 啟動器勾選低配置時以 `?eco=1` 開啟，這個設定被寫入偏好，之後每次開啟都是節能模式。 | 網址參數只影響當次。 |
| 🟡 | `Sidebar.tsx` 取消收藏 | 側邊欄先切換一次，再呼叫上層又切換一次，收藏被加回去。 | 只切換一次；實測收藏消失。 |
| 🟡 | `ChatView.tsx` 輸入法 | 用注音／拼音選字按 Enter 會直接送出訊息。 | 選字中（`isComposing`）忽略 Enter。 |
| 🟡 | `ChatView.tsx` 上傳 | 上傳完成時用舊的 `inputText` 判斷，會覆蓋使用者在上傳期間打的字。 | 改用函式型更新。 |
| 🟡 | 6 個元件的複製按鈕 | `navigator.clipboard` 只在 https／localhost 存在；手機從區網 `http://192.168.x.x` 開啟時每個複製按鈕都拋錯。 | `utils/clipboard.ts` `copyText` 提供後備方案。 |
| 🟡 | `backend/app/llm/provider.py` | 所有圖片都宣告為 `image/jpeg`；Anthropic 會拒絕 PNG 截圖。 | 依 data URL 或 base64 檔頭判斷實際格式。 |
| 🟡 | `main.py` 匯出對話 | 工具輸出或內容為 `None` 時 500。 | 空值防護。 |
| 🟡 | `main.py` 終端串流 | 使用者關閉終端或連線中斷後，指令繼續在背景執行。 | 結束時終止程序。 |
| 🟡 | `app.js` 更新橫幅 | 後端查詢 GitHub 失敗時把錯誤放在 `error` 欄位，前端忽略並顯示「已是最新正式版 ✅」。 | 顯示離線狀態與重試按鈕。 |
| 🟡 | `app.js` 一鍵全面更新 | 專案更新成功、啟動器更新失敗時，整體顯示「更新失敗」，按鈕又可重按。 | 分開回報，保留啟動器更新按鈕。 |
| 🟡 | `app.js` 頁尾 | 取得版本前顯示 `v{version}` 原文；一次錯誤後狀態列永遠是紅色。 | 統一的狀態函式，每次設定顏色。 |
| 🟡 | `lib.rs` 埠號 | 埠號接近 65535 時 `port + 1`、`start_port + 200` 的 `u16` 溢位。 | 飽和運算。 |
| 🟡 | `lib.rs` 安裝／更新 | pip 安裝失敗仍回報「安裝完成」；訊息寫死「4.0」。 | 回報 pip 結果與實際版本。 |
| 🟡 | `lib.rs` PowerShell | 路徑把反斜線加倍，含單引號的路徑（例如使用者名稱 `O'Brien`）會讓腳本壞掉。 | 正確的單引號跳脫。 |
| 🟡 | `lib.rs` cmd.exe | Python 路徑含空白時加的引號被 Rust 參數跳脫成 `\"`，cmd.exe 無法辨識；健康檢查完全沒加引號。 | Windows 上以 `raw_arg` 原樣傳遞。 |
| ⚪ | `lib.rs` `cleanup_old_launcher` | 刪除執行檔所在資料夾裡任何 `*.exe.bak`／`*.exe.new`（例如放在「下載」資料夾時會刪到別的程式的檔案）。 | 只處理本啟動器自己的檔案。 |
| ⚪ | `lib.rs` `check_update` | 每次都跑 `git fetch` 但結果沒被使用（只拖慢檢查）。 | 移除。 |
| ⚪ | `launcher.py` | 背景執行緒直接操作 Tk 元件（非執行緒安全，可能當掉）；手動檢查更新會卡住視窗；標題寫死「3.5」。 | `root.after` 回到主執行緒、背景執行、自動帶版本。 |
| ⚪ | `start.py` | `--window-position=center` 不是有效的 Chromium 參數。 | 移除。 |
| ⚪ | `desktop/` | 系統匣與打包圖示用 SVG（Electron 不支援，系統匣圖示是空白）；版本字樣停在 4.0 與 3.0.0-preview。 | 改用 PNG／ICO，版本自動帶入。 |
| ⚪ | 前端樣式 | 元件使用 `animate-in`、`fade-in`、`zoom-in-95`、`animate-fade-in`、`animate-slide-left`、`z-60`，但專案沒有定義（工作區預覽視窗因此沒有 z-index）。 | 在設計系統中定義。 |
| ⚪ | `run.sh` | 檔案沒有執行權限，`create_shortcut.sh` 每次啟動 `chmod` 後讓 git 工作區變髒。 | 在 git 中標記為可執行。 |

---

## 二、原「待決定」項目（已修正，使用方式有變動）

| 嚴重度 | 位置 | 問題 | 修正 | 使用上的差異 |
|---|---|---|---|---|
| 🔴 | `backend/app/services/telegram_bridge.py` | 啟用 Telegram 但沒填 Chat ID 時，**任何人**找到這個 Bot 都能讓 Agent 在電腦上執行指令。 | 沒填 Chat ID 時不執行任何指令，只回覆對方的 Chat ID（每 10 分鐘最多一次）。 | **必須填 Chat ID 才能用**。不知道自己的 ID：傳一則訊息給 Bot 就會收到。 |
| 🟠 | `backend/app/main.py` 中介層 | 伺服器對整個區網開放；沒設 PIN 時同一個 Wi-Fi 的人都能用終端與檔案 API。 | 仍對區網開放，但**非本機連線一律需要 PIN**；主機沒設 PIN 時，遠端裝置只會看到「遠端存取尚未開啟」說明畫面。 | 用手機或 Cloudflare Tunnel 連線前，要先在主機「設定 → 外網安全」設定 PIN。本機使用不受影響。 |
| 🟠 | `main.py`、`services/access.py` | PIN 明碼存放，登入權杖就是 PIN 本身（存在 localStorage 與 cookie）。 | PIN 改存 PBKDF2 雜湊（舊值第一次使用時自動轉換）；登入改發隨機權杖，資料庫只存其雜湊；變更或停用 PIN 會登出所有裝置。 | 已登入的遠端裝置需重新輸入一次 PIN。 |
| 🟠 | `launcher/src-tauri/src/lib.rs` `apply_update` | 更新時 `git stash` 後不還原；`git pull` 失敗就 `git reset --hard`，本地修改與提交直接消失。 | 有修改才用具名 stash 暫存；只做 fast-forward；更新後自動還原修改；與新版衝突時保留 stash 並告知名稱；有本地提交時拒絕更新且不動任何檔案。 | 有自己 commit 的人需手動 `git pull`；衝突時修改在 `git stash list` 裡。 |
| 🟡 | `launcher.py` | 每次開啟都自動 `git pull`。 | 開啟時只檢查；按「🔄 檢查更新」或選單 [5] 才更新，並改用 `--ff-only`。 | 不會再被默默更新。 |
| 🟡 | `start.py`、`services/desktop_session.py`、`App.tsx` | 桌面版關閉視窗後背景伺服器不會結束，下次啟動改用下一個埠，殭屍程序越積越多。 | 桌面視窗定時回報；關閉後約 15 秒（或 3 分鐘沒有回報）伺服器自動結束，重新整理不受影響。 | 關掉桌面版視窗即結束伺服器；若手機同時連著同一個桌面版伺服器也會一起斷線。瀏覽器版、CLI 版不受影響。 |
| 🟡 | `lib.rs` `self_update_launcher` | 自更新只檢查檔案大小，且接受前端傳來的任意下載網址。 | 只接受官方 Release 網址，下載後比對 GitHub 公布的 SHA-256，不符即中止。 | 無。 |
| 🟡 | `main.py` 檔案端點 | 工作區的 HTML／SVG 以主程式同源提供，Agent 寫出的惡意 HTML 被開啟時能呼叫 API。 | 加上 `Content-Security-Policy: sandbox` 與 `nosniff`。 | 網頁仍可預覽與執行，但無法存取主程式。 |
| ⚪ | `launcher/src-tauri/tauri.conf.json` | `csp: null`。 | 啟用 Tauri 建議的 CSP。 | 無（已在 Linux 版 WebKit 實跑確認）。 |
| ⚪ | `lib.rs` `install_or_repair_core` | 「重新安裝/修復核心」在 `start.py` 存在時不會補回任何檔案。 | git 安裝以 `git checkout` 補回被刪除的檔案；非 git 安裝下載後只補缺檔；都不覆蓋既有檔案。 | 修復結果會顯示補回幾個檔案。 |
| ⚪ | `backend/app/tools/registry.py` 網路診斷 | `http_headers` 關閉 TLS 驗證。 | 預設驗證憑證，失敗才略過並在結果中標註。 | 無。 |
| ⚪ | `main.py` `/api/upload` | 同名檔案直接覆蓋。 | 改存為「名稱 (1).副檔名」。 | 無。 |
| ⚪ | `start.py` `is_port_in_use` | Linux／macOS 上伺服器剛結束就重開，埠號因 TIME_WAIT 被判定占用而換到下一個埠。 | 檢查時與 uvicorn 一樣使用 `SO_REUSEADDR`（Windows 除外）。 | 無。 |

---

## 三、驗證方式

- 後端：`python test_backend.py` 全數通過（19 大項，含版本一致性 4.2.0）。
- 安全：帶 `Origin: https://evil.example`、`Origin: null`、`Sec-Fetch-Site: cross-site` 呼叫 API 皆回 403；
  同源、無 Origin（curl）、Vite 開發來源、Cloudflare Tunnel（`X-Forwarded-Host`）正常；錯 5 次 PIN 後回 429。
- 遠端存取（以 `X-Forwarded-For` 模擬）：未設 PIN 時 API 回 403 並顯示說明畫面；舊明碼 PIN 可登入並轉為雜湊；
  登入權杖為 43 字元隨機值且不等於 PIN；改 PIN 後舊權杖失效；手機模擬器輸入 PIN 後可正常使用。
- Telegram（模擬 Telegram API 回應）：未綁定時 4 則訊息只回覆 1 次 Chat ID 且不執行任何指令；綁定後正常；其他 Chat ID 一律拒絕。
- 桌面模式：`start.py --desktop` 啟動，頁面重新整理後伺服器仍在；關閉頁面約 16 秒後伺服器自動結束。
- 前端（Playwright + 本地假模型伺服器）：數學式 XSS、`javascript:` 連結、串流中切換對話、停止後重新整理、
  串流中編輯提示詞、側邊欄取消收藏，共 13 項全數通過。
- 啟動器介面（Playwright 模擬 Tauri API）：埠號按一下 +1、99999 被限制為 65535、鍵盤操作、離線狀態、確認對話框。
- 啟動器實機（Linux 版 Tauri + WebKitGTK，Xvfb 虛擬螢幕）：啟用 CSP 後 IPC、樣式與圖片皆正常，與未啟用時畫面相同。
- 啟動器更新與修復邏輯（以真實的暫存 git 倉庫執行 Rust 測試）：一般修改保留、衝突修改留在具名 stash、
  有本地提交時拒絕更新且不變動任何檔案、修復補回被刪檔案且不覆蓋修改。
- Windows 編譯：GitHub Actions（`.github/workflows/build-launcher.yml`）。
- **未能在 Windows 實機測試**：「一鍵關閉」、建立捷徑、路徑含空白或單引號、自更新的實際替換流程。
  請下載 Actions 產出的 `AetherLauncher.exe` 試跑。
