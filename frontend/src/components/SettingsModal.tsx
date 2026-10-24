import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  Activity, 
  Eye, 
  EyeOff, 
  Server, 
  Cloud, 
  HardDrive, 
  Sliders, 
  Sparkles,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  ExternalLink,
  Radio,
  Wrench,
  Search,
  GitBranch,
  Database,
  Binary,
  FileCode2,
  Archive,
  Globe,
  FileSearch,
  BarChart3,
  Network,
  FileText,
  Terminal,
  Code2,
  Cpu,
  AlertTriangle
} from 'lucide-react';
import { ModelConfig, ToolDefinition, HardwareCheckResult, HardwareIssue, CodeToolInfo } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ModelConfig;
  onSaveConfig: (config: ModelConfig) => Promise<void>;
  onModelsDetected?: (models: string[]) => void;
  tools?: ToolDefinition[];
  onToggleTool?: (name: string, enabled: boolean) => Promise<void>;
  onRefreshTools?: () => Promise<void>;
  initialTab?: 'model' | 'telegram' | 'tools' | 'security';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onModelsDetected,
  tools = [],
  onToggleTool,
  onRefreshTools,
  initialTab = 'model'
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'model' | 'telegram' | 'tools' | 'security'>(initialTab);
  const [toolSearch, setToolSearch] = useState('');
  const [isBatchToggling, setIsBatchToggling] = useState(false);
  const [formData, setFormData] = useState<ModelConfig>({ ...config });
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency_ms?: number;
    models?: string[];
    error?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hwCheck, setHwCheck] = useState<HardwareCheckResult | null>(null);
  // Toolbox has two sets: the 22 chat tools and the Code-mode agent's own coding tools
  const [toolScope, setToolScope] = useState<'chat' | 'code'>('chat');
  const [codeTools, setCodeTools] = useState<CodeToolInfo[]>([]);
  const [isCheckingHw, setIsCheckingHw] = useState(false);

  // Telegram Bridge State
  const [telegramConfig, setTelegramConfig] = useState<{
    token: string;
    chat_id: string;
    enabled: boolean;
  }>({
    token: '',
    chat_id: '',
    enabled: false
  });
  const [telegramStatus, setTelegramStatus] = useState<{
    enabled: boolean;
    running: boolean;
    bot_username: string | null;
    configured_chat_id: string;
    has_token: boolean;
    last_active: string | null;
    error: string | null;
  } | null>(null);
  const [showTgToken, setShowTgToken] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    success: boolean;
    bot_username?: string;
    bot_name?: string;
    message?: string;
    error?: string;
  } | null>(null);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);

  // Security PIN State
  const [pinStatus, setPinStatus] = useState<{ pin_protected: boolean }>({ pin_protected: false });
  const [pinInput, setPinInput] = useState('');
  const [oldPinInput, setOldPinInput] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState('');

  const fetchPinStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        setPinStatus(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'security') fetchPinStatus();
  }, [activeTab]);

  const fetchCodeTools = async () => {
    try {
      const res = await fetch('/api/code/tools');
      if (res.ok) setCodeTools(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (isOpen && activeTab === 'tools') fetchCodeTools();
  }, [isOpen, activeTab]);

  const handleToggleCodeTool = async (name: string, enabled: boolean) => {
    setCodeTools(prev => prev.map(ct => ct.name === name ? { ...ct, enabled } : ct));
    try {
      const res = await fetch(`/api/code/tools/${name}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      fetchCodeTools();
    }
  };

  const handleSavePin = async (enable: boolean) => {
    setIsSavingPin(true);
    setPinMsg('');
    try {
      const res = await fetch('/api/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_pin: oldPinInput || undefined,
          new_pin: enable ? pinInput : undefined,
          enabled: enable
        })
      });
      if (res.ok) {
        setPinMsg(enable ? t('pin_enabled_msg', '✅ 外網 PIN 碼已成功啟用並更新！') : t('pin_disabled_msg', 'ℹ️ 已停用外網 PIN 碼保護'));
        setPinInput('');
        setOldPinInput('');
        fetchPinStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        setPinMsg(t('pin_set_failed', '❌ 設定失敗: {error}', { error: err.detail || t('check_input', '請檢查輸入') }));
      }
    } catch (e: any) {
      setPinMsg(t('pin_conn_failed', '❌ 連線失敗: {error}', { error: e.message }));
    } finally {
      setIsSavingPin(false);
    }
  };

  const probeModelsForConfig = async (targetConfig: ModelConfig) => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetConfig)
      });
      const data = await res.json();
      setTestResult(data);
      if (data.models && data.models.length > 0) {
        if (onModelsDetected) {
          onModelsDetected(data.models);
        }
        setFormData((prev) => {
          const shouldSwitchDefault = !prev.model || !data.models.includes(prev.model);
          return shouldSwitchDefault ? { ...prev, model: data.models[0] } : prev;
        });
      } else {
        if (onModelsDetected) {
          onModelsDetected([]);
        }
        if (['ollama', 'lm_studio', 'openai_compatible'].includes(targetConfig.provider)) {
          setFormData((prev) => ({ ...prev, model: '' }));
        }
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || t('backend_unreachable', '無法連線至後端伺服器') });
    } finally {
      setIsTesting(false);
    }
  };

  const getLocalizedError = (errStr?: string) => {
    if (!errStr) return '';
    if (errStr.includes('Ollama')) return t('err_ollama_unreachable', '無法連線至本機 Ollama 服務，請確認 Ollama 是否已啟動。');
    if (errStr.includes('API Key') || errStr.includes('API Key 無效')) return t('err_api_key_invalid', 'API Key 無效或未授權，已預載官方可用模型清單。');
    if (errStr.includes('Connection failed') || errStr.includes('連線失敗')) return t('err_connection_failed', '伺服器連線失敗，請檢查網路連線或端點位址。');
    return errStr;
  };

  // Sync formData, tab and auto-probe models when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const initialConfig = { ...config };
      setFormData(initialConfig);
      probeModelsForConfig(initialConfig);

      fetch('/api/telegram/status')
        .then((res) => res.json())
        .then((data) => {
          setTelegramStatus(data);
          setTelegramConfig((prev) => ({
            ...prev,
            enabled: data.enabled || false,
            chat_id: data.configured_chat_id || ''
          }));
        })
        .catch((err) => console.error('Failed to fetch telegram status:', err));
    }
  }, [isOpen, config, initialTab]);

  // Hardware capability check: re-evaluate (debounced) whenever the generation budget or model changes
  useEffect(() => {
    if (!isOpen || activeTab !== 'model') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsCheckingHw(true);
      try {
        const res = await fetch('/api/models/hardware-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          signal: controller.signal
        });
        if (res.ok) setHwCheck(await res.json());
      } catch (err: any) {
        if (err?.name !== 'AbortError') setHwCheck(null);
      } finally {
        if (!controller.signal.aborted) setIsCheckingHw(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, activeTab, formData.provider, formData.model, formData.base_url, formData.context_window, formData.max_tokens]);

  if (!isOpen) return null;

  const hwIssueText = (issue: HardwareIssue) => t(`hw_issue_${issue.code}`, issue.code, issue.params);

  const applyHwRecommendation = () => {
    if (!hwCheck?.recommended) return;
    setFormData({
      ...formData,
      context_window: hwCheck.recommended.context_window,
      max_tokens: hwCheck.recommended.max_tokens
    });
  };

  const presets = [
    {
      id: 'ollama',
      name: 'Ollama (本地/Local)',
      type: 'local',
      url: 'http://localhost:11434',
      defaultModel: 'llama3:latest',
      requireKey: false
    },
    {
      id: 'lm_studio',
      name: 'LM Studio (本地/Local)',
      type: 'local',
      url: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
      requireKey: false
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'cloud',
      url: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      requireKey: true
    },
    {
      id: 'openai',
      name: 'OpenAI (GPT-4o)',
      type: 'cloud',
      url: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      requireKey: true
    },
    {
      id: 'claude',
      name: 'Anthropic Claude',
      type: 'cloud',
      url: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-5-sonnet-20241022',
      requireKey: true
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      url: 'https://generativelanguage.googleapis.com',
      defaultModel: 'gemini-2.5-flash',
      requireKey: true
    },
    {
      id: 'groq',
      name: 'Groq (Ultra-Fast)',
      type: 'cloud',
      url: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      requireKey: true
    }
  ];

  const handleSelectPreset = (preset: typeof presets[0]) => {
    let providerName = preset.id;
    if (preset.id === 'claude') providerName = 'anthropic';
    if (preset.id === 'lm_studio') providerName = 'openai_compatible';

    const nextConfig: ModelConfig = {
      ...formData,
      provider: providerName as any,
      base_url: preset.url,
      model: preset.defaultModel
    };
    setFormData(nextConfig);
    setTestResult(null);
    probeModelsForConfig(nextConfig);
  };

  const handleTestConnection = async () => {
    await probeModelsForConfig(formData);
  };

  const handleSaveModel = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig(formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: telegramConfig.token,
          chat_id: telegramConfig.chat_id || null
        })
      });
      const data = await res.json();
      setTelegramTestResult(data);
    } catch (err: any) {
      setTelegramTestResult({ success: false, error: err.message || t('test_request_failed', '測試請求失敗') });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramConfig)
      });
      const data = await res.json();
      setTelegramStatus(data.bridge);
      alert(t('tg_saved', 'Telegram 橋接設定已儲存！') + (telegramConfig.enabled ? ' ' + t('tg_started', '橋接服務已啟動。') : ''));
    } catch (err: any) {
      alert(t('save_failed', '儲存失敗') + ': ' + err.message);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const getToolMeta = (name: string) => {
    switch (name) {
      case 'bash_executor':
        return { icon: <Terminal className="w-4 h-4 text-emerald-400" />, category: t('tool_cat_terminal', '系統終端'), bg: 'bg-emerald-500/15 border-emerald-500/30' };
      case 'system_status':
        return { icon: <Server className="w-4 h-4 text-emerald-400" />, category: t('tool_cat_system', '系統指標'), bg: 'bg-emerald-500/15 border-emerald-500/30' };
      case 'python_eval':
        return { icon: <Code2 className="w-4 h-4 text-cyan-400" />, category: t('tool_cat_code_exec', '代碼執行'), bg: 'bg-cyan-500/15 border-cyan-500/30' };
      case 'code_linter_analyzer':
        return { icon: <FileCode2 className="w-4 h-4 text-cyan-400" />, category: t('tool_cat_code_analysis', '代碼分析'), bg: 'bg-cyan-500/15 border-cyan-500/30' };
      case 'git_version_control':
        return { icon: <GitBranch className="w-4 h-4 text-orange-400" />, category: t('tool_cat_vcs', '版本控制'), bg: 'bg-orange-500/15 border-orange-500/30' };
      case 'database_sqlite_inspector':
        return { icon: <Database className="w-4 h-4 text-blue-400" />, category: t('tool_cat_database', '資料庫'), bg: 'bg-blue-500/15 border-blue-500/30' };
      case 'file_system':
        return { icon: <HardDrive className="w-4 h-4 text-amber-400" />, category: t('tool_cat_files', '檔案操作'), bg: 'bg-amber-500/15 border-amber-500/30' };
      case 'archive_compressor':
        return { icon: <Archive className="w-4 h-4 text-amber-400" />, category: t('tool_cat_archive', '壓縮歸檔'), bg: 'bg-amber-500/15 border-amber-500/30' };
      case 'document_text_extractor':
        return { icon: <FileText className="w-4 h-4 text-indigo-400" />, category: t('tool_cat_documents', '文檔提取'), bg: 'bg-indigo-500/15 border-indigo-500/30' };
      case 'web_search':
        return { icon: <Search className="w-4 h-4 text-cyan-400" />, category: t('tool_cat_search', '網路檢索'), bg: 'bg-cyan-500/15 border-cyan-500/30' };
      case 'read_url':
        return { icon: <ExternalLink className="w-4 h-4 text-cyan-400" />, category: t('tool_cat_reader', '網頁閱讀'), bg: 'bg-cyan-500/15 border-cyan-500/30' };
      case 'http_request_api':
        return { icon: <Globe className="w-4 h-4 text-teal-400" />, category: t('tool_cat_api', 'API 呼叫'), bg: 'bg-teal-500/15 border-teal-500/30' };
      case 'network_dns_whois_lookup':
        return { icon: <Network className="w-4 h-4 text-teal-400" />, category: t('tool_cat_network', '網路診斷'), bg: 'bg-teal-500/15 border-teal-500/30' };
      case 'ocr_extractor':
      case 'image_to_text':
        return { icon: <Eye className="w-4 h-4 text-pink-400" />, category: t('tool_cat_vision', '多模態視覺'), bg: 'bg-pink-500/15 border-pink-500/30' };
      case 'generate_chart':
        return { icon: <BarChart3 className="w-4 h-4 text-purple-400" />, category: t('tool_cat_chart', '圖表繪製'), bg: 'bg-purple-500/15 border-purple-500/30' };
      case 'mermaid_generator':
        return { icon: <Sliders className="w-4 h-4 text-purple-400" />, category: t('tool_cat_diagram', '架構圖繪製'), bg: 'bg-purple-500/15 border-purple-500/30' };
      case 'regex_pattern_matcher':
        return { icon: <FileSearch className="w-4 h-4 text-yellow-400" />, category: t('tool_cat_regex', '正則表達式'), bg: 'bg-yellow-500/15 border-yellow-500/30' };
      case 'hash_crypto_inspector':
        return { icon: <Binary className="w-4 h-4 text-red-400" />, category: t('tool_cat_crypto', '加密哈希'), bg: 'bg-red-500/15 border-red-500/30' };
      case 'data_transformer_converter':
        return { icon: <RefreshCw className="w-4 h-4 text-violet-400" />, category: t('tool_cat_transform', '資料轉換'), bg: 'bg-violet-500/15 border-violet-500/30' };
      case 'datetime_calc':
        return { icon: <Activity className="w-4 h-4 text-sky-400" />, category: t('tool_cat_datetime', '時間計算'), bg: 'bg-sky-500/15 border-sky-500/30' };
      case 'knowledge_memory':
        return { icon: <Sparkles className="w-4 h-4 text-amber-400" />, category: t('tool_cat_memory', '知識記憶'), bg: 'bg-amber-500/15 border-amber-500/30' };
      default:
        return { icon: <Wrench className="w-4 h-4 text-slate-400" />, category: t('tool_cat_general', '通用工具'), bg: 'bg-slate-500/15 border-slate-500/30' };
    }
  };

  const handleBatchToggle = async (enabled: boolean) => {
    setIsBatchToggling(true);
    try {
      await fetch('/api/tools/batch/toggle-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (onRefreshTools) {
        await onRefreshTools();
      }
    } catch (e) {
      console.error('Batch toggle failed:', e);
    } finally {
      setIsBatchToggling(false);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    if (onToggleTool) {
      await onToggleTool(name, enabled);
    } else {
      await fetch(`/api/tools/${name}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (onRefreshTools) await onRefreshTools();
    }
  };

  const filteredTools = tools.filter((tool) => {
    if (!toolSearch.trim()) return true;
    const query = toolSearch.toLowerCase();
    return tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-3xl glass-panel rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('settings_center', 'Aether AI Studio 設定中心')}</h3>
              <p className="text-xs text-slate-400">{t('settings_sub', '自訂本地/雲端模型端點、22 大工具箱權限與社群橋接器')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 px-6 pt-2 gap-4 bg-white/[0.02]">
          <button
            onClick={() => setActiveTab('model')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'model'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{t('tab_llm', '模型端點與引擎 (LLM)')}</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{t('tab_security', '外網安全 (Security PIN)')}</span>
          </button>

          <button
            onClick={() => setActiveTab('tools')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'tools'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('tab_toolbox', '工具箱管理')}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              tools.filter(t => t.enabled).length > 0
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}>
              {tools.filter(t => t.enabled).length}/{tools.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'telegram'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5 text-blue-400" />
            <span>{t('tab_telegram', 'Telegram 橋接 (Bot Bridge)')}</span>
            {telegramStatus?.enabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            )}
          </button>
        </div>

        {/* Content Body: Tab 1 - Model Settings */}
        {activeTab === 'model' && (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Quick Presets */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                {t('quick_presets', '快速預設提供者 (Quick Presets)')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => {
                  const isCurrent = formData.base_url === p.url;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreset(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border ${
                        isCurrent
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(0,242,254,0.2)] font-semibold'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      {p.type === 'local' ? (
                        <HardDrive className="w-3 h-3 text-cyan-400" />
                      ) : (
                        <Cloud className="w-3 h-3 text-purple-400" />
                      )}
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('api_base_url', 'API Base URL')}
              </label>
              <input
                type="text"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="http://localhost:11434 或 https://api.openai.com/v1"
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('api_key', 'API Key (本地 Ollama / LM Studio 可留空)')}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={formData.api_key || ''}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Model Name & Discovery */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {t('target_model', '目標模型名稱 (Model Name)')}
                </label>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  {isTesting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>{t('test_and_pull', '測試連線並拉取模型')}</span>
                </button>
              </div>

              {testResult?.models && testResult.models.length > 0 && (
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">
                    {t('detected_models_select', '從已探測的可用模型中快速選擇')} ({testResult.models.length})
                  </span>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100 bg-slate-900/80 cursor-pointer"
                  >
                    {!testResult.models.includes(formData.model) && formData.model && (
                      <option value={formData.model} className="bg-slate-900 text-cyan-300">
                        {formData.model}
                      </option>
                    )}
                    {testResult.models.map((m) => (
                      <option key={m} value={m} className="bg-slate-900 text-slate-100">
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                {testResult?.models && testResult.models.length > 0 && (
                  <span className="text-[11px] text-slate-400 block mb-1">
                    {t('custom_model_input', '或手動輸入自訂模型名稱')}
                  </span>
                )}
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder={t('model_name_placeholder', '例如: llama3:latest 或 gpt-4o')}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100"
                />
              </div>

              {/* Test Result Message */}
              {testResult && (
                <div
                  className={`mt-2 p-3 rounded-xl text-xs flex items-start gap-2 border ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <Activity className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    {testResult.success ? (
                      <div>
                        <div className="font-semibold">
                          {t('conn_success_latency', '連線成功！延遲:')} {testResult.latency_ms} ms
                        </div>
                        {testResult.models && (
                          <div className="text-[11px] text-emerald-400/80 mt-0.5">
                            {t('conn_detected_models', '已自動探測到可用模型數:')} {testResult.models.length}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold">{t('conn_failed', '連線失敗')}</div>
                        <div className="text-[11px] text-rose-400/80 mt-0.5">{getLocalizedError(testResult.error)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Hyperparameters (Temperature & Max Tokens) */}
            <div className="p-4 rounded-2xl glass-card space-y-3.5 border border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('hyperparameters', '模型推論超參數 (Hyperparameters)')}</span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>{t('temperature', '創意隨機度 (Temperature)')}: {formData.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>{t('max_tokens', '最大輸出長度 (Max Tokens)')}: {formData.max_tokens}</span>
                </div>
                <input
                  type="range"
                  min="512"
                  max="16384"
                  step="512"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>{t('context_window', '上下文視窗容量 (Context Window)')}: {formData.context_window || 16384}</span>
                </div>
                <input
                  type="range"
                  min="4096"
                  max="65536"
                  step="2048"
                  value={formData.context_window || 16384}
                  onChange={(e) => setFormData({ ...formData, context_window: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Hardware capability evaluation */}
              {(hwCheck || isCheckingHw) && (() => {
                const verdict = hwCheck?.verdict;
                const tone =
                  verdict === 'danger' ? 'border-rose-500/30 bg-rose-500/5 text-rose-300'
                  : verdict === 'warn' ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  : verdict === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-slate-300';
                const verdictLabel: Record<string, string> = {
                  ok: t('hw_verdict_ok', '硬體效能足夠：模型可完整放入 GPU 執行'),
                  warn: t('hw_verdict_warn', '硬體效能不足：可能變慢，建議調整'),
                  danger: t('hw_verdict_danger', '超出硬體負荷：可能無法載入或崩潰'),
                  cloud: t('hw_verdict_cloud', '雲端模型：在服務商的伺服器上執行，不受本機硬體限制'),
                  unknown: t('hw_verdict_unknown', '無法完整評估此模型的硬體需求')
                };
                const hw = hwCheck?.hardware;
                const est = hwCheck?.estimate;
                const usedPct = est && est.vram_free_gb ? Math.min(100, (est.total_gb / est.vram_free_gb) * 100) : null;
                const rec = hwCheck?.recommended;
                const recDiffers = rec && (rec.context_window !== (formData.context_window || 16384) || rec.max_tokens !== formData.max_tokens);
                return (
                  <div className={`p-3 rounded-xl border text-xs space-y-2 ${tone}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {isCheckingHw ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : verdict === 'ok' ? <ShieldCheck className="w-3.5 h-3.5" />
                        : verdict === 'cloud' ? <Cloud className="w-3.5 h-3.5" />
                        : verdict === 'unknown' ? <Cpu className="w-3.5 h-3.5" />
                        : <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>{isCheckingHw && !hwCheck ? t('hw_checking', '正在評估硬體效能...') : verdictLabel[verdict || 'unknown']}</span>
                    </div>

                    {hw && (
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {t('hw_gpu', 'GPU')}: {hw.gpu_detected ? `${hw.gpu_name} (${hw.vram_total_gb} GB)` : t('hw_no_gpu', '未偵測到')}
                        </span>
                        <span>{t('hw_ram', '系統記憶體')}: {hw.ram_available_gb} / {hw.ram_total_gb} GB</span>
                      </div>
                    )}

                    {est && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">
                          {t('hw_estimate_breakdown', '預估需求 {total} GB（權重 {weights} + 上下文快取 {kv} + 運算緩衝 {overhead}）', {
                            total: est.total_gb, weights: est.weights_gb, kv: est.kv_cache_gb, overhead: est.overhead_gb
                          })}
                          {hwCheck?.model_info?.source === 'estimated' && ` · ${t('hw_estimated_from_name', '依模型名稱粗估')}`}
                        </div>
                        {usedPct !== null && (
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" title={`${est.total_gb} / ${est.vram_free_gb} GB`}>
                            <div
                              className={`h-full rounded-full ${usedPct >= 100 ? 'bg-rose-400' : usedPct > 85 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${Math.max(3, usedPct)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {hwCheck?.issues?.length ? (
                      <ul className="space-y-1 text-[11px] leading-relaxed">
                        {hwCheck.issues.map((issue, idx) => (
                          <li key={idx} className={issue.level === 'danger' ? 'text-rose-300' : issue.level === 'warn' ? 'text-amber-300' : 'text-slate-400'}>
                            • {hwIssueText(issue)}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {rec && recDiffers && (verdict === 'warn' || verdict === 'danger') && (
                      <button
                        type="button"
                        onClick={applyHwRecommendation}
                        className="px-3 py-1.5 rounded-lg glass-button text-[11px] font-semibold text-white"
                      >
                        {t('hw_apply_recommended', '套用建議值：上下文 {ctx} / 最大輸出 {mt}', { ctx: rec.context_window, mt: rec.max_tokens })}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer Actions for Model */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
              >
                {t('close', '關閉')}
              </button>
              <button
                type="button"
                onClick={handleSaveModel}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl glass-button-primary text-xs font-semibold text-white shadow-md flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{t('save_model_settings', '儲存模型設定')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body: Tab 2 - Telegram Bridge */}
        {activeTab === 'telegram' && (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Status Card */}
            <div className="p-4 rounded-2xl glass-card border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${telegramStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{t('tg_agent_status', 'Telegram 智能代理狀態:')}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      telegramStatus?.running 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                    }`}>
                      {telegramStatus?.running ? t('tg_listening', '🟢 監聽中 (Active)') : t('tg_idle', '⚪ 未啟動 (Idle)')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {telegramStatus?.bot_username ? `${t('tg_bot_bound', '綁定機器人:')} ${telegramStatus.bot_username}` : t('tg_bot_unbound', '尚未綁定 Bot')}
                  </div>
                </div>
              </div>

              {/* Enable Toggle */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegramConfig.enabled}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
              </label>
            </div>

            {/* Telegram Bot Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {t('tg_bot_token', 'Telegram Bot Token')}
                </label>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <span>{t('tg_token_from', '由 @BotFather 取得')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showTgToken ? 'text' : 'password'}
                  value={telegramConfig.token}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, token: e.target.value })}
                  placeholder={telegramStatus?.has_token ? `•••••••••••••••••••••••••••••••• (${t('saved_tag', '已保存')})` : '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ'}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowTgToken(!showTgToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Telegram Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {t('tg_chat_id', '授權存取 Chat ID (使用者或群組 ID)')}
                </label>
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <span>{t('tg_chat_id_from', '向 @userinfobot 查詢')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                value={telegramConfig.chat_id}
                onChange={(e) => setTelegramConfig({ ...telegramConfig, chat_id: e.target.value })}
                placeholder={t('tg_chat_id_placeholder', '例如: 987654321')}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100"
              />
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                {t('tg_security_tip', '安全提示：設定 Chat ID 後，僅授權的 Telegram 帳號可驅動 Agent，避免未授權調用。')}
              </p>
            </div>

            {/* Test Connection Button & Result */}
            <div>
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={isTestingTelegram || (!telegramConfig.token && !telegramStatus?.has_token)}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isTestingTelegram ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>{t('tg_test_connection', '測試 Telegram 連線')}</span>
              </button>

              {telegramTestResult && (
                <div
                  className={`mt-2 p-3 rounded-xl text-xs flex items-start gap-2 border ${
                    telegramTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {telegramTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    {telegramTestResult.success ? (
                      <div>
                        <div className="font-semibold">{telegramTestResult.message}</div>
                        {telegramTestResult.bot_name && (
                          <div className="text-[11px] text-emerald-400/80 mt-0.5">
                            {t('tg_bot_name', 'Bot 名稱:')} {telegramTestResult.bot_name} ({telegramTestResult.bot_username})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold">{t('conn_failed', '連線失敗')}</div>
                        <div className="text-[11px] text-rose-400/80 mt-0.5">{getLocalizedError(telegramTestResult.error)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Instructions info box */}
            <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-200/90 leading-relaxed space-y-1">
              <div className="font-semibold text-cyan-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>{t('tg_guide_title', 'Telegram 指令支援說明')}</span>
              </div>
              <ul className="list-disc ml-4 space-y-0.5 text-slate-300 text-[11px]">
                <li>{t('tg_guide_1', '傳送日常文字：自動進行推理思考，並調用 9 大工具執行任務。')}</li>
                <li><code>/status</code>：{t('tg_guide_2', '檢視伺服器連線、模型與工具狀態。')}</li>
                <li><code>/tools</code>：{t('tg_guide_3', '檢視所有已啟用工具清單。')}</li>
                <li><code>/new</code>：{t('tg_guide_4', '重設對話紀錄並開啟新 Session。')}</li>
              </ul>
            </div>

            {/* Footer Actions for Telegram */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
              >
                {t('close', '關閉')}
              </button>
              <button
                type="button"
                onClick={handleSaveTelegram}
                disabled={isSavingTelegram}
                className="px-5 py-2 rounded-xl glass-button-primary text-xs font-semibold text-white shadow-md flex items-center gap-1.5"
              >
                {isSavingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{t('tg_save', '儲存 Telegram 設定')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body: Tab 3 - Tools Management */}
        {activeTab === 'tools' && (
          <div className="p-6 space-y-4 max-h-[72vh] flex flex-col overflow-hidden">
            {/* Which tool set: chat-mode tools or the Code agent's coding tools */}
            <div className="flex p-1 rounded-xl bg-black/25 border border-white/10 shrink-0 self-start">
              <button
                type="button"
                onClick={() => setToolScope('chat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${toolScope === 'chat' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
              >
                {t('toolscope_chat', '對話模式工具')} ({tools.filter(tl => tl.enabled).length}/{tools.length})
              </button>
              <button
                type="button"
                onClick={() => setToolScope('code')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${toolScope === 'code' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
              >
                {t('toolscope_code', 'Code Agent 工具')} ({codeTools.filter(ct => ct.enabled).length}/{codeTools.length})
              </button>
            </div>

            {toolScope === 'code' && (
              <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[300px]">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {t('code_tools_intro', '這些是 Code 模式自主編程 Agent 專用的工具，與對話模式的工具分開管理。停用的工具不會提供給模型。標示「需確認」的工具在 Accept Edit 模式下執行前會先請你同意。')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {codeTools.map((ct) => (
                    <div
                      key={ct.name}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                        ct.enabled
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-85'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`text-xs font-mono font-bold truncate ${ct.enabled ? 'text-white' : 'text-slate-400'}`}>
                            {ct.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleCodeTool(ct.name, !ct.enabled)}
                            aria-label={ct.name}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              ct.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                ct.enabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-300/80 leading-relaxed">
                          {t(`code_tool_${ct.name}`, ct.description)}
                        </p>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500 font-mono truncate">{ct.parameters.join(', ')}</span>
                        {ct.mutating ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                            {t('code_tool_needs_approval', '需確認')}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 border border-sky-500/25 text-sky-300 shrink-0">
                            {t('code_tool_read_only', '唯讀')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolScope === 'chat' && (<>
            {/* Top Toolbar: Search & Batch Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pb-3 border-b border-white/10 shrink-0">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  placeholder={t('tools_search_placeholder', '搜尋工具名稱或功能描述...')}
                  className="w-full pl-9 pr-8 py-2 rounded-xl glass-input text-xs font-mono text-slate-100 placeholder:text-slate-500"
                />
                {toolSearch && (
                  <button
                    onClick={() => setToolSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Buttons & Counter */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="text-xs font-mono px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-cyan-300">
                  {tools.filter(t => t.enabled).length} / {tools.length} {t('tools_enabled_count', '已啟用')}
                </span>

                <button
                  type="button"
                  onClick={() => handleBatchToggle(true)}
                  disabled={isBatchToggling}
                  className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition-all flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>{t('tools_all_enable', '全部啟用')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBatchToggle(false)}
                  disabled={isBatchToggling}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition-all flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>{t('tools_all_disable', '全部停用')}</span>
                </button>

                {onRefreshTools && (
                  <button
                    type="button"
                    onClick={onRefreshTools}
                    className="p-1.5 rounded-xl glass-button text-slate-400 hover:text-cyan-300 transition-colors"
                    title={t('refresh', '重新整理')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBatchToggling ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Tool List Grid */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[300px]">
              {filteredTools.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {t('tools_not_found', '找不到符合「{toolSearch}」的工具').replace('{toolSearch}', toolSearch)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredTools.map((tool) => {
                    const meta = getToolMeta(tool.name);
                    const isSensitive = ['bash_executor', 'file_system', 'database_sqlite_inspector'].includes(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                          tool.enabled
                            ? 'bg-cyan-950/20 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.06)]'
                            : 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-85'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${meta.bg}`}>
                                {meta.icon}
                              </div>
                              <div className="min-w-0">
                                <span className={`text-xs font-mono font-bold truncate block ${tool.enabled ? 'text-white' : 'text-slate-400'}`}>
                                  {tool.name}
                                </span>
                                <span className="text-[10px] text-slate-400 block -mt-0.5">
                                  {meta.category}
                                </span>
                              </div>
                            </div>

                            {/* Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => handleToggle(tool.name, !tool.enabled)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                tool.enabled ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  tool.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          <p className="text-[11px] text-slate-300/80 line-clamp-2 leading-relaxed">
                            {tool.description}
                          </p>
                        </div>

                        {/* Badges footer */}
                        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">
                            {Object.keys(tool.parameters || {}).length} {t('tool_params', '參數')}
                            {tool.required && tool.required.length > 0 && ` (${tool.required.length} ${t('tool_required', '必要')})`}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isSensitive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                {t('tool_system_perm', '系統權限')}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded font-mono ${
                              tool.enabled
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                            }`}>
                              {tool.enabled ? t('tool_authorized', '已授權') : t('tool_disabled_state', '已停用')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Security / Interception Tip */}
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-200/90 flex items-start gap-2 shrink-0">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-slate-300">
                <span className="font-semibold text-cyan-300">{t('safety_compliance_intercept', '安全合規與精準攔截：')}</span>
                {t('tools_tip', '停用的工具將從模型 Schema 中移除，且 Agent 內部決策與 ReAct 引擎將全面攔截調用，並主動告知使用者該工具目前已被停用。')}
              </div>
            </div>
            </>)}

            {/* Close footer button */}
            <div className="pt-1 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
              >
                {t('close', '關閉')}
              </button>
            </div>
          </div>
        )}

        {/* Security PIN Tab Panel */}
        {activeTab === 'security' && (
          <div className="p-6 space-y-5 animate-in fade-in duration-150">
            <div className="p-4 rounded-2xl bg-black/40 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{t('pin_section_title', '外網遠端訪問安全鎖定 (Web Access PIN)')}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  {t('pin_section_desc', '當透過 Cloudflare Tunnel 或外網 IP 訪問時，要求輸入自訂 PIN 碼，防止外部未授權調用終端機與檔案系統。')}
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border font-mono ${
                pinStatus.pin_protected 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-white/5 text-slate-400 border-white/10'
              }`}>
                {pinStatus.pin_protected ? t('pin_protected', '🛡️ 保護中') : t('pin_unprotected', '未啟用保護')}
              </span>
            </div>

            <div className="space-y-4 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              {pinStatus.pin_protected && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t('pin_current', '目前 PIN 碼 (Current PIN)')}
                  </label>
                  <input
                    type="password"
                    value={oldPinInput}
                    onChange={(e) => setOldPinInput(e.target.value)}
                    placeholder={t('pin_current_placeholder', '若欲更改或停用，請輸入當前 PIN 碼')}
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono text-white placeholder-slate-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('pin_new', '設定新 PIN 碼 (New PIN - 至少 4 位數)')}
                </label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder={t('pin_new_placeholder', '例如: 8888 或自訂安全密碼')}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono text-white placeholder-slate-500"
                />
              </div>

              {pinMsg && (
                <p className="text-xs font-medium p-2.5 rounded-xl bg-black/40 border border-white/10 text-emerald-300">
                  {pinMsg}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSavePin(true)}
                  disabled={isSavingPin || !pinInput.trim()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-40"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSavingPin ? t('saving', '儲存中...') : pinStatus.pin_protected ? t('pin_update', '更新 PIN 碼') : t('pin_enable', '啟用外網 PIN 碼保護')}</span>
                </button>

                {pinStatus.pin_protected && (
                  <button
                    type="button"
                    onClick={() => handleSavePin(false)}
                    disabled={isSavingPin}
                    className="py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>{t('pin_disable', '停用保護')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Close footer button */}
            <div className="pt-1 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
              >
                {t('close', '關閉')}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
export default SettingsModal;
