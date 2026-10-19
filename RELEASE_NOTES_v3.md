## 🌌 Aether AI Studio 3.0 (Official Release)

Aether AI Studio 3.0 是基於 Liquid Glass 流光水感毛玻璃美學架構打造的下一代跨平台桌面級自主 AI Agent 系統，由 **hankyledevteam** (Hanson Lee) 主導研發。具備本地大模型與雲端主流 API 混合協同的高階自主智能環境。

---

### ✨ 核心更新亮點 (Highlights)

* **🛠️ 全新升級 22 大企業級自主工程工具鏈 (22 Autonomous Enterprise Tools)**：
  * 完整整合 22 項強大工具：`web_search`、`ocr_extractor` / `image_to_text`、`read_url`、`knowledge_memory`、`generate_chart`、`python_eval`、`file_system`、`bash_executor`、`system_status`、`datetime_calc`、`http_request_api`、`document_text_extractor`、`mermaid_generator`、`code_linter_analyzer`。
  * **全新加入 7 大工程工具**：
    1. 🌿 `git_version_control`：儲存庫狀態 (`status`)、提交記錄 (`log`)、差異比對 (`diff`) 與分支檢視。
    2. 🗄️ `database_sqlite_inspector`：工作區 SQLite 綱要探查、資料表取樣與安全唯讀 SQL 查詢。
    3. 🔄 `data_transformer_converter`：JSON ↔ YAML ↔ CSV ↔ Markdown Table 雙向轉換，Base64/URL 編解碼。
    4. 🔐 `hash_crypto_inspector`：SHA-256、SHA-512、MD5、CRC32、HMAC 雜湊碼生成與檔案完整性校驗。
    5. 🎯 `regex_pattern_matcher`：正規表示式語法驗證、群組捕獲提取 (`find_all`) 與批次替換 (`replace`)。
    6. 📦 `archive_compressor`：ZIP、TAR、TGZ 壓縮包解壓與封裝（嚴格防止 Zip/Tar Slip 目錄穿越）。
    7. 🌍 `network_dns_whois_lookup`：DNS 解析 (A, AAAA, MX, TXT)、TCP 端口連通性延遲測試與 HTTP 標頭檢驗。

* **🚀 流式生成長度上限與接續體驗優化 (Token Truncation Notice Relocation)**：
  * 徹底重構長度截斷通知架構：避免模型在生成完整程式碼或遊戲專案（如貪吃蛇、五子棋等複雜代碼）時，長度提示訊息因串流機制提前插入於 Markdown 標題或內容前方。
  * 系統截斷提示將僅於終端回應最末尾以乾淨的區塊標註呈現，絕不污染標題或中途工具呼叫。
  * 預設輸出長度 (`max_tokens`) 全面提升至 **8192**（最高可調節至 **16384**），大幅降低生成大型程式碼時的不必要截斷。

* **🌐 端對端 UTF-8 與 Emoji 表情符號無損編碼**：
  * 全面優化 SSE 串流、SQLite 儲存庫與 Windows 控制台輸出機制 (`ensure_ascii=False`)，徹底避免如 ⚠️、🐍、✨ 等 Emoji 在繁體中文 Windows (CP950) 環境下退化為 `??`。

* **🖥️ 跨平台獨立桌面端模式 (Native Desktop Window)**：
  * 支援以原生無邊框獨立視窗模式運行（`.\run.ps1 -Desktop` 或 `python start.py --desktop`）。
  * 支援 `create_desktop_shortcut.bat` 一鍵在 Windows 桌面建立專屬圖示捷徑。

* **👁️ 雙軌視覺認知架構 (Dual-Track Vision Perception)**：
  * **軌道 A**：原生多模態視覺模型（Qwen2.5-VL、LLaVA 等）直接端對端理解圖片。
  * **軌道 B**：純文字模型（LLaMA 3、DeepSeek 等）透過原生 Windows OCR 引擎與後台視覺解析，自動提取結構化文字與排版資訊。

* **✈️ Telegram 智能機器人雙向橋接 (Telegram Bot Bridge)**：
  * 支援透過 Telegram 即時遠端與工作區 Agent 互動並自動同步對話與執行成果。

---

### 📦 快速安裝與使用說明 (Quick Start)

#### 首次安裝 (First-time Setup)

請於終端機（PowerShell、CMD 或 Bash）執行以下指令：

```bash
git clone https://github.com/hankyleisplay/AetherAI-Studio.git
cd AetherAI-Studio
```

#### 啟動應用程式 (Launch)

##### 1. 互動式一鍵導航啟動（推薦）

執行以下命令，腳本會自動檢查環境並詢問您要啟動一般瀏覽器版、獨立桌面版或進行檢查：

```cmd
.\launch.bat
```

##### 2. Windows PowerShell 快速啟動

一般網頁版：
```powershell
.\run.ps1
```

原生獨立桌面版：
```powershell
.\run.ps1 -Desktop
```

自訂連接埠：
```powershell
.\run.ps1 -Port 8888
```

##### 3. 跨平台 Python 啟動

一般網頁版：
```bash
python start.py
```

桌面版：
```bash
python start.py --desktop
```

#### 智慧更新 (Update)

若您已經下載過本專案，欲更新至最新正式版，請進入專案目錄執行：

```bash
cd AetherAI-Studio
git pull origin main
```

---

### 🔗 相關連結與套件

* **GitHub Repository**: [hankyleisplay/AetherAI-Studio](https://github.com/hankyleisplay/AetherAI-Studio)
* **npm Package**: [@hankyleisplay/aetherai-studio](https://www.npmjs.com/package/@hankyleisplay/aetherai-studio)
* **開發團隊**: hankyledevteam (Hanson Lee)
