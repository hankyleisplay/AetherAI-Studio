import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Image as ImageIcon,
  Film,
  LayoutGrid,
  Settings2,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  AlertCircle,
  Check,
  Copy
} from 'lucide-react';
import { MediaConfig, MediaItem } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface MediaStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'image' | 'video' | 'gallery' | 'settings';

const IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const VIDEO_ASPECTS = ['16:9', '9:16'];

export const MediaStudioModal: React.FC<MediaStudioModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('image');
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [aspect, setAspect] = useState('1:1');
  const [seconds, setSeconds] = useState(8);
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState<MediaConfig | null>(null);
  const [draft, setDraft] = useState<Partial<MediaConfig>>({});
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const pollRef = useRef<number | null>(null);

  const providerLabel = (p: string) => t(`media_provider_${p}`, p);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/media/config');
      if (res.ok) {
        const cfg: MediaConfig = await res.json();
        setConfig(cfg);
        setDraft({ ...cfg, openai_api_key: '', gemini_api_key: '' });
      }
    } catch {}
  };

  const loadItems = async () => {
    try {
      const res = await fetch('/api/media');
      if (res.ok) setItems(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
    loadItems();
  }, [isOpen]);

  // Keep polling while any video is still rendering
  useEffect(() => {
    if (!isOpen) return;
    const running = items.some(i => i.status === 'running');
    if (running && !pollRef.current) {
      pollRef.current = window.setInterval(loadItems, 5000);
    } else if (!running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, items]);

  useEffect(() => {
    if (!config) return;
    if (tab === 'image') {
      setProvider(config.image_provider);
      if (!IMAGE_ASPECTS.includes(aspect)) setAspect('1:1');
    } else if (tab === 'video') {
      setProvider(config.video_provider);
      if (!VIDEO_ASPECTS.includes(aspect)) setAspect('16:9');
    }
    setError('');
  }, [tab, config]);

  if (!isOpen) return null;

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const isVideo = tab === 'video';
      const res = await fetch(isVideo ? '/api/media/video' : '/api/media/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isVideo
          ? { prompt, provider, aspect, seconds }
          : { prompt, provider, aspect, negative_prompt: negative })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || `HTTP ${res.status}`);
      } else {
        setItems(prev => [data as MediaItem, ...prev.filter(i => i.id !== data.id)]);
        if (!isVideo) setPreview(data as MediaItem);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('media_confirm_delete', '確定要刪除這個作品嗎？'))) return;
    await fetch(`/api/media/${id}`, { method: 'DELETE' }).catch(() => {});
    setItems(prev => prev.filter(i => i.id !== id));
    if (preview?.id === id) setPreview(null);
  };

  const saveSettings = async () => {
    setSavedMsg('');
    const res = await fetch('/api/media/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    if (res.ok) {
      await loadConfig();
      setSavedMsg(t('media_settings_saved', '已儲存'));
    }
  };

  const providers = tab === 'video' ? (config?.video_providers || []) : (config?.image_providers || []);
  const needsKey = (p: string) =>
    (['openai', 'openai_sora'].includes(p) && !config?.has_openai_api_key) ||
    (['gemini', 'gemini_veo'].includes(p) && !config?.has_gemini_api_key);
  const recent = items.filter(i => i.kind === (tab === 'video' ? 'video' : 'image')).slice(0, 6);

  const renderItem = (item: MediaItem, compact = false) => (
    <div key={item.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/30">
      <div className={`${compact ? 'aspect-square' : 'aspect-video'} flex items-center justify-center bg-black/40`}>
        {item.status === 'done' && item.url ? (
          item.kind === 'video' ? (
            <video src={item.url} className="w-full h-full object-cover" muted loop playsInline onMouseOver={e => e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} />
          ) : (
            <img src={item.url} alt={item.prompt} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setPreview(item)} loading="lazy" />
          )
        ) : item.status === 'failed' ? (
          <div className="p-2 text-[10px] text-rose-300 text-center flex flex-col items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            <span className="line-clamp-3">{item.error}</span>
          </div>
        ) : (
          <div className="text-[11px] text-cyan-300 flex flex-col items-center gap-1.5">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('media_rendering', '生成中…')}{item.meta?.progress != null ? ` ${item.meta.progress}%` : ''}</span>
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <span className="text-[10px] text-slate-300 truncate" title={item.prompt}>{item.prompt}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => navigator.clipboard?.writeText(item.prompt)} title={t('copy_content', '複製內容')} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <Copy className="w-3 h-3" />
          </button>
          {item.url && (
            <a href={item.url} download className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" title={t('media_download', '下載')}>
              <Download className="w-3 h-3" />
            </a>
          )}
          <button type="button" onClick={() => remove(item.id)} title={t('delete_session', '刪除')} className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
        tab === id ? 'border-fuchsia-400 text-fuchsia-200' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const input = 'w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 placeholder:text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-3xl glass-panel rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/40 flex items-center justify-center text-fuchsia-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{t('media_studio_title', '媒體工作室')}</h2>
              <p className="text-[11px] text-slate-400">{t('media_studio_subtitle', '用文字生成圖片與影片')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white" aria-label={t('close', '關閉')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-3 flex gap-4 border-b border-white/10 overflow-x-auto shrink-0">
          {tabBtn('image', <ImageIcon className="w-3.5 h-3.5" />, t('media_tab_image', '生成圖片'))}
          {tabBtn('video', <Film className="w-3.5 h-3.5" />, t('media_tab_video', '生成影片'))}
          {tabBtn('gallery', <LayoutGrid className="w-3.5 h-3.5" />, `${t('media_tab_gallery', '作品庫')} (${items.length})`)}
          {tabBtn('settings', <Settings2 className="w-3.5 h-3.5" />, t('media_tab_settings', '設定'))}
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {(tab === 'image' || tab === 'video') && (
            <>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); }}
                rows={3}
                placeholder={tab === 'video'
                  ? t('media_video_placeholder', '描述影片：主體、動作、鏡頭運動、風格與氛圍…')
                  : t('media_image_placeholder', '描述圖片：主體、風格、構圖、光線與色調…（Ctrl+Enter 生成）')}
                className={`${input} resize-none`}
              />
              {tab === 'image' && provider === 'sd_webui' && (
                <input value={negative} onChange={e => setNegative(e.target.value)} placeholder={t('media_negative_prompt', '負面提示詞（不想出現的內容，選填）')} className={input} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select value={provider} onChange={e => setProvider(e.target.value)} className="px-2.5 py-2 rounded-xl glass-input text-xs text-slate-100">
                  {providers.map(p => (
                    <option key={p} value={p}>{providerLabel(p)}{needsKey(p) ? ` (${t('media_needs_key', '需 API Key')})` : ''}</option>
                  ))}
                </select>
                <div className="flex p-0.5 rounded-xl bg-black/25 border border-white/10">
                  {(tab === 'video' ? VIDEO_ASPECTS : IMAGE_ASPECTS).map(a => (
                    <button key={a} type="button" onClick={() => setAspect(a)} className={`px-2 py-1 rounded-lg text-[11px] font-mono ${aspect === a ? 'bg-fuchsia-500/25 text-fuchsia-100' : 'text-slate-400 hover:text-slate-200'}`}>
                      {a}
                    </button>
                  ))}
                </div>
                {tab === 'video' && (
                  <select value={seconds} onChange={e => setSeconds(parseInt(e.target.value))} className="px-2.5 py-2 rounded-xl glass-input text-xs text-slate-100">
                    {[4, 8, 12].map(s => <option key={s} value={s}>{t('media_seconds', '{n} 秒', { n: s })}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy || !prompt.trim()}
                  className="ml-auto px-4 py-2 rounded-xl bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border border-fuchsia-400/40 text-fuchsia-100 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {busy ? t('media_generating', '生成中…') : t('media_generate', '生成')}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {tab === 'video'
                  ? t('media_video_hint', '影片在背景生成，通常需要數分鐘；可關閉視窗，完成後會出現在作品庫。')
                  : provider === 'pollinations'
                    ? t('media_pollinations_hint', 'Pollinations 免費、免 API Key，但提示詞會傳送到 pollinations.ai，且約每 45 秒限 1 張。')
                    : t('media_image_hint', '圖片會儲存在工作區的 media 資料夾。')}
              </p>
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {preview && preview.kind === 'image' && tab === 'image' && preview.url && (
                <img src={preview.url} alt={preview.prompt} className="w-full max-h-[50vh] object-contain rounded-2xl border border-white/10 bg-black/40" />
              )}
              {recent.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 mb-2">{t('media_recent', '最近作品')}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{recent.map(i => renderItem(i))}</div>
                </div>
              )}
            </>
          )}

          {tab === 'gallery' && (
            items.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">{t('media_empty', '還沒有作品，先到「生成圖片」或「生成影片」試試看。')}</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{items.map(i => renderItem(i))}</div>
            )
          )}

          {tab === 'settings' && config && (
            <div className="space-y-4 text-xs">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-300 font-semibold">{t('media_default_image_provider', '預設圖片服務')}</span>
                  <select value={draft.image_provider} onChange={e => setDraft({ ...draft, image_provider: e.target.value })} className={input}>
                    {(config.image_providers || []).map(p => <option key={p} value={p}>{providerLabel(p)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-semibold">{t('media_default_video_provider', '預設影片服務')}</span>
                  <select value={draft.video_provider} onChange={e => setDraft({ ...draft, video_provider: e.target.value })} className={input}>
                    {(config.video_providers || []).map(p => <option key={p} value={p}>{providerLabel(p)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-semibold">OpenAI API Key {config.has_openai_api_key && <Check className="inline w-3 h-3 text-emerald-400" />}</span>
                  <input type="password" value={draft.openai_api_key || ''} onChange={e => setDraft({ ...draft, openai_api_key: e.target.value })}
                    placeholder={config.has_openai_api_key ? t('media_key_saved', '已設定（留空則保留）') : 'sk-...'} className={input} />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-semibold">Gemini API Key {config.has_gemini_api_key && <Check className="inline w-3 h-3 text-emerald-400" />}</span>
                  <input type="password" value={draft.gemini_api_key || ''} onChange={e => setDraft({ ...draft, gemini_api_key: e.target.value })}
                    placeholder={config.has_gemini_api_key ? t('media_key_saved', '已設定（留空則保留）') : 'AIza...'} className={input} />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-slate-300 font-semibold">{t('media_sd_url', 'Stable Diffusion WebUI 位址（AUTOMATIC1111 / Forge，需加 --api 啟動）')}</span>
                  <input value={draft.sd_base_url || ''} onChange={e => setDraft({ ...draft, sd_base_url: e.target.value })} className={input} />
                </label>
                {(['openai_image_model', 'gemini_image_model', 'veo_model', 'sora_model'] as const).map(k => (
                  <label key={k} className="space-y-1">
                    <span className="text-slate-300 font-semibold">{t(`media_${k}`, k)}</span>
                    <input value={(draft[k] as string) || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={`${input} font-mono`} />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">{t('media_key_reuse_hint', '若「模型設定」中使用的是 OpenAI 或 Gemini，未填寫時會自動沿用該 API Key。')}</p>
              <div className="flex items-center justify-end gap-2">
                {savedMsg && <span className="text-emerald-300 text-[11px]">{savedMsg}</span>}
                <button type="button" onClick={saveSettings} className="px-4 py-2 rounded-xl glass-button-primary text-xs font-semibold text-white">
                  {t('save', '儲存')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaStudioModal;
