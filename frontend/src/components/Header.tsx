import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { 
  Globe, 
  Code2, 
  Terminal, 
  FolderGit2, 
  AlertCircle, 
  Settings2, 
  Zap, 
  Loader2,
  Download,
  PanelLeftOpen,
  ChevronDown,
  Check,
  Users,
  ImagePlus,
  RefreshCw,
  Cpu,
  Wrench,
  MessageSquare,
  Plus
} from 'lucide-react';
import { ModelConfig, ToolDefinition, AgentState, Persona } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  modelConfig: ModelConfig;
  agentState: AgentState;
  tools: ToolDefinition[];
  onToggleTool: (name: string, enabled: boolean) => void;
  onOpenSettings: (tab?: 'model' | 'telegram' | 'tools') => void;
  onExportSession?: () => void;
  onOpenWorkspace?: () => void;
  onOpenSwarm?: () => void;
  onOpenMedia?: () => void;
  activePersona?: Persona;
  availableModels?: string[];
  isProbingModels?: boolean;
  onSelectModel?: (model: string) => void;
  onRefreshModels?: () => void;
  isEcoMode?: boolean;
  onToggleEcoMode?: () => void;
  mode?: 'chat' | 'code';
  onToggleMode?: (m: 'chat' | 'code') => void;
  projects?: Array<{ name: string; path: string; file_count: number }>;
  activeProject?: string | null;
  onSelectProject?: (name: string | null) => void;
  onOpenNewProject?: () => void;
  codeExecutionMode?: 'auto' | 'accept_edit' | 'turbo';
  onCodeExecutionModeChange?: (mode: 'auto' | 'accept_edit' | 'turbo') => void;
  isTerminalOpen?: boolean;
  onToggleTerminal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen,
  modelConfig,
  agentState,
  tools,
  onToggleTool,
  onOpenSettings,
  onExportSession,
  onOpenWorkspace,
  onOpenSwarm,
  onOpenMedia,
  activePersona,
  availableModels = [],
  isProbingModels = false,
  onSelectModel,
  onRefreshModels,
  isEcoMode = false,
  onToggleEcoMode,
  mode = 'chat',
  onToggleMode,
  projects = [],
  activeProject = null,
  onSelectProject,
  onOpenNewProject,
  codeExecutionMode = 'auto',
  onCodeExecutionModeChange,
  isTerminalOpen = false,
  onToggleTerminal
}) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const { currentLang, setLanguage, availableLanguages, t } = useI18n();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // The space the header gets depends on the sidebar, not just the window, so collapse by the header's own
  // width: labels go first, then secondary text, then the least important buttons.
  const headerRef = useRef<HTMLElement>(null);
  const [headerWidth, setHeaderWidth] = useState<number>(1400);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    // Measure before first paint so the full-width layout never flashes; RO + resize keep it current
    const measure = () => setHeaderWidth(el.getBoundingClientRect().width);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  // Label widths differ a lot between languages ("工作區" vs "Workspace"), so fixed breakpoints can't work.
  // Instead start from the fullest layout and drop one collapse level at a time until it actually fits.
  const leftGroupRef = useRef<HTMLDivElement>(null);
  const rightGroupRef = useRef<HTMLDivElement>(null);
  const MAX_LEVEL = 7;
  const [level, setLevel] = useState(0);
  const fitKey = [headerWidth, currentLang, isSidebarOpen, mode, activeProject, codeExecutionMode,
    modelConfig.provider, modelConfig.model, agentState, isEcoMode, tools.length].join('|');
  useLayoutEffect(() => {
    setLevel(0);
  }, [fitKey]);
  useLayoutEffect(() => {
    const header = headerRef.current, left = leftGroupRef.current, right = rightGroupRef.current;
    if (!header || !left || !right || level >= MAX_LEVEL) return;
    const style = getComputedStyle(header);
    const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 8;
    // The left group stretches to fill free space, so measure what its children actually need
    const kids = Array.from(left.children) as HTMLElement[];
    const leftNeeded = kids.reduce((sum, el) => sum + el.scrollWidth, 0) + Math.max(0, kids.length - 1) * 12;
    if (leftNeeded + right.scrollWidth > available) setLevel(l => Math.min(MAX_LEVEL, l + 1));
  });
  const showToolPills = !isSidebarOpen && level < 1;
  const showButtonLabels = level < 2;
  const showLangLabel = level < 3;
  const showProvider = level < 3;
  const showCodeBadge = mode === 'code' && level < 4;
  const showStateText = level < 5;
  const showPersonaName = level < 5;
  const showSecondary = level < 6;
  const showModelName = level < 7;
  // The Code-mode bar under the chat already has a terminal toggle, so the header copy can go first on phones
  const showTerminalBtn = level < 7;
  const showToolButton = level < 7;
  const modelNameMax = level < 3 ? 'max-w-[160px]' : level < 5 ? 'max-w-[110px]' : 'max-w-[72px]';

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'web_search':
        return <Globe className="w-3.5 h-3.5 shrink-0" />;
      case 'python_eval':
        return <Code2 className="w-3.5 h-3.5 shrink-0" />;
      case 'bash_executor':
        return <Terminal className="w-3.5 h-3.5 shrink-0" />;
      case 'file_system':
        return <FolderGit2 className="w-3.5 h-3.5 shrink-0" />;
      default:
        return <Zap className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  const getStateBadge = () => {
    switch (agentState) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-medium animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.3)] whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping shrink-0" />
            {showStateText && t('status_thinking', '深度思考中...')}
          </span>
        );
      case 'calling_tool':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-medium animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.3)] whitespace-nowrap shrink-0">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400 shrink-0" />
            {showStateText && t('status_calling_tool', '調用工具中...')}
          </span>
        );
      case 'generating':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium shadow-[0_0_12px_rgba(0,242,254,0.3)] whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            {showStateText && t('status_generating', '正在生成...')}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-medium whitespace-nowrap shrink-0">
            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
            {showStateText && t('status_error', '異常中斷')}
          </span>
        );
      case 'idle':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] text-slate-400 border border-white/10 text-xs font-medium whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400/70 shrink-0" />
            {showStateText && t('status_idle', '就緒 (Idle)')}
          </span>
        );
    }
  };

  const activeLangOption = availableLanguages.find(l => l.code === currentLang) || availableLanguages[0];
  const displayPersonaName = activePersona
    ? t(`persona_${activePersona.id}_name`, activePersona.name)
    : t('default_agent_name', 'Aether 核心架構系統');

  return (
    <header ref={headerRef} className="h-16 glass-panel border-b border-white/10 px-3 sm:px-4 flex items-center justify-between gap-2 relative z-30 shrink-0">
      {/* Left: Sidebar Toggle & Persona Title (clipped rather than overlapping the right group) */}
      <div ref={leftGroupRef} className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl glass-button text-slate-300 hover:text-white transition-all hover:border-cyan-400/30 shrink-0"
            title={t('expand_sidebar', '展開側邊欄')}
            aria-label={t('expand_sidebar', '展開側邊欄')}
          >
            <PanelLeftOpen className="w-4 h-4 text-slate-300" />
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          {showPersonaName && (
            <span className="text-xs font-semibold text-white/90 truncate min-w-0 max-w-[180px]" title={displayPersonaName}>
              {displayPersonaName}
            </span>
          )}
          {getStateBadge()}
        </div>

        {/* Code Mode: Compact status badge (Click to configure project) */}
        {showCodeBadge && (
          <button
            type="button"
            onClick={onOpenNewProject}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-mono transition-all min-w-0 ml-1 shadow-sm"
            title={t('code_project_settings_tooltip', '點擊設定 Code 專案與執行模式')}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold truncate max-w-[110px]">{activeProject || 'Root'}</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/30 text-emerald-200 uppercase font-mono shrink-0">{codeExecutionMode}</span>
          </button>
        )}
      </div>

      {/* Right: Tools Switchers, Language Selector, Model Capsule & Actions */}
      <div ref={rightGroupRef} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Code Mode: Interactive Terminal Console Button (Docked Right) */}
        {mode === 'code' && onToggleTerminal && showTerminalBtn && (
          <button
            onClick={onToggleTerminal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-mono transition-all shadow-sm shrink-0 ${
              isTerminalOpen
                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.35)] font-bold'
                : 'text-slate-300 hover:text-emerald-300 border-white/10 hover:border-emerald-500/30'
            }`}
            title={t('terminal_title', '開啟/收合右側終端機 (Terminal)')}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {showButtonLabels && <span className="font-semibold whitespace-nowrap">{t('terminal_title', '終端機')}</span>}
            {isTerminalOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />}
          </button>
        )}
        {/* Quick Tools Toggle Pills - Only shown when sidebar is closed on ultra-wide viewports to prevent any overlap */}
        <div className={`${showToolPills ? 'flex' : 'hidden'} items-center gap-1 p-1 rounded-xl bg-black/20 border border-white/5 shrink-0`}>
          {tools.slice(0, 4).map((tool) => (
            <button
              key={tool.name}
              onClick={() => onToggleTool(tool.name, !tool.enabled)}
              title={`${tool.description} (${tool.enabled ? 'Enabled' : 'Disabled'})`}
              className={`px-2 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                tool.enabled
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 opacity-40 hover:opacity-75 border border-transparent'
              }`}
            >
              {getToolIcon(tool.name)}
              <span className="text-[11px]">{tool.name}</span>
            </button>
          ))}

          <button
            onClick={() => onOpenSettings('tools')}
            title={t('open_toolbox_full_tooltip', '開啟完整工具箱設定 (管理 22 大工具)')}
            className="px-2 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 bg-white/[0.04] hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/40 shadow-sm"
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold">
              {t('tools_all', '全部')} ({tools.filter(tool => tool.enabled).length}/{tools.length})
            </span>
          </button>
        </div>

        {/* Compact Tool Manager Button */}
        <button
          onClick={() => onOpenSettings('tools')}
          title={t('open_toolbox_tooltip', '開啟工具箱設定 (22 大工具管理)')}
          className={`${showToolPills || !showToolButton ? 'hidden' : 'flex'} items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-mono text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/40 transition-all shadow-sm whitespace-nowrap shrink-0`}
        >
          <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">{tools.filter(t => t.enabled).length}/{tools.length}</span>
        </button>

        {/* Hardware-Saving Eco Mode Button */}
        {onToggleEcoMode && showSecondary && (
          <button
            type="button"
            onClick={onToggleEcoMode}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium transition-all shadow-sm whitespace-nowrap shrink-0 ${
              isEcoMode
                ? 'text-amber-300 border-amber-500/50 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                : 'text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20'
            }`}
            title={isEcoMode ? t('eco_mode_on', '⚡ 節省硬體效能模式：已開啟 (點擊關閉)') : t('eco_mode_off', '⚡ 節省硬體效能模式：已關閉 (點擊開啟)')}
          >
            <Zap className={`w-3.5 h-3.5 shrink-0 ${isEcoMode ? 'text-amber-400 fill-amber-400/30' : 'text-slate-400'}`} />
            {showButtonLabels && (
              <span className="whitespace-nowrap">
                {isEcoMode ? t('eco_active', '節能') : t('eco_inactive', '效能')}
              </span>
            )}
          </button>
        )}

        {/* Multi-Language Selector Capsule */}
        <div className="relative shrink-0" ref={langDropdownRef}>
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-slate-200 border border-white/10 hover:border-cyan-400/40 transition-all shadow-sm whitespace-nowrap shrink-0"
            title={t('language_selector', '切換語系 (Language)')}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs flex items-center gap-1 whitespace-nowrap">
              <span>{activeLangOption.flag}</span>
              {showLangLabel && <span className="whitespace-nowrap">{activeLangOption.label}</span>}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLangOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 glass-modal rounded-2xl border border-white/15 py-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl bg-[#0b101e]/95">
              {availableLanguages.map((lang) => {
                const isSelected = currentLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsLangOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors whitespace-nowrap ${
                      isSelected 
                        ? 'text-cyan-300 font-semibold bg-cyan-500/15' 
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-sm">{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Model Status Capsule with Quick Switcher Dropdown */}
        <div className="relative flex items-center shrink-0" ref={modelDropdownRef}>
          <div className="flex items-center rounded-xl glass-button border border-white/10 hover:border-cyan-400/40 transition-all shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
              title={t('available_models', '可用模型列表')}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] shrink-0" />
              {showProvider && (
                <>
                  <span className="uppercase text-[10px] tracking-wider text-cyan-400 font-bold whitespace-nowrap">
                    {modelConfig.provider}
                  </span>
                  <span className="text-slate-400">/</span>
                </>
              )}
              <span className={`font-mono truncate ${modelNameMax} ${showModelName ? '' : 'hidden'} ${
                modelConfig.model ? 'text-slate-200' : 'text-amber-300 font-semibold text-[11px]'
              }`}>
                {modelConfig.model || t('no_model_selected', '未選取模型')}
              </span>
              <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200 ${isModelMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => onOpenSettings('model')}
              className="px-2 py-1.5 border-l border-white/10 text-slate-400 hover:text-cyan-400 hover:bg-white/10 transition-colors shrink-0"
              title={t('settings_center', 'Aether AI Studio 設定中心')}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {isModelMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 glass-modal rounded-2xl border border-white/15 py-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl bg-[#0b101e]/95">
              <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  {t('available_models', '可用模型列表')}
                </span>
                {onRefreshModels && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefreshModels();
                    }}
                    disabled={isProbingModels}
                    className="p-1 rounded-lg hover:bg-white/10 text-cyan-400 hover:text-cyan-300 transition-colors"
                    title={t('refresh', '重新整理')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProbingModels ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {isProbingModels && availableModels.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>{t('probing_models', '正在自動探測可用模型...')}</span>
                  </div>
                ) : availableModels.length > 0 ? (
                  availableModels.map((m) => {
                    const isCurrent = m === modelConfig.model;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (onSelectModel) onSelectModel(m);
                          setIsModelMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between transition-colors ${
                          isCurrent
                            ? 'text-cyan-300 font-semibold bg-cyan-500/15'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2">{m}</span>
                        {isCurrent && <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5] shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-3 text-center text-xs text-amber-300/90 space-y-1">
                    <div className="font-semibold">{t('no_models_detected', '尚未探測到模型')}</div>
                    <div className="text-[10px] text-slate-400">
                      {t('no_models_installed_hint', '請先下載模型或設定 API Key')}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-1 mt-1 border-t border-white/10 px-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModelMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs font-medium text-cyan-300 hover:bg-cyan-500/15 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{t('open_model_settings', '端點與引擎設定...')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Media Studio (image / video generation) */}
        {onOpenMedia && (
          <button
            onClick={onOpenMedia}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-fuchsia-300 border border-fuchsia-500/30 hover:border-fuchsia-400 hover:bg-fuchsia-500/10 transition-all shadow-sm whitespace-nowrap shrink-0"
            title={t('media_studio_title', '媒體工作室')}
          >
            <ImagePlus className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
            {showButtonLabels && <span className="whitespace-nowrap">{t('media_btn', '媒體')}</span>}
          </button>
        )}

        {/* Swarm Roundtable Debate Button */}
        {onOpenSwarm && showSecondary && (
          <button
            onClick={onOpenSwarm}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-purple-300 border border-purple-500/30 hover:border-purple-400 hover:bg-purple-500/10 transition-all shadow-sm whitespace-nowrap shrink-0"
            title={t('swarm_debate', '多智能體圓桌辯論 (Swarm)')}
          >
            <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            {showButtonLabels && <span className="whitespace-nowrap">{t('swarm_btn', '論辯')}</span>}
          </button>
        )}

        {/* Workspace File Explorer Button */}
        {onOpenWorkspace && (
          <button
            onClick={onOpenWorkspace}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all shadow-sm whitespace-nowrap shrink-0"
            title={t('workspace_explorer', '工作區檔案導航')}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            {showButtonLabels && <span className="whitespace-nowrap">{t('workspace_btn', '工作區')}</span>}
          </button>
        )}

        {/* Export Session Button */}
        {onExportSession && showSecondary && (
          <button
            onClick={onExportSession}
            className="p-2 rounded-xl glass-button text-slate-300 hover:text-cyan-300 transition-all shrink-0"
            title={t('export_session', '匯出對話紀錄 (Markdown)')}
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
export default Header;
