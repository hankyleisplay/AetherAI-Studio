import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings as SettingsIcon, 
  Sparkles, 
  Code2, 
  Search, 
  Terminal, 
  ShieldCheck, 
  Cpu,
  PanelLeftClose,
  Star,
  X
} from 'lucide-react';
import { Session, Persona, Message } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  onOpenNewPersona: () => void;
  onOpenSettings: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  personas,
  selectedPersonaId,
  onSelectPersona,
  onOpenNewPersona,
  onOpenSettings,
  isOpen,
  onToggle,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'sessions' | 'bookmarks'>('sessions');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [bookmarks, setBookmarks] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Live search debounced
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search sessions failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch bookmarks when tab changes to bookmarks
  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks');
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data);
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'bookmarks') {
      fetchBookmarks();
    }
  }, [activeTab]);

  const getPersonaIcon = (icon: string) => {
    switch (icon) {
      case 'Code2':
        return <Code2 className="w-3.5 h-3.5" />;
      case 'Search':
        return <Search className="w-3.5 h-3.5" />;
      case 'Terminal':
        return <Terminal className="w-3.5 h-3.5" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-3.5 h-3.5" />;
      case 'Cpu':
        return <Cpu className="w-3.5 h-3.5" />;
      case 'Sparkles':
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  const displayedSessions = searchResults !== null ? searchResults : sessions;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onToggle}
          className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-30 transition-opacity"
        />
      )}

      {/* Sidebar Container with Responsive Collapse */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 h-full glass-panel flex flex-col border-r border-white/10 transition-all duration-300 ease-in-out shrink-0 ${
          isOpen 
            ? 'w-72 md:w-80 min-w-[18rem] md:min-w-[20rem] translate-x-0 opacity-100 pointer-events-auto' 
            : 'w-0 min-w-0 max-w-0 -translate-x-full md:translate-x-0 opacity-0 overflow-hidden border-r-0 pointer-events-none p-0 m-0'
        }`}
      >
        {/* Fixed-width Inner Wrapper */}
        <div className="w-72 md:w-80 h-full flex flex-col shrink-0">
          
          {/* Logo, Brand and Collapse Button */}
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-[0_0_18px_rgba(0,242,254,0.35)] shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-sm font-extrabold bg-gradient-to-r from-white via-cyan-200 to-indigo-400 bg-clip-text text-transparent truncate">
                  {t('brand_name', 'AetherAI Studio 2.0')}
                </h1>
                <span className="text-[10px] text-cyan-400/90 font-mono tracking-wider truncate block">
                  {t('brand_subtitle', 'AetherAgent 企業級自主系統')}
                </span>
              </div>
            </div>

            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-white hover:border-cyan-400/30 transition-all shrink-0"
              title={t('collapse_sidebar', '收合側邊欄')}
              aria-label={t('collapse_sidebar', '收合側邊欄')}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Action: New Chat */}
          <div className="p-3 pb-2">
            <button
              onClick={onNewSession}
              className="w-full py-2.5 px-3.5 rounded-xl glass-button-primary flex items-center justify-center gap-2 text-xs font-semibold text-white transition-all shadow-md active:scale-95 hover:shadow-[0_0_18px_rgba(0,242,254,0.4)]"
              title={t('new_session', '開啟新對話')}
            >
              <Plus className="w-4 h-4" />
              <span>{t('new_session', '開啟新對話 (New Session)')}</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_placeholder', '搜尋會話或對話內容...')}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-black/40 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Persona Switcher Chips */}
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t('specialized_agents', '專業工程代理陣列')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {personas.map((p) => {
                const isSelected = p.id === selectedPersonaId;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPersona(p.id)}
                    title={`${p.name}\n${p.description}`}
                    className={`p-2 rounded-xl text-left text-xs transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 shadow-[0_0_14px_rgba(0,242,254,0.25)] font-semibold'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                    }`}
                  >
                    <span className={isSelected ? 'text-cyan-400' : 'text-slate-400'}>
                      {getPersonaIcon(p.icon)}
                    </span>
                    <span className="truncate text-[11px]">{p.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={onOpenNewPersona}
              className="w-full mt-2 py-1.5 px-2 rounded-xl border border-dashed border-white/15 hover:border-purple-400/50 text-[11px] text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="w-3 h-3" />
              <span>{t('create_agent', '配置專屬工程代理角色')}</span>
            </button>
          </div>

          {/* Tab Selector: Sessions vs Bookmarks */}
          <div className="px-3 pt-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-black/30 border border-white/5 rounded-xl">
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'sessions'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{t('tab_sessions', '會話列表')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('bookmarks');
                  fetchBookmarks();
                }}
                className={`flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'bookmarks'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-amber-400/40 text-amber-400" />
                <span>{t('tab_bookmarks', '收藏清單')}</span>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {activeTab === 'sessions' ? (
              <>
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {searchQuery ? `搜尋結果 (${displayedSessions.length})` : t('session_history', '會話歷程 (Session History)')}
                  </span>
                </div>

                {displayedSessions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    {searchQuery ? '未找到符合的會話' : t('no_history', '尚無歷史會話紀錄')}
                  </div>
                ) : (
                  displayedSessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    return (
                      <div
                        key={s.id}
                        onClick={() => onSelectSession(s.id)}
                        className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all border ${
                          isActive
                            ? 'bg-white/[0.08] border-cyan-400/40 text-white font-medium shadow-sm'
                            : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                          <span className="truncate">{s.title}</span>
                        </div>

                        <button
                          onClick={(e) => onDeleteSession(s.id, e)}
                          className="opacity-70 md:opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity rounded hover:bg-white/10 shrink-0"
                          title={t('delete_session', '刪除會話')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              /* Bookmarks Tab Content */
              <>
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {t('bookmarked_messages', '精選收藏訊息')} ({bookmarks.length})
                  </span>
                </div>

                {bookmarks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    {t('no_bookmarks', '尚無任何收藏的訊息')}
                  </div>
                ) : (
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      onClick={() => bm.session_id && onSelectSession(bm.session_id)}
                      className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-amber-500/20 hover:border-amber-500/40 cursor-pointer transition-all space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] text-amber-300/80">
                        <span className="font-semibold truncate max-w-[140px]">
                          {bm.session_title || '會話紀錄'}
                        </span>
                        <span>{bm.created_at ? bm.created_at.substring(5, 16).replace('T', ' ') : ''}</span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 leading-snug">
                        {bm.content || (bm.thought ? `[思考] ${bm.thought}` : '(無內容)')}
                      </p>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* Bottom Bar Settings */}
          <div className="p-3 border-t border-white/[0.08] flex items-center justify-between bg-black/20">
            <button
              onClick={onOpenSettings}
              className="flex-1 py-2 px-3 rounded-xl glass-button text-xs font-medium text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-all hover:border-cyan-400/30"
            >
              <SettingsIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('system_settings', '模型與系統配置 (Settings)')}</span>
            </button>
          </div>

        </div>
      </aside>
    </>
  );
};
export default Sidebar;
