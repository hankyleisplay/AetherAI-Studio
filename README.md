# 🌌 AetherAI Studio

<p align="center">
  <strong>Private Local AI Playground & Chat Console with Autonomous Agent Code Mode</strong>
</p>

<p align="center">
  <a href="https://github.com/hankyleisplay/AetherAI-Studio/blob/main/LICENSE"><img src="https://img.shields.io/github/license/hankyleisplay/AetherAI-Studio?style=flat-square&color=blue" alt="License"></a>
  <a href="https://www.npmjs.com/package/aetherai-studio"><img src="https://img.shields.io/npm/v/aetherai-studio?style=flat-square&color=cyan" alt="npm version"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-purple?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/Dependencies-Zero-green?style=flat-square" alt="Dependencies">
</p>

---

## 📖 English Introduction

**AetherAI Studio** is a private, zero-dependency, 100% offline Local AI client and playground. Designed to run entirely on your system, it offers a glassmorphic interface to interact with local inference backends like **Ollama**, **LM Studio**, and **vLLM**.

It includes advanced features such as an autonomous **Agent Code Mode** that enables LLMs to recursively read/write files and execute terminal commands, scientific **LaTeX typesetting**, bilingual **Voice Synthesis/Dictation**, and background community **Messaging Bridges** for Telegram and Discord.

---

## 📖 中文介紹

**AetherAI Studio** 是一款專為隱私設計、零依賴、100% 離線的本機 AI 控制台與遊樂場。本系統能完美相容本機推理引擎（如 **Ollama**、**LM Studio** 與 **vLLM**），為您提供流暢精緻的玻璃擬態 (Glassmorphism) 操作介面。

本系統具備先進的 **Agent Code 智能代理模式**，能引導 LLM 自主執行終端機命令與進行檔案讀寫，另支援科學級 **LaTeX 數學公式排版**、雙語**語音輸入與語音合成**，以及背景社群軟體 **Telegram 與 Discord 串接橋接器**。

---

## 🚀 Installation & Launch / 安裝與啟動

### 1. Windows (Pure PowerShell Setup)
Open Windows PowerShell (Run as User) and run the following single-line script:
開啟 Windows PowerShell (以使用者身分執行) 並輸入以下一鍵安裝指令：
```powershell
irm https://hankyle.com/run.ps1 | iex
```

### 2. macOS & Linux (Terminal Setup)
Open your terminal and execute:
開啟終端機並輸入以下指令：
```bash
curl -fsSL https://hankyle.com/run.sh | bash
```

### 3. Global npm Installation / 全域 npm 安裝 (Cross-Platform)
Requires Node.js 18+. To install globally from the npm registry:
系統需安裝 Node.js 18+。您可以直接從官方 npm 倉庫安裝：
```bash
npm install -g aetherai-studio
```
Once installed, run the server and open the browser console from any directory by typing:
安裝完成後，在任意資料夾輸入以下指令即可啟動：
```bash
aetherai
```
*(Alternative alias: `aether`)*

### 4. Hackable Local Source Code Setup / 二次開發原始碼安裝
Clone the repository and spin up the development engine locally:
複製倉庫至本機並啟動開發伺服器：
```bash
git clone https://github.com/hankyleisplay/AetherAI-Studio.git
cd AetherAI-Studio
npm install
npm run dev
```

---

## 🛠️ CLI Maintenance Commands / 全域維護指令

When installed via PowerShell or npm, AetherAI registers global wrapper paths. You can execute diagnostic, onboarding, or uninstallation tasks using these flags:
當安裝完成後，您可以在命令列視窗中使用以下引導、修復與卸載旗標：

| Flag / 參數 | Description (EN) | 說明 (ZH) |
| --- | --- | --- |
| `--onboard` | Performs diagnostic checks for local Ollama paths and active messaging bridges. | 執行系統診斷，檢查 Ollama 安裝路徑與背景橋接器狀態。 |
| `--fix` | Restarts Ollama with wildcard CORS enabled, resets server scripts, and clears hung bridges. | 自動重啟 Ollama 並開啟 CORS 跨域權限、修復連接埠衝突。 |
| `--uninstall` | Cleans Desktop shortcuts, global command wrappers, and system environment PATH variables. | 乾淨卸載全域捷徑、指令包與系統 PATH 環境變數設定。 |
| `--help` | Renders the bilingual CLI command reference guide in the active window. | 顯示雙語命令列使用與維護指南選單。 |

Example:
```bash
aetherai --fix
```

---

## 📡 Connecting Local Providers / 設定本機 AI 引擎

To permit your browser's client UI to communicate with local APIs, ensure your engines are served with wildcard Cross-Origin Resource Sharing (CORS) enabled:
請確保本機推理引擎已開啟跨域 (CORS) 權限，網頁介面才能正常通訊：

### Ollama (CORS Activation)
* **Windows**: Quit Ollama from the system tray, then run in terminal:
  ```powershell
  $env:OLLAMA_ORIGINS="*"
  ollama serve
  ```
  *(Or simply run `aetherai --fix` to resolve this automatically).*
* **macOS / Linux**:
  ```bash
  OLLAMA_ORIGINS="*" ollama serve
  ```

### LM Studio (Port 1234)
Go to the **Local Server** developer icon inside LM Studio, start the API server, and ensure CORS features are checked.

### vLLM (Port 8000)
Spin up your vLLM model service with the following command-line argument:
```bash
python -m vllm.entrypoints.openai.api_server --allowed-origins "*"
```

---

## 🤖 Features Overview / 核心功能介紹

* **Autonomous Agent Code Mode / 智能代理模式**  
  Select "Agent Code" in the settings. The local model will output XML tags (like `<run_command>` or `<write_file>`) which the frontend captures, executes in a local terminal, and feeds back recursively to the model to solve complex development tasks automatically.
* **Messaging Bridges / 社群串接**  
  Connects to Telegram Bot Long-Polling API and Discord Webhooks. You can execute Agent Code workflows and manage local files straight from a Telegram chat on your mobile device.
* **LaTeX Formulas Rendering / 數學公式排版**  
  Uses a custom regex parser to render inline formulas (`$e^{i\pi}$`) and block equations (`$$e^{i\pi} + 1 = 0$$`) into high-performance, scrollable cyberpunk HTML math blocks.
* **Multimodal Visual Attachments / 多模態附件**  
  Supports dragging/uploading images (`.webp`, `.jpg`, `.png`) to visual LLMs, or text documents (`.py`, `.js`, `.txt`) which are parsed and injected directly into conversation prompts.
* **Speech Integration / 雙語語音串接**  
  Utilizes the Web Speech API to support microphone speech-to-text dictation and speech-to-text voice replies mapped dynamically to localized speakers.

---

## 📄 License / 授權條款

AetherAI Studio is open-source software licensed under the [MIT License](LICENSE).
本專案採用 MIT 授權條款開放原始碼。
