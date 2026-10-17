import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  User, 
  BrainCircuit, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  Sparkles, 
  Volume2, 
  VolumeX,
  Download,
  FileText,
  Star,
  Code2,
  Search,
  Terminal,
  ShieldCheck,
  Cpu,
  Loader2,
  RotateCw
} from 'lucide-react';
import { Message, Persona, AgentState } from '../types';
import { ToolCallCard } from './ToolCallCard';
import { ChartWidget, ChartData } from './ChartWidget';
import { MarkdownRenderer } from './markdown/MarkdownRenderer';
import { useI18n } from '../i18n/I18nContext';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onBookmarkToggle?: (messageId: string) => void;
  persona?: Persona;
  agentState?: AgentState;
}

const MessageItemComponent: React.FC<MessageItemProps> = ({ 
  message, 
  isStreaming,
  onBookmarkToggle,
  persona,
  agentState
}) => {
  const { t, currentLang } = useI18n();
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sloganIdx, setSloganIdx] = useState(0);

  const isUser = message.role === 'user';
  const isBookmarked = Boolean(message.is_bookmarked);

  // Dynamic Cycling Slogans during thinking / generation stages
  const cyclingSlogans = [
    { icon: '🧠', text: t('slogan_thinking', '正在深度推理與分析問題架構...') },
    { icon: '🔍', text: t('slogan_researching', '正在跨領域檢索知識與驗證邏輯...') },
    { icon: '⚙️', text: t('slogan_synthesizing', '正在綜合推論架構並構思解答...') },
    { icon: '✨', text: t('slogan_finalizing', '即將完成回答，正在組織精準文字...') }
  ];

  // Auto-cycle slogans every 2.6s when streaming
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      setSloganIdx(prev => (prev + 1) % cyclingSlogans.length);
    }, 2600);
    return () => clearInterval(timer);
  }, [isStreaming, cyclingSlogans.length]);

  // Keep thought chain open while streaming thought
  useEffect(() => {
    if (isStreaming && message.thought && !message.content) {
      setIsThoughtOpen(true);
    }
  }, [isStreaming, message.thought, message.content]);

  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(message.content);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(message.content);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aether-response-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) {
      alert(t('speak_not_supported', '您的瀏覽器不支援語音朗讀功能'));
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const cleanText = message.content
      .replace(/```[\s\S]*?```/g, '如程式碼所示')
      .replace(/[#*`_~[\]]/g, '')
      .trim();

    if (!cleanText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const langMap: Record<string, string> = {
      'zh-TW': 'zh-TW',
      'zh-CN': 'zh-CN',
      'en': 'en-US',
      'ja': 'ja-JP'
    };
    utterance.lang = langMap[currentLang] || 'zh-TW';
    utterance.rate = 1.05;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const getPersonaIcon = (iconName?: string) => {
    switch (iconName?.toLowerCase()) {
      case 'code2':
      case 'code':
        return <Code2 className="w-4 h-4 text-cyan-400 shrink-0" />;
      case 'search':
        return <Search className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'terminal':
        return <Terminal className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'shieldcheck':
        return <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'cpu':
        return <Cpu className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'sparkles':
      default:
        return <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />;
    }
  };

  const personaDisplayName = persona 
    ? t(`persona_${persona.id}_name`, persona.name) 
    : t('default_agent_name', 'Aether 核心架構系統');

  const currentSlogan = cyclingSlogans[sloganIdx];
  const displayStatus = message.status_text || currentSlogan.text;
  const isAwaitingContent = isStreaming && (!message.content || !message.content.trim());

  return (
    <div 
      id={`msg-${message.id}`}
      className={`flex gap-3.5 py-4 px-2 md:px-4 transition-all duration-300 rounded-3xl ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      
      {/* Assistant Persona Avatar (對方頭像) with dynamic live glow */}
      {!isUser && (
        <div className="flex flex-col items-center shrink-0">
          <div 
            className={`w-9 h-9 rounded-2xl glass-button flex items-center justify-center border transition-all duration-300 ${
              isStreaming 
                ? 'border-cyan-400/80 shadow-[0_0_22px_rgba(0,242,254,0.45)] ring-2 ring-cyan-400/40 bg-gradient-to-br from-cyan-500/30 to-blue-600/30 animate-pulse' 
                : 'border-cyan-500/30 shadow-[0_0_15px_rgba(0,242,254,0.2)] bg-gradient-to-br from-cyan-500/20 to-blue-600/20'
            }`}
            title={personaDisplayName}
          >
            {getPersonaIcon(persona?.icon)}
          </div>
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f2fe] mt-1.5 animate-ping" />
          )}
        </div>
      )}

      {/* Message Body Container */}
      <div className={`max-w-[92%] md:max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0`}>
        
        {/* User Message Bubble */}
        {isUser ? (
          <div className="flex flex-col items-end group max-w-full">
            <div className="px-4 py-3 rounded-2xl glass-button-primary text-slate-100 text-sm md:text-[15px] font-medium leading-relaxed shadow-lg">
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
            
            {/* User Message Action Toolbar */}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
              <span className="text-[11px] text-slate-400 font-mono">
                {message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>

              {/* Bookmark Toggle Button for User Message */}
              {onBookmarkToggle && (
                <button
                  onClick={() => onBookmarkToggle(message.id)}
                  className={`p-1 px-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] transition-all whitespace-nowrap ${
                    isBookmarked ? 'text-amber-400 border-amber-400/40 opacity-100 shadow-[0_0_10px_rgba(251,191,36,0.25)]' : 'text-slate-400 hover:text-amber-400 opacity-80 sm:opacity-0 group-hover:opacity-100'
                  }`}
                  title={isBookmarked ? t('unbookmark_message', '取消收藏') : t('bookmark_message', '收藏此訊息')}
                >
                  <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                  <span className="hidden sm:inline">{isBookmarked ? t('bookmarked', '已收藏') : t('bookmark', '收藏')}</span>
                </button>
              )}

              {/* Copy prompt button */}
              <button
                onClick={handleCopyAnswer}
                className="p-1 px-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('copy', '複製')}
              >
                {copiedAnswer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copiedAnswer ? t('copied', '已複製') : t('copy', '複製')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Assistant Message Card */
          <div className="w-full glass-panel rounded-3xl p-4 md:p-6 border border-white/10 shadow-2xl relative group transition-all duration-300">
            
            {/* Assistant Branding Header Bar */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-cyan-300 tracking-wide truncate">
                  {personaDisplayName}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300/90 whitespace-nowrap shrink-0">
                  {t('ai_agent_tag', '智能代理')}
                </span>
              </div>

              {isStreaming && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[11px] text-cyan-300 font-mono animate-pulse whitespace-nowrap shrink-0">
                  <RotateCw className="w-3 h-3 animate-spin text-cyan-400" />
                  <span>{t('status_generating', '正在生成...')}</span>
                </div>
              )}
            </div>

            {/* Dynamic Cycling Slogan Banner (輪迴快要完成等類似標語) - Active while awaiting tokens */}
            {isAwaitingContent && (
              <div className="p-3.5 my-2.5 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-blue-500/10 border border-cyan-500/30 shadow-[0_0_20px_rgba(0,242,254,0.15)] flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl animate-bounce shrink-0">{currentSlogan.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-cyan-200 truncate transition-all duration-300">
                      {displayStatus}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">
                      Aether Reasoning Engine • Active
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 px-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping delay-150" />
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping delay-300" />
                </div>
              </div>
            )}

            {/* Thought / Thinking Chain (Collapsible & Live Streaming) */}
            {message.thought && (
              <div className="mb-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all">
                <button
                  onClick={() => setIsThoughtOpen(!isThoughtOpen)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-purple-300 hover:bg-purple-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BrainCircuit className={`w-4 h-4 text-purple-400 ${isStreaming ? 'animate-pulse' : ''}`} />
                    <span className="font-semibold tracking-wide">
                      {isStreaming && !message.content 
                        ? t('thinking_active', '思考中...') 
                        : isThoughtOpen ? t('thinking_expanded', '思考過程 (點擊摺疊)') : t('thinking_collapsed', '已深度思考 (點擊展開)')}
                    </span>
                  </div>
                  <div className="text-purple-400/80">
                    {isThoughtOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {isThoughtOpen && (
                  <div className="px-4 pb-3.5 pt-1 border-t border-purple-500/15 text-xs text-purple-200/90 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-sans">
                    {message.thought}
                    {isStreaming && !message.content && (
                      <span className="inline-block w-2 h-3.5 ml-1 bg-purple-400 animate-pulse align-middle" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tool Calls Sequence */}
            {message.tool_calls && message.tool_calls.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  {t('tool_execution_sequence', '智能體工具調用序列 :')}
                </div>
                {message.tool_calls.map((tc, idx) => (
                  <React.Fragment key={tc.id || idx}>
                    <ToolCallCard tool={tc} />
                    {tc.name === 'generate_chart' && tc.output && (() => {
                      try {
                        const parsed = JSON.parse(tc.output);
                        if (parsed.is_chart) {
                          return <ChartWidget data={parsed as ChartData} />;
                        }
                      } catch (e) {
                        return null;
                      }
                      return null;
                    })()}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Rendered Markdown Output with Blinking Streaming Cursor */}
            {message.content ? (
              <div className="relative text-slate-100 text-sm md:text-[15px] leading-relaxed">
                <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
                {isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle shadow-[0_0_8px_#00f2fe]" />
                )}
              </div>
            ) : !isStreaming && !isAwaitingContent ? (
              <div className="text-xs text-slate-400/80 italic py-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400/60" />
                <span>
                  {message.thought 
                    ? t('thought_only_notice', '（已完成深度思維推論，請展開上方思維鏈查看推理過程）') 
                    : t('no_content_notice', '（未返回正文內容）')}
                </span>
              </div>
            ) : null}

            {/* Message Action Footer Toolbar */}
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px] text-slate-400 font-mono">
                {message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>

              <div className="flex items-center gap-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {/* Bookmark Toggle Button */}
                {onBookmarkToggle && (
                  <button
                    onClick={() => onBookmarkToggle(message.id)}
                    className={`p-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap ${
                      isBookmarked ? 'text-amber-400 border-amber-400/30' : 'text-slate-400 hover:text-amber-400'
                    }`}
                    title={isBookmarked ? t('unbookmark_message', '取消收藏') : t('bookmark_message', '收藏此訊息')}
                  >
                    <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span className="hidden sm:inline">{isBookmarked ? t('bookmarked', '已收藏') : t('bookmark', '收藏')}</span>
                  </button>
                )}

                {/* Speech readout */}
                {message.content && (
                  <button
                    onClick={handleSpeak}
                    className={`p-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap ${
                      isSpeaking ? 'text-cyan-300' : 'text-slate-400 hover:text-cyan-300'
                    }`}
                    title={isSpeaking ? t('stop_generation', '停止朗讀') : t('speak_answer', '語音朗讀此回答')}
                  >
                    {isSpeaking ? <VolumeX className="w-3.5 h-3.5 animate-pulse text-cyan-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isSpeaking ? t('speaking', '朗讀中') : t('speak_answer', '朗讀')}</span>
                  </button>
                )}

                {/* Copy raw Markdown */}
                {message.content && (
                  <button
                    onClick={handleCopyMarkdown}
                    className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px] whitespace-nowrap"
                    title="複製 Markdown 原始碼"
                  >
                    {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{copiedMarkdown ? t('copied_md', '已複製 MD') : 'Markdown'}</span>
                  </button>
                )}

                {/* Export as .md */}
                {message.content && (
                  <button
                    onClick={handleDownloadMarkdown}
                    className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px] whitespace-nowrap"
                    title="匯出此回答為 .md 檔案"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">.md</span>
                  </button>
                )}

                {/* Copy Answer */}
                {message.content && (
                  <button
                    onClick={handleCopyAnswer}
                    className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px] whitespace-nowrap"
                    title={t('copy_answer', '複製回答')}
                  >
                    {copiedAnswer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAnswer ? t('copied', '已複製') : t('copy', '複製')}</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-9 h-9 rounded-2xl glass-button flex items-center justify-center shrink-0 border border-white/20 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 shadow-md">
          <User className="w-4 h-4 text-indigo-300" />
        </div>
      )}
    </div>
  );
};

export const MessageItem = React.memo<MessageItemProps>(
  MessageItemComponent,
  (prev, next) => {
    // If streaming state or agent state changed for this message, re-render
    if (prev.isStreaming !== next.isStreaming) return false;
    if (prev.agentState !== next.agentState) return false;

    // If message content, thought or status changed, re-render
    if (prev.message.id !== next.message.id) return false;
    if (prev.message.content !== next.message.content) return false;
    if (prev.message.thought !== next.message.thought) return false;
    if (prev.message.status_text !== next.message.status_text) return false;

    // If bookmark status changed, re-render
    if (Boolean(prev.message.is_bookmarked) !== Boolean(next.message.is_bookmarked)) return false;

    // If persona changed, re-render
    if (prev.persona?.id !== next.persona?.id) return false;

    // If tool calls changed, re-render
    const prevTc = prev.message.tool_calls || [];
    const nextTc = next.message.tool_calls || [];
    if (prevTc.length !== nextTc.length) return false;
    for (let i = 0; i < prevTc.length; i++) {
      if (prevTc[i].isRunning !== nextTc[i].isRunning) return false;
      if (prevTc[i].output !== nextTc[i].output) return false;
      if (prevTc[i].success !== nextTc[i].success) return false;
    }

    // Identical historical message: skip heavy markdown/katex re-renders!
    return true;
  }
);

export default MessageItem;
