/* ==========================================================================
   AetherAI Studio - Internationalization (i18n) Translations Dictionary
   ========================================================================== */

const translations = {
  "zh-TW": {
    // Brand & Sidebar
    "brand_title": "AetherAI Studio",
    "btn_new_chat": "開啟新對話",
    "btn_clear_all": "清除所有歷史",
    "history_empty": "無歷史對話紀錄",
    "history_loading": "載入對話歷史中...",
    "btn_del_chat": "刪除對話",
    
    // Chat Header
    "provider_label": "來源：",
    "btn_export": "匯出對話",
    
    // Welcome Panel
    "welcome_title": "AetherAI Studio",
    "welcome_desc": "極致奢華的 Local AI 遊樂場。連接您的 Ollama 本機服務，或透過智慧離線仿真進行參數調試與創作。",
    
    // Welcome Presets Subtitle
    "preset_general_title": "全能助理",
    "preset_general_desc": "邏輯思維與企劃寫作",
    "preset_coder_title": "代碼架構師",
    "preset_coder_desc": "程式碼撰寫與重構分析",
    "preset_uiux_title": "UI/UX 評委",
    "preset_uiux_desc": "嚴苛的體驗與美學點評",
    "preset_english_title": "語系學習教練",
    "preset_english_desc": "糾錯與道地英語口語",

    // Chat Inputs
    "chat_placeholder": "輸入訊息與 AetherAI 對話... (Enter 發送，Shift+Enter 換行)",
    "btn_stop": "中斷生成",
    
    // Right Panel Control
    "panel_title": "AI 控制面板",
    "settings_source_title": "模型來源設定",
    "provider_select_label": "模型供應商",
    "ollama_url_label": "Ollama API 位址",
    "custom_url_label": "API 端點位址 (Endpoint)",
    "api_key_label": "API 金鑰 (Bearer Token)",
    "model_select_label": "AI 核心模型",
    
    "settings_tuning_title": "超參數微調 (Tuning)",
    "temp_label": "溫度權重 (Temperature)",
    "tokens_label": "最大 Token 限制 (Max Tokens)",
    "topp_label": "Top-P 核心採樣 (Top-P Sampling)",
    "topk_label": "Top-K 候選採樣 (Top-K Sampling)",
    "penalty_label": "重複懲罰權重 (Repeat Penalty)",
    "system_prompt_label": "自定義系統提示詞 / 人設 (System Prompt / Persona)",
    
    "system_prompt_title": "系統設定 (System Prompt)",
    "system_prompt_placeholder": "定義 AI 的人設、背景、專業能力與回應要求...",
    
    // Alert Boxes
    "confirm_del_all": "您確定要永久刪除所有歷史對話記錄嗎？此動作將無法復原。",
    "confirm_del_chat": "確定要永久刪除此對話嗎？",

    // Settings Modal
    "settings_title": "AetherAI Studio 設定中心",
    "tab_models": "模型與連線",
    "tab_advanced": "高級人設與參數",
    "tab_bridges": "社群軟體串接",
    "bridge_telegram_title": "Telegram Bot 串接",
    "telegram_token_label": "Telegram Bot Token",
    "telegram_token_placeholder": "輸入由 @BotFather 取得的 Token",
    "telegram_chat_id_label": "Telegram Chat ID (User/Group)",
    "telegram_chat_id_placeholder": "輸入您的 Chat ID (可向 @userinfobot 查詢)",
    "btn_save_settings": "儲存並套用設定",
    "toast_settings_saved": "設定已儲存並套用！",
    "tab_modelhub": "模型商店 (Hub)",
    "modelhub_title": "Ollama 模型商店 (Model Hub)",
    "modelhub_desc": "在這裡您可以直接下載並安裝 Ollama 本地模型，下載過程無需開啟終端機。",
    "modelhub_desc_deepseek_1_5b": "超輕量推理模型 · 1.1 GB",
    "modelhub_desc_deepseek_7b": "主流中階推理模型 · 4.7 GB",
    "modelhub_desc_llama_3_1": "Meta 全功能通用模型 · 4.7 GB",
    "modelhub_desc_qwen_coder": "阿里最強程式寫作模型 · 4.7 GB",
    "modelhub_desc_gemma_2": "Google 高效能迷你模型 · 1.6 GB",
    "modelhub_btn_pull": "下載 (Pull)",
    "modelhub_input_placeholder": "輸入其它 Ollama 模型名稱 (如 phi4)",
    "modelhub_btn_pull_custom": "下載其它",
    "preset_custom_title": "自訂人設",
    "modelhub_status_init": "正在初始化",
    "modelhub_status_success": "下載完成",
    "modelhub_status_fail": "下載失敗",
    "modelhub_alert_empty_name": "請輸入有效的模型名稱！"
  },
  "en": {
    // Brand & Sidebar
    "brand_title": "AetherAI Studio",
    "btn_new_chat": "New Chat",
    "btn_clear_all": "Clear History",
    "history_empty": "No Chat History",
    "history_loading": "Loading history...",
    "btn_del_chat": "Delete Chat",
    
    // Chat Header
    "provider_label": "Source: ",
    "btn_export": "Export Chat",
    
    // Welcome Panel
    "welcome_title": "AetherAI Studio",
    "welcome_desc": "The ultimate Local AI playground. Connect your local Ollama services, or use intelligent offline simulations to tune parameters and create.",
    
    // Welcome Presets Subtitle
    "preset_general_title": "Generalist AI",
    "preset_general_desc": "Reasoning & creative writing",
    "preset_coder_title": "Code Architect",
    "preset_coder_desc": "Code generation & debugging",
    "preset_uiux_title": "UI/UX Critique",
    "preset_uiux_desc": "Brutally honest feedback",
    "preset_english_title": "Language Coach",
    "preset_english_desc": "Grammar tuning & idioms",

    // Chat Inputs
    "chat_placeholder": "Type a message to chat with AetherAI... (Enter to send, Shift+Enter for newline)",
    "btn_stop": "Cancel Generation",
    
    // Right Panel Control
    "panel_title": "AI Control Panel",
    "settings_source_title": "Model Provider Settings",
    "provider_select_label": "Model Provider",
    "ollama_url_label": "Ollama API Endpoint",
    "custom_url_label": "Custom API URL",
    "api_key_label": "API Key (Bearer Token)",
    "model_select_label": "AI Core Model",
    
    "settings_tuning_title": "Hyperparameters Tuning",
    "temp_label": "Temperature Weight",
    "tokens_label": "Max Tokens Limit",
    "topp_label": "Top-P Sampling",
    "topk_label": "Top-K Sampling",
    "penalty_label": "Repeat Penalty",
    "system_prompt_label": "System Prompt / Persona",
    
    "system_prompt_title": "System Prompt",
    "system_prompt_placeholder": "Define the AI persona, background, skills, and output guidelines...",
    
    // Alert Boxes
    "confirm_del_all": "Are you absolutely sure you want to permanently delete all conversation history? This cannot be undone.",
    "confirm_del_chat": "Are you sure you want to permanently delete this chat?",

    // Settings Modal
    "settings_title": "AetherAI Studio Settings",
    "tab_models": "Models & Connection",
    "tab_advanced": "Advanced & Tuning",
    "tab_bridges": "Messaging Bridges",
    "bridge_telegram_title": "Telegram Bot Integration",
    "telegram_token_label": "Telegram Bot Token",
    "telegram_token_placeholder": "Enter Bot Token from @BotFather",
    "telegram_chat_id_label": "Telegram Chat ID (User/Group)",
    "telegram_chat_id_placeholder": "Enter Chat ID (e.g. from @userinfobot)",
    "btn_save_settings": "Save & Apply Settings",
    "toast_settings_saved": "Settings updated successfully!",
    "tab_modelhub": "Model Hub",
    "modelhub_title": "Ollama Model Hub",
    "modelhub_desc": "Download and install Ollama local models directly from here without opening the terminal.",
    "modelhub_desc_deepseek_1_5b": "Ultra-lightweight reasoning model · 1.1 GB",
    "modelhub_desc_deepseek_7b": "Mainstream mid-range reasoning model · 4.7 GB",
    "modelhub_desc_llama_3_1": "Meta full-featured general model · 4.7 GB",
    "modelhub_desc_qwen_coder": "Alibaba powerful code generation model · 4.7 GB",
    "modelhub_desc_gemma_2": "Google high-performance mini model · 1.6 GB",
    "modelhub_btn_pull": "Pull",
    "modelhub_input_placeholder": "Enter other Ollama model name (e.g. phi4)",
    "modelhub_btn_pull_custom": "Pull Custom",
    "preset_custom_title": "Custom Persona",
    "modelhub_status_init": "Initializing",
    "modelhub_status_success": "Download complete",
    "modelhub_status_fail": "Download failed",
    "modelhub_alert_empty_name": "Please enter a valid model name!"
  },
  "ja": {
    // Brand & Sidebar
    "brand_title": "AetherAI Studio",
    "btn_new_chat": "新規対話",
    "btn_clear_all": "履歴クリア",
    "history_empty": "会話履歴なし",
    "history_loading": "読み込み中...",
    "btn_del_chat": "対話を削除",
    
    // Chat Header
    "provider_label": "ソース：",
    "btn_export": "履歴を出力",
    
    // Welcome Panel
    "welcome_title": "AetherAI Studio",
    "welcome_desc": "極上のローカルAIプレイグラウンド。本機のOllamaサービスに接続するか、高度なオフラインシミュレーションでパラメータ調整や創作を行えます。",
    
    // Welcome Presets Subtitle
    "preset_general_title": "万能アシスタント",
    "preset_general_desc": "論理的思考とコンテンツ企画",
    "preset_coder_title": "コード設計者",
    "preset_coder_desc": "コーディングと構造リファクタリング",
    "preset_uiux_title": "UI/UX 批評家",
    "preset_uiux_desc": "厳格な体験と美学的批評",
    "preset_english_title": "語学コーチ",
    "preset_english_desc": "文法修正とネイティブ英語",

    // Chat Inputs
    "chat_placeholder": "AetherAI にメッセージを入力... (Enterで送信、Shift+Enterで改行)",
    "btn_stop": "生成を中止",
    
    // Right Panel Control
    "panel_title": "AI コントロールパネル",
    "settings_source_title": "モデルソース設定",
    "provider_select_label": "プロバイダー",
    "ollama_url_label": "Ollama API アドレス",
    "custom_url_label": "カスタム API アドレス",
    "api_key_label": "API キー",
    "model_select_label": "コア AI モデル",
    
    "settings_tuning_title": "パラメータ微調整",
    "temp_label": "温度パラメータ",
    "tokens_label": "最大トークン制限",
    "topp_label": "Top-P サンプリング",
    "topk_label": "Top-K サンプリング",
    "penalty_label": "繰り返しペナルティ (Repeat Penalty)",
    "system_prompt_label": "システムプロンプト / ペルソナ",
    
    "system_prompt_title": "システム設定 (System Prompt)",
    "system_prompt_placeholder": "AI のキャラクター、専門知識、応答ガイドラインを定義します...",
    
    // Alert Boxes
    "confirm_del_all": "すべての履歴を完全に削除してもよろしいですか？この操作は取り消せません。",
    "confirm_del_chat": "この会話を完全に削除してもよろしいですか？",

    // Settings Modal
    "settings_title": "AetherAI Studio 設定センター",
    "tab_models": "モデルと接続",
    "tab_advanced": "プロンプトとパラメータ",
    "tab_bridges": "ブリッジ連携",
    "bridge_telegram_title": "Telegram Bot 連携",
    "telegram_token_label": "Telegram Bot トークン",
    "telegram_token_placeholder": "@BotFather から取得したトークンを入力",
    "telegram_chat_id_label": "Telegram チャットID (ユーザー/グループ)",
    "telegram_chat_id_placeholder": "チャットIDを入力 (例: @userinfobot から取得)",
    "btn_save_settings": "設定を保存して適用",
    "toast_settings_saved": "設定を保存して適用しました！",
    "tab_modelhub": "モデルハブ (Hub)",
    "modelhub_title": "Ollama モデルストア (Model Hub)",
    "modelhub_desc": "端末を開かずに、ここから直接Ollamaローカルモデルをダウンロードしてインストールします。",
    "modelhub_desc_deepseek_1_5b": "超軽量推論モデル · 1.1 GB",
    "modelhub_desc_deepseek_7b": "主流中位推論モデル · 4.7 GB",
    "modelhub_desc_llama_3_1": "Meta多機能汎用モデル · 4.7 GB",
    "modelhub_desc_qwen_coder": "アリババの強力なコード生成モデル · 4.7 GB",
    "modelhub_desc_gemma_2": "Google高性能ミニモデル · 1.6 GB",
    "modelhub_btn_pull": "ダウンロード",
    "modelhub_input_placeholder": "他のOllamaモデル名を入力（例：phi4）",
    "modelhub_btn_pull_custom": "カスタムダウンロード",
    "preset_custom_title": "カスタムペルソナ",
    "modelhub_status_init": "初期化中",
    "modelhub_status_success": "ダウンロード完了",
    "modelhub_status_fail": "ダウンロード失敗",
    "modelhub_alert_empty_name": "有効なモデル名を入力してください！"
  }
};

export { translations };
