# 💧 Aether AI Studio 3.0 (AetherAgent) - Official Release 🚀

歡迎使用 **Aether AI Studio 3.0**！本次重大版本升級帶來了多模態視覺辨識雙軌架構、原生獨立桌面版、**零安裝一鍵啟動導航**與**全自動一鍵更新程式 (Smart Auto-Updater)**。

---

## ⚡ 零安裝快速啟動 (One-Step Quick Start)

無需繁瑣手動安裝環境，直接 Clone 儲存庫並執行啟動腳本，系統將全自動配置依賴並引導啟動：

### 步驟 1：下載儲存庫
```bash
git clone https://github.com/hankyleisplay/AetherAI-Studio.git
cd AetherAI-Studio
```

### 步驟 2：執行啟動導航腳本

**在 Windows 命令提示字元 (CMD) 中執行：**
```cmd
.\launch.bat
```

**或在 Windows PowerShell 中執行：**
```powershell
.\launch.ps1
```

### 🧭 互動式模式選單：
啟動腳本將主動引導您選擇啟動模式：
- `[1]` **獨立桌面視窗版 (Desktop App)**：原生獨立視窗、精緻無邊框 Liquid Glass 沉浸體驗（`.\run.ps1 -Desktop`）
- `[2]` **一般網頁瀏覽器版 (Web Browser)**：自動於預設瀏覽器分頁開啟（`.\run.ps1`）
- `[3]` **檢查並更新至最新版本 (Update to Latest Version)**：自動拉取遠端最新代碼並保護本機對話與工作區資料

> 💡 亦可雙擊執行 `create_desktop_shortcut.bat`，即可一鍵在 Windows 桌面建立專屬圖示捷徑！

---

## 🔄 系統一鍵更新 (Smart Auto-Update)

如果您已經下載過專案，當有新版本發布時，請**不要再次執行 `git clone`**（Git 會因目錄非空而報錯），您可以使用以下方式極速更新：

### 方法一：專屬一鍵更新腳本（最簡單推薦）

**在 Windows 命令提示字元 (CMD) 中執行（或直接雙擊）：**
```cmd
.\update.bat
```

**或在 Windows PowerShell 中執行：**
```powershell
.\update.ps1
```

**在 Linux / macOS 中執行：**
```bash
./update.sh
```

腳本會全自動：
1. 🛡️ 保護您的本機工作區檔案與 SQLite 對話資料庫
2. ⬇️ 同步 GitHub 遠端最新程式碼
3. 📦 自動檢查並安裝任何新增的 Python 相依套件
4. 🚀 提示是否立即啟動桌面版或網頁版！

---

### 方法二：在啟動選單中直接選擇更新
直接執行啟動腳本：
```cmd
.\launch.bat
```
在選單中輸入 `3` 即可一鍵檢查並升級至最新版。

---

### 方法三：全自動智慧更新腳本（未下載自動 Clone，已下載自動 Update）

**Windows PowerShell（分行腳本）：**
```powershell
if (Test-Path AetherAI-Studio) {
    cd AetherAI-Studio
    .\update.ps1
} else {
    git clone https://github.com/hankyleisplay/AetherAI-Studio.git
    cd AetherAI-Studio
    .\launch.ps1
}
```

**Windows CMD 批次檔（分行腳本）：**
```cmd
if exist AetherAI-Studio (
    cd AetherAI-Studio
    call update.bat
) else (
    git clone https://github.com/hankyleisplay/AetherAI-Studio.git
    cd AetherAI-Studio
    call launch.bat
)
```

**Linux / macOS Bash（分行腳本）：**
```bash
if [ -d "AetherAI-Studio" ]; then
    cd AetherAI-Studio
    ./update.sh
else
    git clone https://github.com/hankyleisplay/AetherAI-Studio.git
    cd AetherAI-Studio
    ./run.sh
fi
```

---

## 🛠️ 3.0 重大修復與架構升級亮點

### 1. 🛡️ 修復工作區檔案儲存 Network Error
- **根本原因排除**：徹底解決生產模式下 Uvicorn 檔案監聽機制（`reload=True`）因 Agent 寫入工作區檔案 (`backend/workspace/`) 觸發進程熱重載、導致進行中的 SSE 串流連線被非預期切斷中斷（`Failed to fetch / Network Error`）的問題。
- **工具鏈強化**：增強 `file_system` 工具的參數別名相容（支援 `save`, `create`, `write_file`, `file_path`, `data`, `text` 等），並修正路徑前綴正規化，保證穩定寫入。

### 2. 👁️ 多模態視覺識別與雙軌路由 (Multimodal Vision & Dual-Track Routing)
- **貼上與拖曳直覺輸入**：聊天輸入框支援 **Ctrl+V 貼上剪貼簿圖片** 或 **拖曳圖像檔案**。
- **微縮預覽卡片**：輸入框上方即時呈現毛玻璃縮圖微縮預覽，支援單鍵移除與多圖載入。
- **雙軌智能路由**：
  - 🚀 **軌道 A（多模態視覺模型，如 `qwen2.5-vl`、`llava`、`gemini`）**：原生封裝至 `images` 欄位進行高解析度視覺推理。
  - 🧠 **軌道 B（純文字模型，如 `llama3`、`deepseek-r1` 等）**：在後台自動調用視覺模型或 Windows 原生 OCR 引擎提取結構化排版，將詳細視覺結構自動嵌入 Prompt，使純文字模型也能精確「讀懂」圖片內容！
- **`ocr_extractor` 核心工具**：提取工作區圖像中的文字與結構化排版數據。

### 3. 🖥️ 原生獨立桌面版 (Native Desktop App)
- 脫離瀏覽器分頁束縛，提供專屬桌面視窗。
- 專屬 Windows 桌面捷徑一鍵生成 (`create_desktop_shortcut.bat`)。

### 4. 🌊 Liquid Glass 3.0 前瞻設計美學
- 4 種 Agent 狀態動態流體光球：待命（Idle）、思考（Thinking）、工具執行（Calling Tool）、串流生成（Streaming）。
- 14 大企業級智慧工具鏈與 Telegram 雙向橋接守護服務。
