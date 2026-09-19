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
  Radio
} from 'lucide-react';
import { ModelConfig } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ModelConfig;
  onSaveConfig: (config: ModelConfig) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'model' | 'telegram'>('model');
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

  // Fetch Telegram status on modal open
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

  if (!isOpen) return null;

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

    setFormData({
      ...formData,
      provider: providerName as any,
      base_url: preset.url,
      model: preset.defaultModel
    });
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      setTestResult(data);
      if (data.models && data.models.length > 0 && !formData.model) {
        setFormData((prev) => ({ ...prev, model: data.models[0] }));
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || '無法連線至後端伺服器' });
    } finally {
      setIsTesting(false);
    }
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
      setTelegramTestResult({ success: false, error: err.message || '測試請求失敗' });
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
      alert('Telegram 橋接設定已儲存！' + (telegramConfig.enabled ? ' 橋接服務已啟動。' : ''));
    } catch (err: any) {
      alert('儲存失敗: ' + err.message);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-2xl glass-panel rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('settings_center', 'AetherAI Studio 設定中心')}</h3>
              <p className="text-xs text-slate-400">{t('settings_sub', '自訂本地/雲端模型端點與社群橋接器 (Telegram)')}</p>
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
            <div>
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

              {testResult?.models && testResult.models.length > 0 ? (
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100 bg-slate-900/80 cursor-pointer"
                >
                  {testResult.models.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-slate-100">
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="例如: llama3:latest 或 gpt-4o"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-100"
                />
              )}

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
                        <div className="font-semibold">連線成功！延遲: {testResult.latency_ms} ms</div>
                        {testResult.models && (
                          <div className="text-[11px] text-emerald-400/80 mt-0.5">
                            已自動探測到 {testResult.models.length} 個可用模型。
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold">連線失敗</div>
                        <div className="text-[11px] text-rose-400/80 mt-0.5">{testResult.error}</div>
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
                  max="8192"
                  step="256"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
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
                    {telegramStatus?.bot_username ? `綁定機器人: ${telegramStatus.bot_username}` : '尚未綁定 Bot'}
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
                  placeholder={telegramStatus?.has_token ? '•••••••••••••••••••••••••••••••• (已保存)' : '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ'}
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
                placeholder="例如: 987654321"
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
                disabled={isTestingTelegram || !telegramConfig.token}
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
                            Bot 名稱: {telegramTestResult.bot_name} ({telegramTestResult.bot_username})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold">連線失敗</div>
                        <div className="text-[11px] text-rose-400/80 mt-0.5">{telegramTestResult.error}</div>
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

      </div>
    </div>
  );
};
export default SettingsModal;
