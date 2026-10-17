import React, { useState, useRef } from 'react';
import { 
  Users, Sparkles, MessageSquare, RotateCw, X, Play, 
  Copy, Check, Send, Code2, Search, Terminal
} from 'lucide-react';
import { Persona, SwarmTurn, ModelConfig } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { MarkdownRenderer } from './markdown/MarkdownRenderer';

interface SwarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  personas: Persona[];
  onApplyToChat: (summaryText: string) => void;
  modelConfig?: ModelConfig;
}

interface SwarmTurnCardProps {
  turn: SwarmTurn;
  isCurrent: boolean;
}

const SwarmTurnCard: React.FC<SwarmTurnCardProps> = React.memo(({ turn, isCurrent }) => {
  const { t } = useI18n();
  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 shadow-lg relative space-y-2">
      {/* Speaker Tag */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-slate-300">
            {t('swarm_round_label', '輪次')} {turn.round}
          </span>
          <span className="text-xs font-bold text-cyan-300">
            {t(`persona_${turn.persona_id}_name`, turn.persona_name)}
          </span>
        </div>
      </div>

      {/* Turn Markdown Content */}
      <div className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
        <MarkdownRenderer content={turn.content || '...'} isStreaming={isCurrent} />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.turn.content === nextProps.turn.content && prevProps.isCurrent === nextProps.isCurrent;
});

export const SwarmModal: React.FC<SwarmModalProps> = ({
  isOpen,
  onClose,
  personas,
  onApplyToChat,
  modelConfig
}) => {
  const { t } = useI18n();
  const [topic, setTopic] = useState<string>('');
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(['assistant', 'coder', 'researcher']);
  const [rounds, setRounds] = useState<number>(1);
  const [isDebating, setIsDebating] = useState<boolean>(false);
  const [turns, setTurns] = useState<SwarmTurn[]>([]);
  const [consensusSummary, setConsensusSummary] = useState<string>('');
  const [currentSpeaker, setCurrentSpeaker] = useState<{ id: string; name: string; icon: string; round: number } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const throttleScrollToBottom = () => {
    const now = Date.now();
    if (now - lastScrollTimeRef.current > 120) {
      lastScrollTimeRef.current = now;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  };

  if (!isOpen) return null;

  const presets = [
    t('swarm_preset_1', '微服務架構 vs 模組化單體：大型系統重構的得失抉擇'),
    t('swarm_preset_2', '高並發分佈式交易系統的零停機容災與資料一致性方案'),
    t('swarm_preset_3', '企業私有化大模型落地：量化推論 vs 專用微調的資源分配')
  ];

  const handleTogglePersona = (id: string) => {
    if (selectedPersonaIds.includes(id)) {
      if (selectedPersonaIds.length > 2) {
        setSelectedPersonaIds(prev => prev.filter(p => p !== id));
      } else {
        alert(t('swarm_min_personas_alert', '請至少保留 2 位與會專家以進行交叉論辯。'));
      }
    } else {
      setSelectedPersonaIds(prev => [...prev, id]);
    }
  };

  const getPersonaIcon = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case 'code2':
      case 'code':
        return <Code2 className="w-4 h-4 text-cyan-400" />;
      case 'search':
        return <Search className="w-4 h-4 text-emerald-400" />;
      case 'terminal':
        return <Terminal className="w-4 h-4 text-amber-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-blue-400" />;
    }
  };

  const handleStartDebate = async () => {
    if (!topic.trim()) {
      alert(t('swarm_empty_topic_alert', '請輸入或選擇論辯研討核心議題。'));
      return;
    }
    if (selectedPersonaIds.length < 2) {
      alert(t('swarm_min_personas_alert', '請至少保留 2 位與會專家以進行交叉論辯。'));
      return;
    }

    setIsDebating(true);
    setTurns([]);
    setConsensusSummary('');
    setCurrentSpeaker(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          personas: selectedPersonaIds,
          rounds: rounds,
          model_config_override: modelConfig
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      let activeSpeaker: { id: string; name: string; icon: string; round: number } | null = null;
      let isSummaryPhase = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.substring(7).trim();
          } else if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.substring(6).trim();
            try {
              const data = JSON.parse(jsonStr);

              if (currentEvent === 'swarm_turn_start') {
                isSummaryPhase = false;
                activeSpeaker = {
                  id: data.persona_id,
                  name: data.persona_name,
                  icon: data.persona_icon || 'Sparkles',
                  round: data.round
                };
                setCurrentSpeaker(activeSpeaker);
                setTurns(prev => [
                  ...prev,
                  {
                    round: data.round,
                    persona_id: data.persona_id,
                    persona_name: data.persona_name,
                    persona_icon: data.persona_icon,
                    content: ''
                  }
                ]);
              } else if (currentEvent === 'token') {
                if (isSummaryPhase) {
                  setConsensusSummary(prev => prev + (data.content || ''));
                } else if (activeSpeaker) {
                  setTurns(prev => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx < 0) return prev;
                    const updated = [...prev];
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + (data.content || '')
                    };
                    return updated;
                  });
                }
              } else if (currentEvent === 'error' || data.type === 'error') {
                const errMsg = `\n\n❌ **${t('status_error', '異常中斷')}**: ${data.error || 'Unknown error'}`;
                if (isSummaryPhase) {
                  setConsensusSummary(prev => prev + errMsg);
                } else {
                  setTurns(prev => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx < 0) return prev;
                    const updated = [...prev];
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + errMsg
                    };
                    return updated;
                  });
                }
              } else if (currentEvent === 'swarm_turn_done') {
                // Done with current turn
              } else if (currentEvent === 'swarm_summary_start') {
                isSummaryPhase = true;
                setCurrentSpeaker(null);
              } else if (currentEvent === 'swarm_done') {
                setIsDebating(false);
                setCurrentSpeaker(null);
              }
            } catch (err) {
              console.error('SSE JSON error:', err, jsonStr);
            }
          }
        }
        throttleScrollToBottom();
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert(`${t('status_error', '異常中斷')}: ${err.message}`);
      }
    } finally {
      setIsDebating(false);
      setCurrentSpeaker(null);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsDebating(false);
    setCurrentSpeaker(null);
  };

  const handleCopyTranscript = () => {
    let full = `# ${t('swarm_title', '多智能體協同論壇 & 深度交鋒沙盤')}: ${topic}\n\n`;
    for (const turn of turns) {
      const speakerLabel = t(`persona_${turn.persona_id}_name`, turn.persona_name);
      full += `### [${t('swarm_round_label', '輪次')} ${turn.round}] ${speakerLabel}\n${turn.content}\n\n---\n\n`;
    }
    if (consensusSummary) {
      full += `## 🌟 ${t('swarm_consensus_title', 'Aether 智庫綜合共識與實施藍圖')}\n${consensusSummary}\n`;
    }
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    let full = `【${t('swarm_consensus_title', 'Aether 智庫綜合共識與實施藍圖')}】\n${t('swarm_topic_label', '辯論研討核心議題')}: ${topic}\n\n${consensusSummary || ''}`;
    onApplyToChat(full);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-lg animate-fade-in text-slate-100">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0b101d] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white flex items-center gap-2">
                {t('swarm_title', '多智能體協同論壇 & 深度交鋒沙盤')}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Swarm Mode
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {t('swarm_subtitle', '集結首席架構師、技術研究員、SRE 專家進行多輪技術研討與方案綜整')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDebating}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Topic & Configuration Setup */}
          <div className="space-y-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            {/* Topic Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('swarm_topic_label', '辯論研討核心議題')}
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isDebating}
                rows={2}
                placeholder={t('swarm_topic_placeholder', '輸入需要多位智能體專家辯論的工程技術難題...')}
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-black/40 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none"
              />
            </div>

            {/* Quick Presets */}
            {!isDebating && (
              <div className="flex flex-wrap gap-2">
                {presets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setTopic(preset)}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 text-slate-300 hover:text-cyan-300 transition-all text-left"
                  >
                    💡 {preset}
                  </button>
                ))}
              </div>
            )}

            {/* Persona Panel Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('swarm_select_personas', '挑選與會專家陣容 (至少 2 位)')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {personas.map((p) => {
                  const isSelected = selectedPersonaIds.includes(p.id);
                  const displayName = t(`persona_${p.id}_name`, p.name);
                  const displayDesc = t(`persona_${p.id}_desc`, p.description);
                  return (
                    <div
                      key={p.id}
                      onClick={() => !isDebating && handleTogglePersona(p.id)}
                      title={`${displayName}\n${displayDesc}`}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-sm'
                          : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05]'
                      } ${isDebating ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="p-1 rounded-lg bg-black/30 shrink-0">
                        {getPersonaIcon(p.icon)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{displayName}</p>
                        <p className="text-[10px] text-slate-500 truncate">{p.id}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rounds Selector & Action Button */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>{t('swarm_rounds', '辯論交鋒輪次')}:</span>
                {[1, 2, 3].map((r) => (
                  <button
                    key={r}
                    onClick={() => !isDebating && setRounds(r)}
                    disabled={isDebating}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold border transition-all ${
                      rounds === r
                        ? 'bg-cyan-500 text-black border-cyan-400'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {isDebating ? (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/30 transition-all whitespace-nowrap"
                  >
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-red-400" />
                    {t('swarm_stop_btn', '停止論辯')}
                  </button>
                ) : (
                  <button
                    onClick={handleStartDebate}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-semibold text-xs shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition-all whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    {t('swarm_start_btn', '開始圓桌論辯')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Transcript Display */}
          {turns.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {t('swarm_live_transcript', '即時交鋒對話流 (Roundtable Transcript)')}
                </h4>
                {currentSpeaker && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-300 font-mono animate-pulse">
                    <RotateCw className="w-3 h-3 animate-spin" />
                    {t(`persona_${currentSpeaker.id}_name`, currentSpeaker.name)} {t('swarm_speaking', '正在發言中...')}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {turns.map((turn, idx) => (
                  <SwarmTurnCard
                    key={`${turn.round}-${turn.persona_id}-${idx}`}
                    turn={turn}
                    isCurrent={idx === turns.length - 1 && isDebating}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Consensus Summary Block */}
          {consensusSummary && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-blue-950/30 to-[#0b101d] border border-cyan-500/40 shadow-xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  {t('swarm_consensus_title', 'Aether 智庫綜合共識與實施藍圖')}
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyTranscript}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors whitespace-nowrap"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? t('copied', '已複製') : t('copy', '複製')}
                  </button>
                  <button
                    onClick={handleApply}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {t('swarm_export_to_chat', '將共識注入當前對話')}
                  </button>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                <MarkdownRenderer content={consensusSummary} isStreaming={isDebating} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
