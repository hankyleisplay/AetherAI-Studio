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
  Target,
  Image as ImageIcon
} from 'lucide-react';
import { Message, AgentState, Persona } from '../types';
import { MessageItem } from './MessageItem';
import { useI18n } from '../i18n/I18nContext';

export interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  base64: string;
  size: number;
}

interface ChatViewProps {
  messages: Message[];
  agentState: AgentState;
  onSendMessage: (text: string, images?: string[]) => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  onBookmarkToggle?: (messageId: string) => void;
  temperature?: number;
  onTemperatureChange?: (temp: number) => void;
  personas?: Persona[];
  activePersona?: Persona;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  agentState,
  onSendMessage,
  onStopGeneration,
  isStreaming,
  onBookmarkToggle,
  temperature = 0.7,
  onTemperatureChange,
  personas = [],
  activePersona
}) => {
  const { t, currentLang } = useI18n();
  const [inputText, setInputText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
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

      const baseText = inputText;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }
        const spoken = (finalTranscript + interimTranscript).trim();
        if (spoken) {
          setInputText(baseText.trim() ? `${baseText.trim()} ${spoken}` : spoken);
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

  const processImageFile = (file: File, fallbackName?: string) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '');
      const newImg: AttachedImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name || fallbackName || 'image.png',
        dataUrl,
        base64,
        size: file.size
      };
      setAttachedImages(prev => [...prev, newImg]);
    };
    reader.readAsDataURL(file);
    // Background upload so workspace tools have the physical file available
    handleFileUpload(file);
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          processImageFile(file, `pasted_image_${timestamp}.png`);
        }
      }
    }
  };

  useEffect(() => {
    const onGlobalPaste = (e: ClipboardEvent) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            processImageFile(file, `pasted_image_${timestamp}.png`);
          }
        }
      }
    };
    window.addEventListener('paste', onGlobalPaste);
    return () => window.removeEventListener('paste', onGlobalPaste);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
          processImageFile(file);
        } else {
          handleFileUpload(file);
        }
      }
    }
  };

  const userScrolledUpRef = useRef(false);
  const prevScrollTopRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  // Direct wheel & touch listeners to immediately detect upward user scroll intent
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      // If user wheels UP (deltaY < 0), immediately lock auto-scroll to allow reading!
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
        setShowScrollBottom(true);
      } else if (e.deltaY > 0) {
        // Wheeling down: if reaching near bottom, unlock auto-scroll
        const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distFromBottom < 40) {
          userScrolledUpRef.current = false;
          setShowScrollBottom(false);
        }
      }
    };

    const onTouchMove = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom > 60) {
        userScrolledUpRef.current = true;
        setShowScrollBottom(true);
      } else {
        userScrolledUpRef.current = false;
        setShowScrollBottom(false);
      }
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const scrollToBottom = (smooth = true) => {
    if (!scrollContainerRef.current) return;
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    isAutoScrollingRef.current = true;
    if (smooth) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 400);
    } else {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      isAutoScrollingRef.current = false;
    }
  };

  useEffect(() => {
    if (!scrollContainerRef.current) return;

    if (isStreaming) {
      // If user has intentionally scrolled up to read, DO NOT force auto-scroll down!
      if (userScrolledUpRef.current) return;

      isAutoScrollingRef.current = true;
      const now = performance.now();
      if (now - lastScrollTimeRef.current > 60) {
        lastScrollTimeRef.current = now;
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        isAutoScrollingRef.current = false;
      } else if (!scrollRafRef.current) {
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null;
          if (scrollContainerRef.current && !userScrolledUpRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            lastScrollTimeRef.current = performance.now();
          }
          isAutoScrollingRef.current = false;
        });
      }
    } else {
      // When not streaming, smoothly scroll to bottom only if user hasn't explicitly scrolled up
      if (!userScrolledUpRef.current) {
        scrollToBottom(true);
      }
    }

    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;

    if (!isAutoScrollingRef.current) {
      if (scrollTop < prevScrollTopRef.current - 15) {
        // User scrolled upward
        userScrolledUpRef.current = true;
      }
    }
    prevScrollTopRef.current = scrollTop;

    if (distFromBottom > 60) {
      setShowScrollBottom(true);
    } else {
      userScrolledUpRef.current = false;
      setShowScrollBottom(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isStreaming) return;
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    setTimeout(() => scrollToBottom(true), 50);
    const trimmedInput = inputText.trim();
    const imagesPayload = attachedImages.map(img => img.base64);

    // If there is an uploaded file attached
    if (uploadedFile) {
      let finalMessage = '';
      if (!trimmedInput) {
        finalMessage = `請幫我分析工作區檔案 ${uploadedFile.path} (${uploadedFile.name}) 的內容與重點摘要。`;
      } else {
        // If user typed custom instructions without the path/name, explicitly append the attached file
        if (!trimmedInput.includes(uploadedFile.path) && !trimmedInput.includes(uploadedFile.name)) {
          finalMessage = `${trimmedInput}\n\n[附加工作區檔案: ${uploadedFile.path} (${uploadedFile.name})]`;
        } else {
          finalMessage = trimmedInput;
        }
      }
      onSendMessage(finalMessage, imagesPayload.length > 0 ? imagesPayload : undefined);
      setInputText('');
      setUploadedFile(null);
      setAttachedImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    if (!trimmedInput && imagesPayload.length === 0) return;
    const msgToSend = trimmedInput || (imagesPayload.length > 0 ? "請詳細分析此圖片並說明其內容、文字與關鍵細節。" : "");
    onSendMessage(msgToSend, imagesPayload.length > 0 ? imagesPayload : undefined);
    setInputText('');
    setAttachedImages([]);
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
              {t('brand_name', 'Aether AI Studio 3.0')} ({t('brand_subtitle', 'AetherAgent 企業級自主系統')})
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
              persona={personas.find(p => p.id === m.persona_id) || activePersona}
              agentState={isStreaming && idx === messages.length - 1 ? agentState : undefined}
            />
          ))
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-28 right-6 md:right-10 px-3.5 py-2 rounded-full glass-panel border border-cyan-400/40 text-cyan-300 hover:text-white hover:bg-cyan-500/20 shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 z-30 group backdrop-blur-xl bg-black/60"
          title={t('scroll_to_bottom', '滑至最底部')}
        >
          <div className="p-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 group-hover:bg-cyan-500/30 transition-all">
            <ArrowDown className="w-3.5 h-3.5 text-cyan-300 group-hover:translate-y-0.5 transition-transform" />
          </div>
          {isStreaming ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold pr-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span className="text-cyan-200">{t('streaming_generating', 'AI 生成中 (點擊回到底部)')}</span>
            </span>
          ) : (
            <span className="text-xs font-semibold pr-1 text-slate-200">{t('scroll_to_bottom', '回到底部')}</span>
          )}
        </button>
      )}

      {/* Reasoning Tuning Capsule & Chat Input Dock */}
      <div className="p-3 md:p-5 max-w-4xl w-full mx-auto space-y-2">
        
        {/* Inline Reasoning Temperature Capsule */}
        {onTemperatureChange && (
          <div className="flex items-center justify-between px-2 text-xs gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 text-slate-400 whitespace-nowrap shrink-0">
              <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-medium">{t('reasoning_tuning', '推論調優')}:</span>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5 backdrop-blur-md shrink-0">
              {/* Precise (0.2) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(0.2)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  temperature <= 0.3
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_precise_desc', '低隨機度 (0.2)，適合代碼架構、數學證明、嚴格邏輯')}
              >
                <Target className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>{t('reasoning_precise', '精確嚴謹 (0.2)')}</span>
              </button>

              {/* Balanced (0.7) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(0.7)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  temperature > 0.3 && temperature <= 0.8
                    ? 'bg-blue-500/25 text-blue-200 border border-blue-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_balanced_desc', '均衡隨機度 (0.7)，適合綜合問答、系統工程、文檔解析')}
              >
                <Compass className="w-3 h-3 text-blue-400 shrink-0" />
                <span>{t('reasoning_balanced', '標準平衡 (0.7)')}</span>
              </button>

              {/* Creative (1.1) */}
              <button
                type="button"
                onClick={() => onTemperatureChange(1.1)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  temperature > 0.8
                    ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('reasoning_creative_desc', '高隨機度 (1.1)，適合頭腦風暴、靈感探索、方案發散')}
              >
                <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
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
            multiple
            accept="image/*,.txt,.md,.py,.js,.ts,.json,.csv,.pdf,.html,.css"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                for (let i = 0; i < e.target.files.length; i++) {
                  const file = e.target.files[i];
                  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
                    processImageFile(file);
                  } else {
                    handleFileUpload(file);
                  }
                }
                e.target.value = '';
              }
            }}
          />

          {/* Uploaded File Chip */}
          {uploadedFile && (
            <div className="mb-2.5 flex items-center justify-between gap-2 p-2 px-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-xs text-cyan-100 shadow-[0_0_12px_rgba(0,242,254,0.15)] w-full max-w-md backdrop-blur-md">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/30 flex items-center justify-center shrink-0 border border-cyan-400/30">
                  <FileText className="w-3.5 h-3.5 text-cyan-300" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-white truncate">{uploadedFile.name}</span>
                  <span className="text-[10px] text-cyan-300/80 font-mono truncate">{uploadedFile.path} (工作區已掛載)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadedFile(null)}
                className="hover:text-rose-300 text-slate-400 p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                title="移除附加檔案"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Attached Images Thumbnail Preview Dock */}
          {attachedImages.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5 p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md">
              {attachedImages.map((img, idx) => (
                <div 
                  key={img.id}
                  className="relative group rounded-xl overflow-hidden border border-cyan-400/40 shadow-md bg-black/50 w-20 h-20 shrink-0 transition-transform hover:scale-[1.03]"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1 opacity-90 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => removeAttachedImage(idx)}
                      className="self-end p-1 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white shadow transition-all hover:scale-110"
                      title="移除此圖片"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    <span className="text-[9px] text-cyan-200 truncate font-mono px-1 pb-0.5" title={img.name}>
                      {img.name}
                    </span>
                  </div>
                </div>
              ))}
              <div className="text-[11px] text-cyan-300/90 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/20 font-mono">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span>{attachedImages.length} 張圖片已載入視覺辨識</span>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInputResize}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              attachedImages.length > 0
                ? `已附加 ${attachedImages.length} 張視覺圖像，可直接按 Enter 發送進行多模態/OCR深度分析...`
                : uploadedFile 
                  ? `已附加「${uploadedFile.name}」，直接按 Enter 發送或輸入自訂分析要求...`
                  : t('chat_placeholder', '請輸入指令或問題... (支援 Ctrl+V 貼上或拖曳圖片/代碼至此，Enter 發送)')
            }
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
                disabled={!inputText.trim() && !uploadedFile && attachedImages.length === 0}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                  (inputText.trim() || uploadedFile || attachedImages.length > 0)
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
