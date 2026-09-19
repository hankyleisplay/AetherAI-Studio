import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Square, 
  Sparkles, 
  Search, 
  Code2, 
  Cpu, 
  FolderPlus,
  ArrowDown,
  Paperclip,
  UploadCloud,
  FileText,
  Loader2,
  X,
  Mic,
  MicOff,
  Sliders,
  Compass,
  Target
} from 'lucide-react';
import { Message, AgentState } from '../types';
import { MessageItem } from './MessageItem';
import { useI18n } from '../i18n/I18nContext';

interface ChatViewProps {
  messages: Message[];
  agentState: AgentState;
  onSendMessage: (text: string) => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  onBookmarkToggle?: (messageId: string) => void;
  temperature?: number;
  onTemperatureChange?: (temp: number) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  agentState,
  onSendMessage,
  onStopGeneration,
  isStreaming,
  onBookmarkToggle,
  temperature = 0.7,
  onTemperatureChange
}) => {
  const { t, currentLang } = useI18n();
  const [inputText, setInputText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('speak_not_supported', '您的瀏覽器不支援 Web Speech API 語音辨識，建議使用 Chrome、Edge 或 Safari 瀏覽器。'));
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      const langMap: Record<string, string> = {
        'zh-TW': 'zh-TW',
        'zh-CN': 'zh-CN',
        'en': 'en-US',
        'ja': 'ja-JP'
      };
      recognition.lang = langMap[currentLang] || 'zh-TW';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Speech recognition error:', e);
      setIsListening(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setUploadedFile({ name: data.filename, path: data.path });
        if (!inputText.trim()) {
          setInputText(`請幫我分析工作區檔案 ${data.path} 的內容與重點摘要。`);
        }
      }
    } catch (e) {
      console.error('File upload error:', e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isStreaming]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 150;
    setShowScrollBottom(isFarFromBottom);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!inputText.trim() || isStreaming) return;
    onSendMessage(inputText.trim());
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const suggestions = [
    {
      icon: <Search className="w-4 h-4 text-cyan-400" />,
      title: t('sugg_1_title', '全球即時科技情報研析'),
      desc: t('sugg_1_desc', '多來源交叉檢索國際最新開源模型與架構突破'),
      prompt: t('sugg_1_prompt', '請幫我檢索全球最新一週的頂尖 AI 開源模型進展（包含架構變革、推論效能與評測指標），並彙整為結構化技術簡報。')
    },
    {
      icon: <Code2 className="w-4 h-4 text-amber-400" />,
      title: t('sugg_2_title', '高階演算法沙盒數值驗證'),
      desc: t('sugg_2_desc', '以 Python 沙盒即時編譯執行工程演算法與數值模型'),
      prompt: t('sugg_2_prompt', '請使用 Python 沙盒撰寫並驗證一個具備自適應權重的高階數值分析或圖論演算法，展示計算結果與執行效能指標。')
    },
    {
      icon: <FolderPlus className="w-4 h-4 text-blue-400" />,
      title: t('sugg_3_title', '工作區專案工程架構管理'),
      desc: t('sugg_3_desc', '安全受控沙盒環境下的工程架構建立與檔案 I/O'),
      prompt: t('sugg_3_prompt', '請在 workspace 目錄中建立系統架構藍圖 architecture.md，結構化定義模組規格與資料流模型，並列出目錄檔案驗證。')
    },
    {
      icon: <Cpu className="w-4 h-4 text-purple-400" />,
      title: t('sugg_4_title', '主機硬體健康與資源指標診斷'),
      desc: t('sugg_4_desc', '深度監控 CPU 運算負載、RAM 使用率與本機推論裕度'),
      prompt: t('sugg_4_prompt', '請全面診斷當前主機系統的硬體負載指標、記憶體分佈、磁碟空間健康狀態，並評估本機運行大模型推論的資源裕度。')
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] relative z-10 overflow-hidden">
      
      {/* Messages Scroll Container */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 md:px-6 py-4 space-y-2"
      >
        {messages.length === 0 ? (
          /* Empty State Welcome Screen */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 py-8">
            <div className="w-16 h-16 rounded-3xl glass-button flex items-center justify-center mb-5 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,242,254,0.3)] bg-gradient-to-tr from-cyan-500/20 via-blue-600/20 to-purple-600/20">
              <Sparkles className="w-8 h-8 text-cyan-300" />
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent mb-2">
              {t('brand_name', 'AetherAI Studio 2.0')} ({t('brand_subtitle', 'AetherAgent 企業級自主系統')})
            </h2>
            <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
              {t('system_desc', '企業級本地與雲端雙模自主智能體系統 • Liquid Glass Optical Aesthetics。已就緒支援 Ollama 本地開源模型與各主流雲端 LLM 引擎。')}
            </p>

            {/* Quick Suggestion Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(s.prompt)}
                  className="p-3.5 rounded-2xl glass-card text-left transition-all hover:scale-[1.02] border border-white/10 flex items-start gap-3 group active:scale-95 shadow-sm hover:shadow-[0_0_15px_rgba(0,242,254,0.2)]"
                >
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/10 group-hover:bg-cyan-500/20 transition-colors shrink-0">
                    {s.icon}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                      {s.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                      {s.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <MessageItem
              key={m.id || idx}
              message={m}
              isStreaming={isStreaming && idx === messages.length - 1 && m.role === 'assistant'}
              onBookmarkToggle={onBookmarkToggle}
            />
          ))
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-32 right-8 p-2 rounded-full glass-button border border-white/20 text-cyan-300 hover:text-white shadow-xl transition-all animate-bounce z-20"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Reasoning Tuning Capsule & Chat Input Dock */}
      <div className="p-3 md:p-5 max-w-4xl w-full mx-auto space-y-2">
        
        {/* Inline Reasoning Temperature Capsule */}
        {onTemperatureChange && (
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-medium">{t('reasoning_tuning', '推論調優')}:</span>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5 backdrop-blur-md">
              {/* Precise (0.2) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(0.2)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                  temperature <= 0.3
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_precise_desc', '低隨機度 (0.2)，適合代碼架構、數學證明、嚴格邏輯')}
              >
                <Target className="w-3 h-3 text-cyan-400" />
                <span>{t('reasoning_precise', '精確嚴謹 (0.2)')}</span>
              </button>

              {/* Balanced (0.7) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(0.7)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                  temperature > 0.3 && temperature <= 0.8
                    ? 'bg-blue-500/25 text-blue-200 border border-blue-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_balanced_desc', '均衡隨機度 (0.7)，適合綜合問答、系統工程、文檔解析')}
              >
                <Compass className="w-3 h-3 text-blue-400" />
                <span>{t('reasoning_balanced', '標準平衡 (0.7)')}</span>
              </button>

              {/* Creative (1.1) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(1.1)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                  temperature > 0.8
                    ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_creative_desc', '高隨機度 (1.1)，適合頭腦風暴、靈感探索、方案發散')}
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>{t('reasoning_creative', '發散創意 (1.1)')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Input Dock Container */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`glass-panel rounded-2xl p-2 md:p-3 border shadow-2xl relative transition-all ${
            isDragging 
              ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_30px_rgba(0,242,254,0.3)]' 
              : 'border-white/15 focus-within:border-cyan-400/50 focus-within:shadow-[0_0_25px_rgba(0,242,254,0.2)]'
          }`}
        >
          {/* Drag & Drop Visual Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 rounded-2xl bg-cyan-950/80 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-cyan-400 text-cyan-200">
              <UploadCloud className="w-8 h-8 animate-bounce mb-1" />
              <p className="text-xs font-semibold">{t('drag_drop_hint', '放開滑鼠即可將檔案上傳至工作區')}</p>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          {/* Uploaded File Chip */}
          {uploadedFile && (
            <div className="mb-2 flex items-center gap-2 p-1.5 px-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs text-cyan-200 w-fit">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono truncate max-w-[220px]">{uploadedFile.name}</span>
              <span className="text-[10px] text-cyan-400/70 font-mono">({uploadedFile.path})</span>
              <button
                type="button"
                onClick={() => setUploadedFile(null)}
                className="hover:text-white ml-1"
                title="移除檔案"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInputResize}
            onKeyDown={handleKeyDown}
            placeholder={t('chat_placeholder', '請輸入指令或問題... (可拖曳代碼/文字/數據檔案至此，Enter 發送)')}
            disabled={isStreaming}
            className="w-full bg-transparent px-3 py-1.5 text-sm md:text-[15px] text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-44 overflow-y-auto font-sans"
          />

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1 px-1">
            <div className="flex items-center gap-2">
              {/* File Upload Trigger Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isStreaming}
                className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-xs"
                title={t('upload_file', '上傳檔案')}
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline text-[11px]">{t('upload_file', '上傳檔案')}</span>
              </button>

              {/* Voice Dictation (Speech Recognition) Button */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={`p-1.5 rounded-lg glass-button transition-all flex items-center gap-1 text-xs ${
                  isListening 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.4)]' 
                    : 'text-slate-400 hover:text-cyan-300'
                }`}
                title={isListening ? t('voice_listening', '聆聽中...') : t('voice_input', '語音輸入')}
              >
                {isListening ? (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline text-[11px]">{isListening ? t('voice_listening', '聆聽中...') : t('voice_input', '語音輸入')}</span>
              </button>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono ml-1">
                <span>{inputText.length} {t('characters', '字元')}</span>
                <span>•</span>
                <span className="hidden md:inline">{t('dual_mode_active', '全能雙模 Tool-Calling & ReAct 已啟用')}</span>
              </div>
            </div>

            {isStreaming ? (
              <button
                onClick={onStopGeneration}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t('stop_generation', '停止生成')}</span>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!inputText.trim()}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                  inputText.trim()
                    ? 'glass-button-primary text-white shadow-[0_0_15px_rgba(0,242,254,0.3)]'
                    : 'bg-white/[0.04] text-slate-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('send', '發送')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
export default ChatView;
