import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { MediaItem } from '../types';
import { useI18n } from '../i18n/I18nContext';

// Shows media produced by the generate_image / generate_video chat tools; polls videos until they finish
export const MediaWidget: React.FC<{ initial: MediaItem }> = ({ initial }) => {
  const { t } = useI18n();
  const [item, setItem] = useState<MediaItem>(initial);

  useEffect(() => {
    if (item.status !== 'running' && item.status !== 'pending') return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/media/${item.id}`);
        if (res.ok) setItem(await res.json());
      } catch {}
    }, 5000);
    return () => clearInterval(timer);
  }, [item.id, item.status]);

  return (
    <div className="my-3 max-w-xl rounded-2xl overflow-hidden border border-fuchsia-400/20 bg-black/30">
      {item.status === 'done' && item.url ? (
        item.kind === 'video' ? (
          <video src={item.url} controls playsInline className="w-full max-h-[60vh] bg-black" />
        ) : (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <img src={item.url} alt={item.prompt} className="w-full max-h-[60vh] object-contain bg-black/40" loading="lazy" />
          </a>
        )
      ) : item.status === 'failed' ? (
        <div className="p-4 text-xs text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{item.error || t('media_failed', '生成失敗')}</span>
        </div>
      ) : (
        <div className="p-6 text-xs text-cyan-200 flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {item.kind === 'video' ? t('media_video_rendering', '影片生成中，通常需要數分鐘…') : t('media_rendering', '生成中…')}
            {item.meta?.progress != null ? ` ${item.meta.progress}%` : ''}
          </span>
        </div>
      )}
      <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-white/5">
        <span className="truncate" title={item.prompt}>{item.prompt}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono">{t(`media_provider_${item.provider}`, item.provider)}</span>
          {item.url && (
            <a href={item.url} download className="hover:text-white" title={t('media_download', '下載')}>
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </span>
      </div>
    </div>
  );
};

export default MediaWidget;
