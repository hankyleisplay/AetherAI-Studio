# Aether AI Studio 4.2.0 — Bug 稽核報告

稽核範圍：主程式前端（`frontend/src`）、後端（`backend/app`）、Tauri 啟動器（`launcher/`）、
Python 啟動器（`launcher.py`、`start.py`）、Electron 桌面殼（`desktop/`）。

- **已修**：本版已修正並驗證。
- **待決定**：確定是問題，但修正會改變使用方式，需要專案擁有者決定。

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

## 二、待決定（會改變使用方式）

| 嚴重度 | 位置 | 問題 | 建議 |
|---|---|---|---|
| 🔴 | `backend/app/services/telegram_bridge.py` | 啟用 Telegram 但沒填 Chat ID 時，**任何人**找到這個 Bot 都能和 Agent 對話，並使用 `bash_executor` 等工具在電腦上執行指令。 | 沒填 Chat ID 時拒絕所有訊息，或第一位使用者綁定後鎖定。 |
| 🟠 | `start.py` 預設 `--host 0.0.0.0` | 預設對整個區網開放；沒設 PIN 時，同一個 Wi-Fi 的任何人都能用終端與檔案 API。 | 預設改為 `127.0.0.1`，需要手機遠端時再明確開啟，或開放區網時強制設定 PIN。 |
| 🟠 | `lib.rs` `apply_update` | 更新前 `git stash --include-untracked` 之後不會 `stash pop`；`git pull` 失敗時直接 `git reset --hard`。使用者的修改被收起或覆蓋，且沒有提示。 | 更新後還原 stash；有衝突時停下來告知，而不是強制重設。 |
| 🟡 | `launcher.py` | 每次開啟都自動 `git pull`，沒有詢問。 | 改為提示有更新，由使用者決定。 |
| 🟡 | 桌面模式 | 關閉 App 視窗後背景伺服器不會結束；下次啟動發現埠被占用就改用下一個埠，殭屍程序越積越多。先前的獨立 profile 方案曾因當機被移除。 | 伺服器監測視窗程序，視窗結束時一起結束。 |
| 🟡 | `lib.rs` `self_update_launcher` | 下載新版啟動器後只檢查大小，沒有驗證雜湊（GitHub Release API 已提供 sha256）。 | 比對 `digest` 欄位後才替換。 |
| 🟡 | PIN 機制 | 權杖就是 PIN 本身，存在 localStorage 與 30 天 cookie。 | 改發隨機 session token。 |
| 🟡 | `/api/workspace/file?raw=true` | 工作區的 HTML／SVG 以主程式同源提供；Agent 寫出的惡意 HTML 被開啟時能呼叫 API。 | 加上 `Content-Security-Policy: sandbox` 或改為下載。 |
| ⚪ | `launcher/src-tauri/tauri.conf.json` | `csp: null`。 | 設定只允許本地資源的 CSP。 |
| ⚪ | `lib.rs` `install_or_repair_core` | 「重新安裝/修復核心」在 `start.py` 存在時不會重新下載任何檔案，只重裝 pip 套件。 | 修復時比對或重新下載核心檔案。 |
| ⚪ | `tools/registry.py` 網路探測 | `http_headers` 動作關閉 TLS 驗證。 | 僅診斷用途，可保留但在輸出註明。 |
| ⚪ | `/api/upload` | 同名檔案直接覆蓋。 | 自動加上序號。 |

---

## 三、驗證方式

- 後端：`python test_backend.py` 全數通過（19 大項，含版本一致性 4.2.0）。
- 安全：帶 `Origin: https://evil.example`、`Origin: null`、`Sec-Fetch-Site: cross-site` 呼叫 API 皆回 403；
  同源、無 Origin（curl）、Vite 開發來源、Cloudflare Tunnel（`X-Forwarded-Host`）正常；
  錯 5 次 PIN 後第 6 次回 429，其他來源不受影響。
- 前端（Playwright + 本地假模型伺服器）：數學式 XSS、`javascript:` 連結、串流中切換對話、停止後重新整理、
  串流中編輯提示詞、側邊欄取消收藏，共 13 項全數通過。
- 啟動器（Playwright 直接開 `launcher/ui/index.html` 並模擬 Tauri API）：埠號按一下 +1、99999 被限制為 65535、
  鍵盤操作、離線狀態、確認對話框。
- Rust：由 GitHub Actions（`.github/workflows/build-launcher.yml`）在 Windows 實際編譯。
  **Windows 上的執行期行為（關閉程序、建立捷徑、含空白或單引號的路徑）未經實機測試**，請下載 Actions 產出的
  `AetherLauncher.exe` 試跑。
