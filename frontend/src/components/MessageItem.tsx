import React, { useState } from 'react';
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
  Star
} from 'lucide-react';
import { Message } from '../types';
import { ToolCallCard } from './ToolCallCard';
import { ChartWidget, ChartData } from './ChartWidget';
import { MarkdownRenderer } from './markdown/MarkdownRenderer';
import { useI18n } from '../i18n/I18nContext';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onBookmarkToggle?: (messageId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({ 
  message, 
  isStreaming,
  onBookmarkToggle
}) => {
  const { t, currentLang } = useI18n();
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isUser = message.role === 'user';
  const isBookmarked = Boolean(message.is_bookmarked);

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

  return (
    <div className={`flex gap-3.5 py-4 px-2 md:px-4 transition-opacity duration-300 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Agent Avatar */}
      {!isUser && (
        <div className="w-9 h-9 rounded-2xl glass-button flex items-center justify-center shrink-0 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,242,254,0.2)] bg-gradient-to-br from-cyan-500/20 to-blue-600/20">
          <Sparkles className="w-4 h-4 text-cyan-300" />
        </div>
      )}

      {/* Message Body Container */}
      <div className={`max-w-[92%] md:max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* User Bubble */}
        {isUser ? (
          <div className="relative group">
            <div className="px-4 py-3 rounded-2xl glass-button-primary text-slate-100 text-sm md:text-[15px] font-medium leading-relaxed shadow-lg">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
            {/* User Bookmark action button */}
            {onBookmarkToggle && (
              <button
                onClick={() => onBookmarkToggle(message.id)}
                className={`absolute -bottom-5 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[11px] rounded-lg ${
                  isBookmarked ? 'text-amber-400 opacity-100' : 'text-slate-500 hover:text-amber-400'
                }`}
                title={isBookmarked ? t('unbookmark_message', '取消收藏') : t('bookmark_message', '收藏此訊息')}
              >
                <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
              </button>
            )}
          </div>
        ) : (
          /* Assistant Card with Liquid Glass Treatment */
          <div className="w-full glass-panel rounded-3xl p-4 md:p-6 border border-white/10 shadow-2xl relative group">
            
            {/* Thought / Thinking Chain (Collapsible) */}
            {message.thought && (
              <div className="mb-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                <button
                  onClick={() => setIsThoughtOpen(!isThoughtOpen)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-purple-300 hover:bg-purple-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <span className="font-semibold tracking-wide">
                      {t('thinking_process', '思維鏈分析 (Thinking Process)')}
                    </span>
                  </div>
                  <div className="text-purple-400/80">
                    {isThoughtOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {isThoughtOpen && (
                  <div className="px-4 pb-3.5 pt-1 border-t border-purple-500/15 text-xs text-purple-200/90 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-sans">
                    {message.thought}
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

            {/* Powerful Markdown Rendered Output */}
            <MarkdownRenderer content={message.content} isStreaming={isStreaming} />

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
                    className={`p-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] transition-colors ${
                      isBookmarked ? 'text-amber-400 border-amber-400/30' : 'text-slate-400 hover:text-amber-400'
                    }`}
                    title={isBookmarked ? t('unbookmark_message', '取消收藏') : t('bookmark_message', '收藏此訊息')}
                  >
                    <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span className="hidden sm:inline">{isBookmarked ? '已收藏' : '收藏'}</span>
                  </button>
                )}

                {/* Speech readout */}
                <button
                  onClick={handleSpeak}
                  className={`p-1.5 rounded-lg glass-button flex items-center gap-1 text-[11px] transition-colors ${
                    isSpeaking ? 'text-cyan-300' : 'text-slate-400 hover:text-cyan-300'
                  }`}
                  title={isSpeaking ? t('stop_generation', '停止朗讀') : t('speak_answer', '語音朗讀此回答')}
                >
                  {isSpeaking ? <VolumeX className="w-3.5 h-3.5 animate-pulse text-cyan-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isSpeaking ? t('speaking', '朗讀中') : t('speak_answer', '朗讀')}</span>
                </button>

                {/* Copy raw Markdown */}
                <button
                  onClick={handleCopyMarkdown}
                  className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px]"
                  title="複製 Markdown 原始碼"
                >
                  {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedMarkdown ? '已複製 MD' : 'Markdown'}</span>
                </button>

                {/* Export as .md */}
                <button
                  onClick={handleDownloadMarkdown}
                  className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px]"
                  title="匯出此回答為 .md 檔案"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">.md</span>
                </button>

                {/* Copy Answer */}
                <button
                  onClick={handleCopyAnswer}
                  className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px]"
                  title={t('copy_answer', '複製回答')}
                >
                  {copiedAnswer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAnswer ? t('copied', '已複製') : t('copy', '複製')}</span>
                </button>
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
export default MessageItem;
