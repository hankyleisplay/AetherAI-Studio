import React from 'react';
import { Cpu, Download, ExternalLink, Loader2, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export interface OllamaModelChoice {
  name: string;
  label: string;
  size_gb: number;
}

export interface OllamaSetupState {
  status: 'checking' | 'running' | 'started' | 'starting' | 'not_installed' | 'remote' | 'disabled' | 'failed';
  base_url?: string;
  error?: string;
  download_url?: string;
  models?: string[];
  recommended?: OllamaModelChoice & { basis: 'gpu' | 'cpu'; memory_gb: number };
  choices?: OllamaModelChoice[];
}

export interface OllamaPullState {
  model: string;
  percent: number | null;
  status: string;
  error?: string;
}

interface OllamaSetupCardProps {
  setup: OllamaSetupState;
  pull: OllamaPullState | null;
  onRecheck: () => void;
  onPull: (model: string) => void;
}

/**
 * First-run card for local models: Aether starts Ollama by itself, so this only appears when something is still
 * missing — Ollama is not installed, it could not be started, or it has no model yet (one click downloads one).
 */
export const OllamaSetupCard: React.FC<OllamaSetupCardProps> = ({ setup, pull, onRecheck, onPull }) => {
  const { t } = useI18n();
  const pulling = Boolean(pull && !pull.error);

  if (setup.status === 'checking' || setup.status === 'starting') {
    return (
      <div className="glass-panel rounded-3xl px-4 py-3 flex items-center gap-3 text-sm text-slate-200 animate-in fade-in">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-300 shrink-0" />
        <span>{t('ollama_checking', '正在啟動本機 Ollama…')}</span>
      </div>
    );
  }

  if (setup.status === 'not_installed') {
    return (
      <div className="glass-panel rounded-3xl p-4 md:p-5 animate-in fade-in zoom-in-95">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl glass-button flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{t('ollama_not_installed_title', '這台電腦還沒有安裝 Ollama')}</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {t('ollama_not_installed_desc', 'Ollama 是在本機執行 AI 模型的免費程式。安裝完成後按「重新偵測」，Aether 會自動在背景啟動它。')}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                href={setup.download_url || 'https://ollama.com/download'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full glass-button-primary text-xs font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('ollama_download_app', '下載 Ollama')}
              </a>
              <button type="button" onClick={onRecheck} className="px-4 py-2 rounded-full glass-button text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                {t('ollama_recheck', '重新偵測')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (setup.status === 'failed' || setup.status === 'remote' || setup.status === 'disabled') {
    return (
      <div className="glass-panel rounded-3xl p-4 md:p-5 border-amber-400/40 animate-in fade-in">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{t('ollama_failed_title', 'Ollama 無法啟動')}</h3>
            {setup.error && (
              <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">{setup.error}</p>
            )}
            <button type="button" onClick={onRecheck} className="mt-3 px-4 py-2 rounded-full glass-button text-xs font-semibold text-slate-100 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {t('ollama_retry', '重試')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ollama is running but has no model yet
  const rec = setup.recommended;
  const others = (setup.choices || []).filter(c => c.name !== rec?.name);
  const reason = rec
    ? rec.basis === 'gpu'
      ? t('ollama_reason_gpu', '依你的顯示卡記憶體（{gb} GB）挑選', { gb: rec.memory_gb })
      : t('ollama_reason_cpu', '沒有偵測到獨立顯示卡（系統記憶體 {gb} GB），選擇較小的模型', { gb: rec.memory_gb })
    : '';

  return (
    <div className="glass-panel rounded-3xl p-4 md:p-5 animate-in fade-in zoom-in-95">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl glass-button flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">{t('ollama_no_models_title', 'Ollama 已就緒，下載一個模型就能開始對話')}</h3>
          {rec && <p className="text-xs text-slate-300 mt-1">{reason}</p>}

          {pull && !pull.error ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-200 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                  {t('ollama_downloading', '正在下載 {model}…', { model: pull.model })}
                </span>
                <span className="font-mono">{pull.percent !== null ? `${pull.percent.toFixed(0)}%` : ''}</span>
              </div>
              <div className="h-2 rounded-full bg-black/30 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,20,0.4)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-300"
                  style={{ width: `${pull.percent ?? 4}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">{pull.status}</p>
            </div>
          ) : (
            <>
              {pull?.error && (
                <p className="text-xs text-rose-300 mt-2 whitespace-pre-wrap break-words">
                  {t('ollama_pull_failed', '下載失敗：{error}', { error: pull.error })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {rec && (
                  <button
                    type="button"
                    disabled={pulling}
                    onClick={() => onPull(rec.name)}
                    className="px-4 py-2 rounded-full glass-button-primary text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('ollama_download_model', '下載 {label}（{size} GB）', { label: rec.label, size: rec.size_gb })}
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{t('ollama_recommended', '推薦')}</span>
                  </button>
                )}
              </div>
              {others.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 mr-1">{t('ollama_other_models', '其他選擇')}</span>
                  {others.map(c => (
                    <button
                      key={c.name}
                      type="button"
                      disabled={pulling}
                      onClick={() => onPull(c.name)}
                      className="px-2.5 py-1 rounded-full glass-button text-[11px] text-slate-200"
                    >
                      {c.label} · {c.size_gb} GB
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OllamaSetupCard;
