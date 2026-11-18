import React, { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  Check,
  Cpu,
  Download,
  Eye,
  Loader2,
  MemoryStick,
  Power,
  RefreshCw,
  Rocket,
  Trash2,
  Wrench
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { OllamaModelsInfo } from '../types';
import { formatGB, ollamaAction, pullOllamaModel } from '../utils/ollama';

interface OllamaManagerPanelProps {
  /** The model chosen in Aether (highlighted in the list) */
  activeModel: string;
  /** Make a model the active one */
  onUseModel: (name: string) => Promise<void> | void;
}

interface Choice {
  name: string;
  label: string;
  size_gb: number;
}

const CAPABILITY_BADGES: Record<string, { icon: React.ElementType; key: string; fallback: string; tone: string }> = {
  vision: { icon: Eye, key: 'ollama_cap_vision', fallback: '看圖', tone: 'text-sky-300 border-sky-400/30 bg-sky-400/10' },
  tools: { icon: Wrench, key: 'ollama_cap_tools', fallback: '工具', tone: 'text-amber-300 border-amber-400/30 bg-amber-400/10' },
  thinking: { icon: Brain, key: 'ollama_cap_thinking', fallback: '思考', tone: 'text-violet-300 border-violet-400/30 bg-violet-400/10' }
};

/** Settings tab for the local Ollama: what is loaded (and on the GPU), installed models, downloads. */
export const OllamaManagerPanel: React.FC<OllamaManagerPanelProps> = ({ activeModel, onUseModel }) => {
  const { t } = useI18n();
  const [info, setInfo] = useState<OllamaModelsInfo | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>(''); // "<action>:<model>" while a button's request runs
  const [notice, setNotice] = useState<string>('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [pullName, setPullName] = useState('');
  const [pull, setPull] = useState<{ model: string; percent: number | null; status: string; error?: string } | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch('/api/ollama/models');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setInfo(data);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    fetch('/api/ollama/status')
      .then(r => r.json())
      .then(d => setChoices(d.choices || []))
      .catch(() => {});
    // Keep the memory figures current (a model unloads on its own after 30 idle minutes)
    const timer = window.setInterval(() => refresh(true), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setNotice('');
    try {
      await action();
      if (done) setNotice(done);
      await refresh(true);
    } catch (e: any) {
      setNotice(`❌ ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const startPull = async (name: string) => {
    const model = name.trim();
    if (!model) return;
    setPull({ model, percent: null, status: '' });
    try {
      await pullOllamaModel(model, p => setPull({ model, percent: p.percent, status: p.status }));
      setPull(null);
      setPullName('');
      setNotice(t('ollama_pull_done', '✅ {model} 下載完成', { model }));
      await refresh(true);
    } catch (e: any) {
      const msg = e.message === 'interrupted' ? t('ollama_pull_interrupted', '連線中斷') : e.message;
      setPull({ model, percent: null, status: '', error: msg });
    }
  };

  if (loading && !info) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
        {t('ollama_mgr_loading', '正在讀取 Ollama 狀態…')}
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="p-6 space-y-3">
        <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-400/5 text-xs text-amber-200 whitespace-pre-wrap">{error}</div>
        <button type="button" onClick={() => refresh()} className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-100 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {t('ollama_retry', '重試')}
        </button>
      </div>
    );
  }

  const loaded = info?.loaded || [];
  const installed = info?.installed || [];
  const loadedNames = new Set(loaded.map(m => m.name));
  const pulling = Boolean(pull && !pull.error);
  const notInstalledChoices = choices.filter(c => !installed.some(m => m.name === c.name));

  return (
    <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
      {/* Status line */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0" />
          <span className="truncate">
            {t('ollama_mgr_running', 'Ollama 執行中')} · <span className="font-mono text-slate-400">{info?.base_url}</span>
          </span>
          {info?.started_by_aether && (
            <span className="px-2 py-0.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-[10px] shrink-0">
              {t('ollama_mgr_managed', '由 Aether 管理，關閉時一併結束')}
            </span>
          )}
        </div>
        <button type="button" onClick={() => refresh()} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0" title={t('ollama_recheck', '重新偵測')}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {notice && (
        <div className={`p-2.5 rounded-xl text-xs border ${notice.startsWith('❌') ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {notice}
        </div>
      )}

      {/* Loaded in memory */}
      <section className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <MemoryStick className="w-3.5 h-3.5 text-cyan-300" />
            {t('ollama_mgr_loaded', '已載入記憶體')}
          </h4>
          {loaded.length > 0 && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run('unload:*', () => ollamaAction('/api/ollama/unload', { model: '*' }), t('ollama_mgr_released_all', '✅ 已釋放所有模型佔用的記憶體'))}
              className="px-3 py-1 rounded-full glass-button text-[11px] font-semibold text-slate-100 flex items-center gap-1"
            >
              {busy === 'unload:*' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
              {t('ollama_mgr_release_all', '全部釋放')}
            </button>
          )}
        </div>
        {loaded.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            {t('ollama_mgr_none_loaded', '目前沒有模型佔用記憶體。送出訊息或按「預先載入」時才會載入。')}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {loaded.map(m => {
              const gpu = m.gpu_percent ?? 0;
              return (
                <li key={m.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-100 truncate">{m.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {t('ollama_mgr_mem', '{gb} GB · GPU {pct}%', { gb: formatGB(m.size_bytes), pct: gpu })}
                        {m.context_length ? ` · ${t('ollama_mgr_ctx', '上下文 {ctx}', { ctx: m.context_length })}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => run(`unload:${m.name}`, () => ollamaAction('/api/ollama/unload', { model: m.name }),
                          t('ollama_mgr_released', '✅ 已釋放 {model}', { model: m.name }))}
                        className="px-2.5 py-0.5 rounded-full glass-button text-[11px] text-slate-200 flex items-center gap-1"
                      >
                        {busy === `unload:${m.name}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                        {t('ollama_mgr_release', '釋放')}
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" title={`GPU ${gpu}%`}>
                    <div
                      className={`h-full rounded-full ${gpu >= 99 ? 'bg-emerald-400' : gpu >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      style={{ width: `${Math.max(3, gpu)}%` }}
                    />
                  </div>
                  {gpu < 99 && (
                    <p className="text-[10.5px] text-amber-300/90">
                      {t('ollama_mgr_offloaded', '有 {pct}% 在 CPU 上執行，速度會明顯變慢；可縮小上下文或改用較小的模型。', { pct: 100 - gpu })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Installed models */}
      <section className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-cyan-300" />
          {t('ollama_mgr_installed', '已安裝的模型')} <span className="text-slate-500 font-normal">({installed.length})</span>
        </h4>
        {installed.length === 0 ? (
          <p className="text-[11px] text-slate-400">{t('ollama_mgr_none_installed', '還沒有模型，從下方下載一個吧。')}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {installed.map(m => {
              const isActive = m.name === activeModel;
              return (
                <li key={m.name} className="py-2.5 first:pt-0 last:pb-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-mono text-xs truncate ${isActive ? 'text-cyan-200 font-semibold' : 'text-slate-100'}`}>{m.name}</span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 text-[10px]">{t('ollama_mgr_in_use', '使用中')}</span>
                      )}
                      {loadedNames.has(m.name) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 text-[10px]">{t('ollama_mgr_is_loaded', '已載入')}</span>
                      )}
                      {m.capabilities.filter(c => CAPABILITY_BADGES[c]).map(c => {
                        const b = CAPABILITY_BADGES[c];
                        const Icon = b.icon;
                        return (
                          <span key={c} className={`px-1.5 py-0.5 rounded-full border text-[10px] flex items-center gap-0.5 ${b.tone}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {t(b.key, b.fallback)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">
                      {[m.parameter_size, m.quantization, `${formatGB(m.size_bytes)} GB`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => run(`use:${m.name}`, async () => onUseModel(m.name), t('ollama_mgr_now_using', '✅ 已改用 {model}，正在背景載入', { model: m.name }))}
                        className="px-2.5 py-1 rounded-full glass-button-primary text-[11px] font-semibold flex items-center gap-1"
                      >
                        {busy === `use:${m.name}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {t('ollama_mgr_use', '使用')}
                      </button>
                    )}
                    {!loadedNames.has(m.name) && (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        title={t('ollama_mgr_preload_hint', '先載入記憶體，第一則訊息就不用等')}
                        onClick={() => run(`load:${m.name}`, () => ollamaAction('/api/ollama/preload', { model: m.name }),
                          t('ollama_mgr_loaded_ok', '✅ {model} 已載入', { model: m.name }))}
                        className="px-2.5 py-1 rounded-full glass-button text-[11px] text-slate-200 flex items-center gap-1"
                      >
                        {busy === `load:${m.name}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                        {busy === `load:${m.name}` ? t('ollama_mgr_loading_model', '載入中…') : t('ollama_mgr_preload', '預先載入')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      title={t('ollama_mgr_delete', '刪除')}
                      onClick={() => {
                        if (!window.confirm(t('ollama_mgr_delete_confirm', '確定要刪除 {model}？之後需要重新下載。', { model: m.name }))) return;
                        run(`delete:${m.name}`, () => ollamaAction('/api/ollama/delete', { model: m.name }),
                          t('ollama_mgr_deleted', '✅ 已刪除 {model}', { model: m.name }));
                      }}
                      className="p-1.5 rounded-full hover:bg-rose-500/15 text-slate-400 hover:text-rose-300"
                    >
                      {busy === `delete:${m.name}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Download */}
      <section className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-cyan-300" />
          {t('ollama_mgr_download', '下載模型')}
        </h4>
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            startPull(pullName);
          }}
        >
          <input
            type="text"
            value={pullName}
            onChange={e => setPullName(e.target.value)}
            disabled={pulling}
            placeholder={t('ollama_mgr_download_placeholder', '輸入模型名稱，例如 qwen3:8b、gemma3:12b')}
            className="flex-1 min-w-0 px-3.5 py-2 rounded-xl glass-input text-xs font-mono text-slate-100"
          />
          <button type="submit" disabled={pulling || !pullName.trim()} className="px-4 py-2 rounded-xl glass-button-primary text-xs font-semibold flex items-center gap-1.5 shrink-0">
            <Download className="w-3.5 h-3.5" />
            {t('ollama_mgr_download_btn', '下載')}
          </button>
        </form>
        {notInstalledChoices.length > 0 && !pulling && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">{t('ollama_other_models', '其他選擇')}</span>
            {notInstalledChoices.map(c => (
              <button key={c.name} type="button" onClick={() => startPull(c.name)} className="px-2.5 py-1 rounded-full glass-button text-[11px] text-slate-200">
                {c.label} · {c.size_gb} GB
              </button>
            ))}
          </div>
        )}
        {pull && (pull.error ? (
          <p className="text-xs text-rose-300 whitespace-pre-wrap break-words">
            {t('ollama_pull_failed', '下載失敗：{error}', { error: pull.error })}
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-200 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                {t('ollama_downloading', '正在下載 {model}…', { model: pull.model })}
              </span>
              <span className="font-mono">{pull.percent !== null ? `${pull.percent.toFixed(0)}%` : ''}</span>
            </div>
            <div className="h-2 rounded-full bg-black/30 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-300" style={{ width: `${pull.percent ?? 4}%` }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">{pull.status}</p>
          </div>
        ))}
        <p className="text-[10.5px] text-slate-500">
          {t('ollama_mgr_library_hint', '可用的模型名稱請見 ollama.com/library')}
        </p>
      </section>
    </div>
  );
};

export default OllamaManagerPanel;
