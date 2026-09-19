import React, { useState, useRef, useEffect } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Check
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
  onOpenSettings: () => void;
  onExportSession?: () => void;
  activePersona?: Persona;
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
  activePersona
}) => {
  const { currentLang, setLanguage, availableLanguages, t } = useI18n();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // Close language dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'web_search':
        return <Globe className="w-3.5 h-3.5" />;
      case 'python_eval':
        return <Code2 className="w-3.5 h-3.5" />;
      case 'bash_executor':
        return <Terminal className="w-3.5 h-3.5" />;
      case 'file_system':
        return <FolderGit2 className="w-3.5 h-3.5" />;
      default:
        return <Zap className="w-3.5 h-3.5" />;
    }
  };

  const getStateBadge = () => {
    switch (agentState) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-medium animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            {t('status_thinking', '深度思考中...')}
          </span>
        );
      case 'calling_tool':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-medium animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.3)]">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            {t('status_calling_tool', '調用工具中...')}
          </span>
        );
      case 'generating':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium shadow-[0_0_12px_rgba(0,242,254,0.3)]">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            {t('status_generating', '正在生成...')}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-medium">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            {t('status_error', '異常中斷')}
          </span>
        );
      case 'idle':
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] text-slate-400 border border-white/10 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-cyan-400/70" />
            {t('status_idle', '就緒 (Idle)')}
          </span>
        );
    }
  };

  const activeLangOption = availableLanguages.find(l => l.code === currentLang) || availableLanguages[0];

  return (
    <header className="h-16 glass-panel border-b border-white/10 px-4 flex items-center justify-between z-20 shrink-0">
      {/* Left: Sidebar Toggle & Persona Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl glass-button text-slate-300 hover:text-white transition-all hover:border-cyan-400/30"
          title={isSidebarOpen ? t('collapse_sidebar', '收合側邊欄') : t('expand_sidebar', '展開側邊欄')}
          aria-label={isSidebarOpen ? t('collapse_sidebar', '收合側邊欄') : t('expand_sidebar', '展開側邊欄')}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4 text-cyan-300" />
          ) : (
            <PanelLeftOpen className="w-4 h-4 text-slate-300" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/90 truncate max-w-[140px] sm:max-w-[240px]">
            {activePersona ? activePersona.name : t('default_agent_name', 'Aether 核心架構系統')}
          </span>
          {getStateBadge()}
        </div>
      </div>

      {/* Right: Tools Switchers, Language Selector, Model Capsule & Export */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Quick Tools Toggle Pills */}
        <div className="hidden lg:flex items-center gap-1.5 p-1 rounded-xl bg-black/20 border border-white/5">
          {tools.slice(0, 4).map((tool) => (
            <button
              key={tool.name}
              onClick={() => onToggleTool(tool.name, !tool.enabled)}
              title={`${tool.description} (${tool.enabled ? 'Enabled' : 'Disabled'})`}
              className={`px-2 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
                tool.enabled
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 opacity-40 hover:opacity-75 border border-transparent'
              }`}
            >
              {getToolIcon(tool.name)}
              <span className="text-[11px]">{tool.name}</span>
            </button>
          ))}
        </div>

        {/* Multi-Language Selector Capsule */}
        <div className="relative" ref={langDropdownRef}>
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-slate-200 border border-white/10 hover:border-cyan-400/40 transition-all shadow-sm"
            title={t('language_selector', '切換語系 (Language)')}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs flex items-center gap-1">
              <span>{activeLangOption.flag}</span>
              <span className="hidden sm:inline">{activeLangOption.label}</span>
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLangOpen && (
            <div className="absolute right-0 mt-2 w-36 glass-modal rounded-2xl border border-white/15 py-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl bg-[#0b101e]/90">
              {availableLanguages.map((lang) => {
                const isSelected = currentLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsLangOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                      isSelected 
                        ? 'text-cyan-300 font-semibold bg-cyan-500/15' 
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Model Status Capsule */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-button text-xs font-medium text-slate-200 border border-white/10 hover:border-cyan-400/40 transition-all shadow-sm group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
          <div className="flex items-center gap-1.5">
            <span className="uppercase text-[10px] tracking-wider text-cyan-400 font-bold">
              {modelConfig.provider}
            </span>
            <span className="text-slate-400">/</span>
            <span className="font-mono text-slate-200 truncate max-w-[90px] sm:max-w-[140px] md:max-w-[180px]">
              {modelConfig.model}
            </span>
          </div>
          <Settings2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors ml-1" />
        </button>

        {/* Export Session Button */}
        {onExportSession && (
          <button
            onClick={onExportSession}
            className="p-2 rounded-xl glass-button text-slate-300 hover:text-cyan-300 transition-all"
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
