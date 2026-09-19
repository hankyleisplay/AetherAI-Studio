export type Language = 'zh-TW' | 'zh-CN' | 'en' | 'ja';

export interface TranslationRecord {
  [key: string]: string;
}

export const translations: Record<Language, TranslationRecord> = {
  'zh-TW': {
    // Brand & System
    'brand_name': 'AetherAI Studio 2.0',
    'brand_subtitle': 'AetherAgent 企業級自主系統',
    'system_title': '企業級本地與雲端雙模自主智能體系統 • Liquid Glass Optical Aesthetics',
    'system_desc': '已就緒支援 Ollama 本地開源模型與各主流雲端 LLM 引擎。',

    // Sidebar
    'new_session': '開啟新對話 (New Session)',
    'specialized_agents': '專業工程代理陣列',
    'create_agent': '配置專屬工程代理角色',
    'session_history': '會話歷程 (Session History)',
    'no_history': '尚無歷史會話紀錄',
    'delete_session': '刪除會話',
    'system_settings': '模型與系統配置 (Settings)',
    'collapse_sidebar': '收合側邊欄',
    'expand_sidebar': '展開側邊欄',

    // Header & Status
    'status_idle': '就緒 (Idle)',
    'status_thinking': '深度思考中...',
    'status_calling_tool': '調用工具中...',
    'status_generating': '正在生成...',
    'status_error': '異常中斷',
    'export_session': '匯出對話紀錄 (Markdown)',
    'default_agent_name': 'Aether 核心架構系統',
    'language_selector': '切換語系 (Language)',

    // Chat View & Prompts
    'chat_placeholder': '請輸入指令或問題... (可拖曳代碼/文字/數據檔案至此，Enter 發送)',
    'upload_file': '上傳檔案',
    'voice_input': '語音輸入',
    'voice_listening': '聆聽中...',
    'stop_generation': '停止生成',
    'send': '發送',
    'characters': '字元',
    'dual_mode_active': '全能雙模 Tool-Calling & ReAct 已啟用',
    'drag_drop_hint': '放開滑鼠即可將檔案上傳至工作區',
    'uploading': '上傳中...',

    // Suggestion Cards
    'sugg_1_title': '全球即時科技情報研析',
    'sugg_1_desc': '多來源交叉檢索國際最新開源模型與架構突破',
    'sugg_1_prompt': '請幫我檢索全球最新一週的頂尖 AI 開源模型進展（包含架構變革、推論效能與評測指標），並彙整為結構化技術簡報。',

    'sugg_2_title': '高階演算法沙盒數值驗證',
    'sugg_2_desc': '以 Python 沙盒即時編譯執行工程演算法與數值模型',
    'sugg_2_prompt': '請使用 Python 沙盒撰寫並驗證一個具備自適應權重的高階數值分析或圖論演算法，展示計算結果與執行效能指標。',

    'sugg_3_title': '工作區專案工程架構管理',
    'sugg_3_desc': '安全受控沙盒環境下的工程架構建立與檔案 I/O',
    'sugg_3_prompt': '請在 workspace 目錄中建立系統架構藍圖 architecture.md，結構化定義模組規格與資料流模型，並列出目錄檔案驗證。',

    'sugg_4_title': '主機硬體健康與資源指標診斷',
    'sugg_4_desc': '深度監控 CPU 運算負載、RAM 使用率與本機推論裕度',
    'sugg_4_prompt': '請全面診斷當前主機系統的硬體負載指標、記憶體分佈、磁碟空間健康狀態，並評估本機運行大模型推論的資源裕度。',

    // Message Item
    'thinking_process': '思維鏈分析 (Thinking Process)',
    'tool_execution_sequence': '智能體工具調用序列 :',
    'copy_code': '複製程式碼',
    'copy_answer': '複製回答',
    'copied': '已複製',
    'copy': '複製',
    'speak_answer': '朗讀回答',
    'speaking': '朗讀中',
    'speak_not_supported': '您的瀏覽器不支援語音朗讀功能',

    // Settings Modal
    'settings_center': 'AetherAI Studio 設定中心',
    'settings_sub': '自訂本地/雲端模型端點與社群橋接器 (Telegram)',
    'tab_llm': '模型端點與引擎 (LLM)',
    'tab_telegram': 'Telegram 橋接 (Bot Bridge)',
    'quick_presets': '快速預設提供者 (Quick Presets)',
    'api_base_url': 'API Base URL',
    'api_key': 'API Key (本地 Ollama / LM Studio 可留空)',
    'target_model': '目標模型名稱 (Model Name)',
    'test_and_pull': '測試連線並拉取模型',
    'hyperparameters': '模型推論超參數 (Hyperparameters)',
    'temperature': '創意隨機度 (Temperature)',
    'max_tokens': '最大輸出長度 (Max Tokens)',
    'close': '關閉',
    'save_model_settings': '儲存模型設定',

    // Telegram Tab
    'tg_agent_status': 'Telegram 智能代理狀態:',
    'tg_listening': '🟢 監聽中 (Active)',
    'tg_idle': '⚪ 未啟動 (Idle)',
    'tg_bot_token': 'Telegram Bot Token',
    'tg_token_from': '由 @BotFather 取得',
    'tg_token_placeholder': '輸入由 @BotFather 取得的 Token',
    'tg_chat_id': '授權存取 Chat ID (使用者或群組 ID)',
    'tg_chat_id_from': '向 @userinfobot 查詢',
    'tg_chat_id_placeholder': '例如: 987654321',
    'tg_security_tip': '安全提示：設定 Chat ID 後，僅授權的 Telegram 帳號可驅動 Agent，避免未授權調用。',
    'tg_test_connection': '測試 Telegram 連線',
    'tg_guide_title': 'Telegram 指令支援說明',
    'tg_guide_1': '傳送日常文字：自動進行推理思考，並調用 9 大工具執行任務。',
    'tg_guide_2': '/status：檢視伺服器連線、模型與工具狀態。',
    'tg_guide_3': '/tools：檢視所有已啟用工具清單。',
    'tg_guide_4': '/new：重設對話紀錄並開啟新 Session。',
    'tg_save': '儲存 Telegram 設定',

    // Persona Modal
    'persona_modal_title': '配置專屬工程代理角色',
    'persona_modal_sub': '定義客製化 System Prompt 與專屬授權工具集',
    'persona_name': '角色名稱',
    'persona_name_placeholder': '例如: 智慧合約稽核員',
    'persona_desc': '角色簡介',
    'persona_desc_placeholder': '簡要描述該角色的專業定位與工作執掌',
    'persona_icon': '角色圖示',
    'persona_prompt': '系統設定提示詞 (System Prompt)',
    'persona_tools': '授權工具鏈',
    'create_agent_btn': '建立專案代理角色',
    'cancel': '取消',

    // Common Alerts
    'alert_no_session': '請先在左側選取或開啟一個對話會話，方可匯出 Markdown。',
    'alert_empty_session': '當前會話尚無任何對話訊息可供匯出。',
  },

  'zh-CN': {
    // Brand & System
    'brand_name': 'AetherAI Studio 2.0',
    'brand_subtitle': 'AetherAgent 企业级自主系统',
    'system_title': '企业级本地与云端双模自主智能体系统 • Liquid Glass Optical Aesthetics',
    'system_desc': '已就绪支持 Ollama 本地开源模型与各主流云端 LLM 引擎。',

    // Sidebar
    'new_session': '开启新对话 (New Session)',
    'specialized_agents': '专业工程代理阵列',
    'create_agent': '配置专属工程代理角色',
    'session_history': '会话历程 (Session History)',
    'no_history': '尚无历史会话记录',
    'delete_session': '删除会话',
    'system_settings': '模型与系统配置 (Settings)',
    'collapse_sidebar': '收起侧边栏',
    'expand_sidebar': '展开侧边栏',

    // Header & Status
    'status_idle': '就绪 (Idle)',
    'status_thinking': '深度思考中...',
    'status_calling_tool': '调用工具中...',
    'status_generating': '正在生成...',
    'status_error': '异常中断',
    'export_session': '导出对话记录 (Markdown)',
    'default_agent_name': 'Aether 核心架构系统',
    'language_selector': '切换语言 (Language)',

    // Chat View & Prompts
    'chat_placeholder': '请输入指令或问题... (可拖拽代码/文本/数据文件至此，Enter 发送)',
    'upload_file': '上传文件',
    'voice_input': '语音输入',
    'voice_listening': '聆听中...',
    'stop_generation': '停止生成',
    'send': '发送',
    'characters': '字符',
    'dual_mode_active': '全能双模 Tool-Calling & ReAct 已启用',
    'drag_drop_hint': '松开鼠标即可将文件上传至工作区',
    'uploading': '上传中...',

    // Suggestion Cards
    'sugg_1_title': '全球即时科技情报研析',
    'sugg_1_desc': '多来源交叉检索国际最新开源模型与架构突破',
    'sugg_1_prompt': '请帮我检索全球最新一周的顶尖 AI 开源模型进展（包含架构变革、推理性能与评测指标），并汇总为结构化技术简报。',

    'sugg_2_title': '高阶算法沙盒数值验证',
    'sugg_2_desc': '以 Python 沙盒即时编译执行工程算法与数值模型',
    'sugg_2_prompt': '请使用 Python 沙盒编写并验证一个具备自适应权重的高阶数值分析或图论算法，展示计算结果与执行效能指标。',

    'sugg_3_title': '工作区专案工程架构管理',
    'sugg_3_desc': '安全受控沙盒环境下的工程架构建立与文件 I/O',
    'sugg_3_prompt': '请在 workspace 目录中建立系统架构蓝图 architecture.md，结构化定义模块规格与数据流模型，并列出目录文件验证。',

    'sugg_4_title': '主机硬件健康与资源指标诊断',
    'sugg_4_desc': '深度监控 CPU 计算负载、RAM 使用率与本机推理裕度',
    'sugg_4_prompt': '请全面诊断当前主机系统的硬件负载指标、内存分布、磁盘空间健康状态，并评估本机运行大模型推理的资源裕度。',

    // Message Item
    'thinking_process': '思维链分析 (Thinking Process)',
    'tool_execution_sequence': '智能体工具调用序列 :',
    'copy_code': '复制代码',
    'copy_answer': '复制回答',
    'copied': '已复制',
    'copy': '复制',
    'speak_answer': '朗读回答',
    'speaking': '朗读中',
    'speak_not_supported': '您的浏览器不支持语音朗读功能',

    // Settings Modal
    'settings_center': 'AetherAI Studio 设置中心',
    'settings_sub': '自定义本地/云端模型端点与社区桥接器 (Telegram)',
    'tab_llm': '模型端点与引擎 (LLM)',
    'tab_telegram': 'Telegram 桥接 (Bot Bridge)',
    'quick_presets': '快速预设提供商 (Quick Presets)',
    'api_base_url': 'API Base URL',
    'api_key': 'API Key (本地 Ollama / LM Studio 可留空)',
    'target_model': '目标模型名称 (Model Name)',
    'test_and_pull': '测试连接下拉模型',
    'hyperparameters': '模型推理超参数 (Hyperparameters)',
    'temperature': '创意随机度 (Temperature)',
    'max_tokens': '最大输出长度 (Max Tokens)',
    'close': '关闭',
    'save_model_settings': '保存模型设置',

    // Telegram Tab
    'tg_agent_status': 'Telegram 智能代理状态:',
    'tg_listening': '🟢 监听中 (Active)',
    'tg_idle': '⚪ 未启动 (Idle)',
    'tg_bot_token': 'Telegram Bot Token',
    'tg_token_from': '由 @BotFather 获取',
    'tg_token_placeholder': '输入由 @BotFather 获取的 Token',
    'tg_chat_id': '授权访问 Chat ID (用户或群组 ID)',
    'tg_chat_id_from': '向 @userinfobot 查询',
    'tg_chat_id_placeholder': '例如: 987654321',
    'tg_security_tip': '安全提示：设置 Chat ID 后，仅授权的 Telegram 账号可驱动 Agent，避免未授权调用。',
    'tg_test_connection': '测试 Telegram 连接',
    'tg_guide_title': 'Telegram 指令支持说明',
    'tg_guide_1': '发送日常文本：自动进行推理思考，并调用 9 大工具执行任务。',
    'tg_guide_2': '/status：查看服务器连接、模型与工具状态。',
    'tg_guide_3': '/tools：查看所有已启用工具清单。',
    'tg_guide_4': '/new：重设对话记录并开启新 Session。',
    'tg_save': '保存 Telegram 设置',

    // Persona Modal
    'persona_modal_title': '配置专属工程代理角色',
    'persona_modal_sub': '定义客制化 System Prompt 与专属授权工具集',
    'persona_name': '角色名称',
    'persona_name_placeholder': '例如: 智能合约审计员',
    'persona_desc': '角色简介',
    'persona_desc_placeholder': '简要描述该角色的专业定位与工作职责',
    'persona_icon': '角色图标',
    'persona_prompt': '系统设定提示词 (System Prompt)',
    'persona_tools': '授权工具链',
    'create_agent_btn': '建立专案代理角色',
    'cancel': '取消',

    // Common Alerts
    'alert_no_session': '请先在左侧选取或开启一个对话会话，方可导出 Markdown。',
    'alert_empty_session': '当前会话尚无任何对话消息可供导出。',
  },

  'en': {
    // Brand & System
    'brand_name': 'AetherAI Studio 2.0',
    'brand_subtitle': 'Enterprise Autonomous Agent System',
    'system_title': 'Enterprise Dual-Mode Autonomous AI Agent System • Liquid Glass Optics',
    'system_desc': 'Engineered for Ollama local models and major cloud LLM providers.',

    // Sidebar
    'new_session': 'New Session',
    'specialized_agents': 'Specialized Agent Roles',
    'create_agent': 'Configure Custom Agent',
    'session_history': 'Session History',
    'no_history': 'No sessions recorded',
    'delete_session': 'Delete Session',
    'system_settings': 'System & Model Settings',
    'collapse_sidebar': 'Collapse Sidebar',
    'expand_sidebar': 'Expand Sidebar',

    // Header & Status
    'status_idle': 'Idle',
    'status_thinking': 'Deep Thinking...',
    'status_calling_tool': 'Calling Tool...',
    'status_generating': 'Generating...',
    'status_error': 'Execution Interrupted',
    'export_session': 'Export Session (Markdown)',
    'default_agent_name': 'Aether Core Architect',
    'language_selector': 'Language',

    // Chat View & Prompts
    'chat_placeholder': 'Enter instruction or query... (Drop code/data files here, Enter to send)',
    'upload_file': 'Upload File',
    'voice_input': 'Voice Input',
    'voice_listening': 'Listening...',
    'stop_generation': 'Stop Generation',
    'send': 'Send',
    'characters': 'chars',
    'dual_mode_active': 'Dual-Mode Tool-Calling & ReAct Active',
    'drag_drop_hint': 'Release mouse to upload file into workspace',
    'uploading': 'Uploading...',

    // Suggestion Cards
    'sugg_1_title': 'Global Tech Intelligence Retrieval',
    'sugg_1_desc': 'Cross-reference and analyze the latest open-source AI breakthroughs',
    'sugg_1_prompt': 'Please search for the latest top open-source AI model releases this week (including architectural changes, benchmarks, and inference speed) and compile a structured technical report.',

    'sugg_2_title': 'Sandboxed Algorithm Verification',
    'sugg_2_desc': 'Compile and run engineering algorithms and numerical models via Python sandbox',
    'sugg_2_prompt': 'Please write and verify an advanced adaptive numerical analysis or graph algorithm in the Python sandbox, outputting computation results and runtime metrics.',

    'sugg_3_title': 'Workspace Project Architecture I/O',
    'sugg_3_desc': 'Construct architecture specifications and perform safe file I/O in the sandbox',
    'sugg_3_prompt': 'Please create an architecture blueprint architecture.md in the workspace directory, defining modular microservice specs and data flow models, then list files to verify.',

    'sugg_4_title': 'Host Hardware & Infrastructure Diagnostics',
    'sugg_4_desc': 'Deeply inspect CPU load, RAM usage, storage health, and local inference headroom',
    'sugg_4_prompt': 'Please run a comprehensive diagnostic on system hardware load, memory distribution, and storage health, and assess the headroom for running local LLM inference.',

    // Message Item
    'thinking_process': 'Thinking Process (Reasoning Chain)',
    'tool_execution_sequence': 'Agent Tool Execution Sequence :',
    'copy_code': 'Copy Code',
    'copy_answer': 'Copy Answer',
    'copied': 'Copied',
    'copy': 'Copy',
    'speak_answer': 'Read Aloud',
    'speaking': 'Speaking',
    'speak_not_supported': 'Your browser does not support speech synthesis.',

    // Settings Modal
    'settings_center': 'AetherAI Studio Settings Center',
    'settings_sub': 'Configure Local/Cloud LLM Endpoints & Community Bridges (Telegram)',
    'tab_llm': 'LLM Engines & Endpoints',
    'tab_telegram': 'Telegram Bridge',
    'quick_presets': 'Quick Presets',
    'api_base_url': 'API Base URL',
    'api_key': 'API Key (Leave empty for Ollama / LM Studio)',
    'target_model': 'Target Model Name',
    'test_and_pull': 'Test Connection & Discover Models',
    'hyperparameters': 'Inference Hyperparameters',
    'temperature': 'Temperature',
    'max_tokens': 'Max Tokens',
    'close': 'Close',
    'save_model_settings': 'Save Model Settings',

    // Telegram Tab
    'tg_agent_status': 'Telegram Bridge Status:',
    'tg_listening': '🟢 Active (Polling)',
    'tg_idle': '⚪ Inactive (Idle)',
    'tg_bot_token': 'Telegram Bot Token',
    'tg_token_from': 'Get from @BotFather',
    'tg_token_placeholder': 'Enter Token obtained from @BotFather',
    'tg_chat_id': 'Authorized Chat ID (User/Group)',
    'tg_chat_id_from': 'Query from @userinfobot',
    'tg_chat_id_placeholder': 'e.g. 987654321',
    'tg_security_tip': 'Security Tip: When Chat ID is configured, only this authorized Telegram account can interact with the agent.',
    'tg_test_connection': 'Test Telegram Connection',
    'tg_guide_title': 'Telegram Commands Reference',
    'tg_guide_1': 'Send text: Agent will reason autonomously and invoke tools.',
    'tg_guide_2': '/status: View server connection, model and tool status.',
    'tg_guide_3': '/tools: List all enabled agent tools.',
    'tg_guide_4': '/new: Reset conversation memory and start a new session.',
    'tg_save': 'Save Telegram Settings',

    // Persona Modal
    'persona_modal_title': 'Configure Specialized Agent',
    'persona_modal_sub': 'Define custom System Prompt and authorized tool permissions',
    'persona_name': 'Agent Name',
    'persona_name_placeholder': 'e.g. Smart Contract Auditor',
    'persona_desc': 'Description',
    'persona_desc_placeholder': 'Brief description of agent specialty and responsibilities',
    'persona_icon': 'Icon Style',
    'persona_prompt': 'System Prompt',
    'persona_tools': 'Authorized Tools',
    'create_agent_btn': 'Create Agent Role',
    'cancel': 'Cancel',

    // Common Alerts
    'alert_no_session': 'Please select or create a session before exporting markdown.',
    'alert_empty_session': 'Current session has no messages to export.',
  },

  'ja': {
    // Brand & System
    'brand_name': 'AetherAI Studio 2.0',
    'brand_subtitle': 'AetherAgent エンタープライズ自律システム',
    'system_title': 'ローカル＆クラウド対応 自律型 AI エージェントシステム • Liquid Glass Optics',
    'system_desc': 'Ollama ローカルモデルおよび主要クラウド LLM エンジンに対応しています。',

    // Sidebar
    'new_session': '新規チャット (New Session)',
    'specialized_agents': '専門エージェント陣列',
    'create_agent': 'カスタムエージェント設定',
    'session_history': '対話履歴 (Session History)',
    'no_history': '履歴がありません',
    'delete_session': 'セッションを削除',
    'system_settings': 'システム・モデル設定',
    'collapse_sidebar': 'サイドバーを閉じる',
    'expand_sidebar': 'サイドバーを開く',

    // Header & Status
    'status_idle': '待機中 (Idle)',
    'status_thinking': '思考中...',
    'status_calling_tool': 'ツール実行中...',
    'status_generating': '生成中...',
    'status_error': 'エラー終了',
    'export_session': '対話履歴をエクスポート (Markdown)',
    'default_agent_name': 'Aether コアアーキテクト',
    'language_selector': '言語切替 (Language)',

    // Chat View & Prompts
    'chat_placeholder': '指示や質問を入力... (コードやファイルをドロップ可能、Enter で送信)',
    'upload_file': 'ファイル追加',
    'voice_input': '音声入力',
    'voice_listening': '聞き取り中...',
    'stop_generation': '生成停止',
    'send': '送信',
    'characters': '文字',
    'dual_mode_active': 'Tool-Calling & ReAct 二重推論有効',
    'drag_drop_hint': 'ドロップしてワークスペースにアップロード',
    'uploading': 'アップロード中...',

    // Suggestion Cards
    'sugg_1_title': 'グローバル技術情報インテリジェンス',
    'sugg_1_desc': '世界最新のオープンソースモデルと技術動向を検索・要約',
    'sugg_1_prompt': '今週の最新トップオープンソース AI モデルの進展（アーキテクチャの変更、ベンチマーク、推論速度）を検索し、構造化された技術レポートを作成してください。',

    'sugg_2_title': 'サンドボックス高度アルゴリズム検証',
    'sugg_2_desc': 'Python サンドボックスでエンジニアリングアルゴリズムを即時実行',
    'sugg_2_prompt': 'Python サンドボックスを使用して適応型重み付けアルゴリズムを実装・検証し、計算結果と実行指標を表示してください。',

    'sugg_3_title': 'ワークスペース設計図・ファイル管理',
    'sugg_3_desc': 'サンドボックス環境でのアーキテクチャ構築と安全なファイル I/O',
    'sugg_3_prompt': 'workspace ディレクトリに設計書 architecture.md を作成し、モジュール仕様とデータフローを定義してください。',

    'sugg_4_title': 'ホストハードウェア診断・リソース監視',
    'sugg_4_desc': 'CPU 負荷、RAM 使用率、ローカル推論のマージンを精密監視',
    'sugg_4_prompt': '現在のホストシステムのハードウェア負荷、メモリ分布、ストレージ状態を総合診断し、ローカル推論の余裕度を評価してください。',

    // Message Item
    'thinking_process': '思考プロセス (Reasoning Chain)',
    'tool_execution_sequence': 'ツール実行シーケンス :',
    'copy_code': 'コードをコピー',
    'copy_answer': '回答をコピー',
    'copied': 'コピー完了',
    'copy': 'コピー',
    'speak_answer': '音声読み上げ',
    'speaking': '読み上げ中',
    'speak_not_supported': 'お使いのブラウザは音声合成に対応していません。',

    // Settings Modal
    'settings_center': 'AetherAI Studio 設定センター',
    'settings_sub': 'ローカル/クラウド LLM エンドポイントと Telegram 連携を設定',
    'tab_llm': 'LLM エンジン設定',
    'tab_telegram': 'Telegram 連携 (Bot Bridge)',
    'quick_presets': 'クイックプリセット',
    'api_base_url': 'API Base URL',
    'api_key': 'API Key (Ollama / LM Studio は空欄可)',
    'target_model': '対象モデル名 (Model Name)',
    'test_and_pull': '接続テストとモデル取得',
    'hyperparameters': '推論ハイパーパラメータ',
    'temperature': '温度 (Temperature)',
    'max_tokens': '最大トークン数 (Max Tokens)',
    'close': '閉じる',
    'save_model_settings': '設定を保存',

    // Telegram Tab
    'tg_agent_status': 'Telegram ボット状態:',
    'tg_listening': '🟢 監視中 (Active)',
    'tg_idle': '⚪ 停止中 (Idle)',
    'tg_bot_token': 'Telegram Bot トークン',
    'tg_token_from': '@BotFather から取得',
    'tg_token_placeholder': '@BotFather から取得したトークンを入力',
    'tg_chat_id': '承認 Chat ID (ユーザーまたはグループ)',
    'tg_chat_id_from': '@userinfobot で確認',
    'tg_chat_id_placeholder': '例: 987654321',
    'tg_security_tip': 'セキュリティ注意: Chat ID を設定すると、指定のアカウントのみがエージェントを操作できます。',
    'tg_test_connection': 'Telegram 接続テスト',
    'tg_guide_title': 'Telegram コマンド一覧',
    'tg_guide_1': 'テキスト送信: エージェントが自律思考しツールを実行します。',
    'tg_guide_2': '/status: サーバ接続とモデル状態を確認。',
    'tg_guide_3': '/tools: 有効なツール一覧を表示。',
    'tg_guide_4': '/new: 記憶をリセットし新規セッションを開始。',
    'tg_save': 'Telegram 設定を保存',

    // Persona Modal
    'persona_modal_title': '専門エージェント役割の設定',
    'persona_modal_sub': '専用システムプロンプトとツール実行権限を構成',
    'persona_name': '役割名',
    'persona_name_placeholder': '例: スマートコントラクト監査役',
    'persona_desc': '概要',
    'persona_desc_placeholder': 'この役割の専門領域と職責を簡潔に入力',
    'persona_icon': 'アイコン',
    'persona_prompt': 'システムプロンプト (System Prompt)',
    'persona_tools': '許可ツール',
    'create_agent_btn': 'エージェントを作成',
    'cancel': 'キャンセル',

    // Common Alerts
    'alert_no_session': 'エクスポートする前に左側のセッションを選択してください。',
    'alert_empty_session': '現在のセッションにはエクスポートするメッセージがありません。',
  }
};
