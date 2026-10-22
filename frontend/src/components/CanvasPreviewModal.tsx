import { useI18n } from '../i18n/I18nContext';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  RotateCw, 
  ExternalLink, 
  Download, 
  Monitor, 
  Tablet, 
  Smartphone, 
  Sun, 
  Moon, 
  Maximize2,
  Minimize2,
  Code2,
  Sparkles
} from 'lucide-react';

interface CanvasPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  lang: string;
}

export const CanvasPreviewModal: React.FC<CanvasPreviewModalProps> = ({
  isOpen,
  onClose,
  code,
  lang
}) => {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [bgColor, setBgColor] = useState<'dark' | 'light' | 'checker'>('dark');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { t } = useI18n();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const processedSrcDoc = useMemo(() => {
    const trimmed = code.trim();
    const isSvg = lang === 'svg' || trimmed.startsWith('<svg');

    if (isSvg) {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Aether SVG Canvas</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: transparent;
      overflow: auto;
    }
    svg {
      max-width: 90vw;
      max-height: 90vh;
      height: auto;
      filter: drop-shadow(0 12px 30px rgba(0,0,0,0.5));
      transition: transform 0.2s ease;
    }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
    }

    // If already a full HTML document, return as is
    if (/<!doctype\s+html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
      return trimmed;
    }

    // Wrap bare HTML / Canvas snippet in standard styled container
    const isDark = bgColor === 'dark';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aether Live Canvas</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: ${isDark ? '#f1f5f9' : '#0f172a'};
      background: ${isDark ? '#0b0f19' : '#ffffff'};
    }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
  }, [code, lang, bgColor, refreshKey]);

  if (!isOpen) return null;

  const handleOpenNewTab = () => {
    const blob = new Blob([processedSrcDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownload = () => {
    const ext = lang === 'svg' ? 'svg' : 'html';
    const blob = new Blob([code], { type: lang === 'svg' ? 'image/svg+xml' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-canvas-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getViewportWidth = () => {
    switch (viewport) {
      case 'mobile':
        return 'w-[375px] max-w-full';
      case 'tablet':
        return 'w-[768px] max-w-full';
      case 'desktop':
      default:
        return 'w-full';
    }
  };

  const getBackgroundStyle = () => {
    switch (bgColor) {
      case 'light':
        return 'bg-white text-slate-900';
      case 'checker':
        return 'bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:20px_20px] bg-[#0f172a]';
      case 'dark':
      default:
        return 'bg-[#0b0f19] text-white';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className={`glass-panel border border-white/20 rounded-2xl flex flex-col shadow-[0_0_50px_rgba(0,242,254,0.25)] overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[92vh]'
        }`}
      >
        {/* Modal Top Control Bar */}
        <div className="px-4 py-3 bg-white/[0.06] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,242,254,0.3)]">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {t('canvas_title', 'Aether Live Canvas 沙盒畫布')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono font-bold uppercase">
                  {lang.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {t('canvas_subtitle', '安全隔離沙盒容器 (Safe Sandboxed Iframe) • 即時互動渲染')}
              </p>
            </div>
          </div>

          {/* Viewport & Backdrop Switchers */}
          <div className="flex items-center gap-2">
            {/* Viewport Switcher */}
            <div className="hidden sm:flex items-center p-1 rounded-xl bg-black/30 border border-white/10">
              <button
                onClick={() => setViewport('desktop')}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                  viewport === 'desktop' ? 'bg-cyan-500/30 text-cyan-300 shadow' : 'text-slate-400 hover:text-white'
                }`}
                title={t('viewport_desktop', '桌面檢視 (100%)')}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">{t('viewport_desktop_btn', '桌面')}</span>
              </button>
              <button
                onClick={() => setViewport('tablet')}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                  viewport === 'tablet' ? 'bg-cyan-500/30 text-cyan-300 shadow' : 'text-slate-400 hover:text-white'
                }`}
                title={t('viewport_tablet', '平板檢視 (768px)')}
              >
                <Tablet className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">{t('viewport_tablet_btn', '平板')}</span>
              </button>
              <button
                onClick={() => setViewport('mobile')}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                  viewport === 'mobile' ? 'bg-cyan-500/30 text-cyan-300 shadow' : 'text-slate-400 hover:text-white'
                }`}
                title={t('viewport_mobile', '手機檢視 (375px)')}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">{t('viewport_mobile_btn', '手機')}</span>
              </button>
            </div>

            {/* Canvas Backdrop Selector */}
            <div className="flex items-center p-1 rounded-xl bg-black/30 border border-white/10">
              <button
                onClick={() => setBgColor('dark')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  bgColor === 'dark' ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
                title={t('bg_dark', '深色背景')}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setBgColor('light')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  bgColor === 'light' ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
                title={t('bg_light', '淺色背景')}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setBgColor('checker')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  bgColor === 'checker' ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
                title={t('bg_checker', '透明棋盤背景 (適合透明 SVG)')}
              >
                <Code2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Actions: Refresh, New Tab, Download, Fullscreen, Close */}
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-1.5 rounded-lg glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title={t('reload_sandbox', '重新載入沙盒')}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenNewTab}
              className="p-1.5 rounded-lg glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title={t('open_in_new_tab', '在新分頁開啟')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title={t('download_file', '下載檔案')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title={isFullscreen ? t('exit_fullscreen', '退出全螢幕') : t('fullscreen_view', '全螢幕檢視')}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors ml-1"
              title={t('close_sandbox', '關閉沙盒 (Esc)')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Body Container */}
        <div className="flex-1 bg-black/60 p-2 sm:p-4 flex items-center justify-center overflow-auto">
          <div 
            className={`h-full transition-all duration-300 rounded-xl overflow-hidden shadow-2xl border border-white/10 ${getViewportWidth()} ${getBackgroundStyle()}`}
          >
            <iframe
              ref={iframeRef}
              key={refreshKey}
              srcDoc={processedSrcDoc}
              title="Aether Live Sandbox"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-transparent block"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
