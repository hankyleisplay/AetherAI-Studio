import React, { useState, useEffect, useRef } from 'react';
import { LiquidBackground } from './components/LiquidBackground';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { PersonaModal } from './components/PersonaModal';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { SwarmModal } from './components/SwarmModal';
import { InteractiveTerminal } from './components/InteractiveTerminal';
import { ProjectModal } from './components/ProjectModal';
import { PinLockModal } from './components/PinLockModal';
import { Session, Message, Persona, ModelConfig, ToolDefinition, AgentState, ToolCall, CodeExecutionMode } from './types';
import { useI18n } from './i18n/I18nContext';

export const App: React.FC = () => {
  const { t, currentLang } = useI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('assistant');
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'model' | 'telegram' | 'tools'>('model');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState<boolean>(false);
  const [isWorkspaceDrawerOpen, setIsWorkspaceDrawerOpen] = useState<boolean>(false);
  const [isSwarmModalOpen, setIsSwarmModalOpen] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('aether_access_token');
      const res = await fetch('/api/auth/status', {
        headers: token ? { 'x-access-token': token } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pin_protected && !data.authenticated) {
          setIsPinModalOpen(true);
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Code Mode & Projects state
  const [mode, setMode] = useState<'chat' | 'code'>(() => {
    try {
      return (localStorage.getItem('aether_mode') as 'chat' | 'code') || 'chat';
    } catch {
      return 'chat';
    }
  });
  const [codeExecutionMode, setCodeExecutionMode] = useState<CodeExecutionMode>(() => {
    try {
      return (localStorage.getItem('aether_code_exec_mode') as CodeExecutionMode) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const handleSetCodeExecutionMode = (m: CodeExecutionMode) => {
    setCodeExecutionMode(m);
    try {
      localStorage.setItem('aether_code_exec_mode', m);
    } catch {}
  };
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setActiveProject(data.active_project || null);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Hardware-saving Eco Mode state (can be triggered by URL ?eco=1 or localStorage)
  const [isEcoMode, setIsEcoMode] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('eco') === '1' || params.get('low_spec') === '1') {
        return true;
      }
      return localStorage.getItem('aether_eco_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isEcoMode) {
        document.documentElement.classList.add('eco-mode');
        document.documentElement.classList.add('low-spec');
        localStorage.setItem('aether_eco_mode', 'true');
      } else {
        document.documentElement.classList.remove('eco-mode');
        document.documentElement.classList.remove('low-spec');
        localStorage.setItem('aether_eco_mode', 'false');
      }
    } catch (e) {
      console.error('Failed to sync eco mode:', e);
    }
  }, [isEcoMode]);

  const handleToggleEcoMode = () => {
    setIsEcoMode(prev => !prev);
  };

  const handleOpenSettings = (tab: 'model' | 'telegram' | 'tools' = 'model') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'ollama',
    base_url: 'http://localhost:11434',
    model: '',
    temperature: 0.7,
    max_tokens: 8192,
    context_window: 16384
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isProbingModels, setIsProbingModels] = useState<boolean>(false);
  const [bookmarkVersion, setBookmarkVersion] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const streamingSessionIdRef = useRef<string | null>(null);
  const tokenBufferRef = useRef<{ [msgId: string]: string }>({});
  const tokenRafRef = useRef<number | null>(null);
  const thoughtBufferRef = useRef<{ [msgId: string]: string }>({});
  const lastFlushRef = useRef<number>(0);
  // Re-parsing the whole markdown message on every animation frame starves the main thread on long
  // answers; ~12 UI updates per second still looks live while keeping the stream reader responsive.
  const FLUSH_INTERVAL_MS = 80;
  const scheduleFlush = () => {
    if (tokenRafRef.current) return;
    const wait = Math.max(0, FLUSH_INTERVAL_MS - (performance.now() - lastFlushRef.current));
    tokenRafRef.current = window.setTimeout(() => {
      tokenRafRef.current = null;
      flushTokenBuffer();
    }, wait);
  };
  const cancelScheduledFlush = () => {
    if (tokenRafRef.current) {
      clearTimeout(tokenRafRef.current);
      tokenRafRef.current = null;
    }
  };
  const streamStartTimeRef = useRef<number>(0);
  const firstTokenTimeRef = useRef<number | null>(null);
  const streamTokenCountRef = useRef<number>(0);

  const flushTokenBuffer = () => {
    const buffers = tokenBufferRef.current;
    const thoughtBuffers = thoughtBufferRef.current;
    if (Object.keys(buffers).length === 0 && Object.keys(thoughtBuffers).length === 0) return;

    const copy = { ...buffers };
    const thoughtCopy = { ...thoughtBuffers };
    tokenBufferRef.current = {};
    thoughtBufferRef.current = {};
    lastFlushRef.current = performance.now();

    setMessages(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (thoughtCopy[m.id] && !copy[m.id]) {
          changed = true;
          return {
            ...m,
            thought: (m.thought || '') + thoughtCopy[m.id],
            status_text: m.status_text || t('slogan_thinking', '正在深度推理與分析問題架構...')
          };
        }
        if (copy[m.id]) {
          changed = true;
          if (thoughtCopy[m.id]) {
            m = { ...m, thought: (m.thought || '') + thoughtCopy[m.id] };
          }
          const elapsed = Math.max(0.01, (performance.now() - streamStartTimeRef.current) / 1000);
          const tps = streamTokenCountRef.current / elapsed;
          const ttft = firstTokenTimeRef.current ? Math.round(firstTokenTimeRef.current - streamStartTimeRef.current) : undefined;
          return { 
            ...m, 
            content: m.content + copy[m.id],
            telemetry: {
              tokens: streamTokenCountRef.current,
              duration_s: Number(elapsed.toFixed(2)),
              tokens_per_second: Number(tps.toFixed(1)),
              ttft_ms: ttft,
              temperature: modelConfig.temperature,
              model: modelConfig.model
            }
          };
        }
        return m;
      });
      return changed ? next : prev;
    });
  };

  // Initial Fetching
  useEffect(() => {
    fetchActiveModel();
    fetchTools();
    fetchPersonas();
    fetchSessions();
  }, []);

  // Fetch session messages when activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      if (streamingSessionIdRef.current === activeSessionId) {
        // Session ID was assigned by the active stream, do not wipe live streaming messages
        streamingSessionIdRef.current = null;
        return;
      }
      if (isStreamingRef.current) {
        // Never wipe messages while streaming is actively running
        return;
      }
      fetchSessionMessages(activeSessionId);
    } else {
      if (!isStreamingRef.current) {
        setMessages([]);
      }
    }
  }, [activeSessionId]);

  const probeAvailableModels = async (configToProbe: ModelConfig) => {
    setIsProbingModels(true);
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToProbe)
      });
      if (res.ok) {
        const data = await res.json();
        const detected: string[] = Array.isArray(data.models) ? data.models : [];
        setAvailableModels(detected);
        if (detected.length > 0) {
          // If the endpoint is live and current model is not in detected list, auto-select the first available model
          if (data.success && (!configToProbe.model || !detected.includes(configToProbe.model))) {
            const updatedConfig = { ...configToProbe, model: detected[0] };
            setModelConfig(updatedConfig);
            await fetch('/api/models/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedConfig)
            });
          }
        } else {
          // No models detected - clear fake or nonexistent model
          if (configToProbe.model && ['ollama', 'lm_studio', 'openai_compatible'].includes(configToProbe.provider)) {
            const updatedConfig = { ...configToProbe, model: '' };
            setModelConfig(updatedConfig);
            await fetch('/api/models/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedConfig)
            });
          }
        }
      } else {
        setAvailableModels([]);
      }
    } catch (e) {
      console.error('Failed to auto-probe models:', e);
      setAvailableModels([]);
    } finally {
      setIsProbingModels(false);
    }
  };

  const fetchActiveModel = async () => {
    try {
      const res = await fetch('/api/models/active');
      if (res.ok) {
        const data = await res.json();
        setModelConfig(data);
        probeAvailableModels(data);
      } else {
        probeAvailableModels(modelConfig);
      }
    } catch (e) {
      console.error('Failed to load active model:', e);
      probeAvailableModels(modelConfig);
    }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/tools');
      if (res.ok) {
        const data = await res.json();
        setTools(data);
      }
    } catch (e) {
      console.error('Failed to load tools:', e);
    }
  };

  const fetchPersonas = async () => {
    try {
      const res = await fetch('/api/personas');
      if (res.ok) {
        const data = await res.json();
        setPersonas(data);
      }
    } catch (e) {
      console.error('Failed to load personas:', e);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !activeSessionId) {
          setActiveSessionId(data[0].id);
          if (data[0].persona_id) {
            setSelectedPersonaId(data[0].persona_id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const fetchSessionMessages = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.session?.persona_id) {
          setSelectedPersonaId(data.session.persona_id);
        }
      }
    } catch (e) {
      console.error('Failed to load session messages:', e);
    }
  };

  const handleToggleTool = async (name: string, enabled: boolean) => {
    try {
      await fetch(`/api/tools/${name}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      setTools(prev => prev.map(t => t.name === name ? { ...t, enabled } : t));
    } catch (e) {
      console.error('Failed to toggle tool:', e);
    }
  };

  const handleSaveModelConfig = async (newConfig: ModelConfig) => {
    try {
      await fetch('/api/models/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const endpointChanged = newConfig.provider !== modelConfig.provider || newConfig.base_url !== modelConfig.base_url;
      setModelConfig(newConfig);
      if (endpointChanged) {
        probeAvailableModels(newConfig);
      } else if (newConfig.model && !availableModels.includes(newConfig.model)) {
        setAvailableModels(prev => [newConfig.model, ...prev]);
      }
    } catch (e) {
      console.error('Failed to save model config:', e);
    }
  };

  const handleQuickSelectModel = async (modelName: string) => {
    const updated = { ...modelConfig, model: modelName };
    await handleSaveModelConfig(updated);
  };

  const handleSavePersona = async (newPersona: Persona) => {
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPersona)
      });
      if (res.ok) {
        setPersonas(prev => {
          const exists = prev.some(p => p.id === newPersona.id);
          return exists ? prev.map(p => p.id === newPersona.id ? newPersona : p) : [...prev, newPersona];
        });
        setSelectedPersonaId(newPersona.id);
      }
    } catch (e) {
      console.error('Failed to save persona:', e);
    }
  };

  const handleDeletePersona = async (personaId: string) => {
    try {
      const res = await fetch(`/api/personas/${personaId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setPersonas(prev => prev.filter(p => p.id !== personaId));
        if (selectedPersonaId === personaId) {
          setSelectedPersonaId('assistant');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || t('delete_persona_failed', '刪除角色失敗'));
      }
    } catch (e) {
      console.error('Failed to delete persona:', e);
      alert(t('delete_persona_failed', '刪除角色失敗'));
    }
  };

  const handleExportSession = () => {
    if (!activeSessionId) {
      alert(t('alert_no_session', '請先在左側選取或開啟一個對話會話，方可匯出 Markdown。'));
      return;
    }
    if (messages.length === 0) {
      alert(t('alert_empty_session', '當前會話尚無任何對話訊息可供匯出。'));
      return;
    }
    window.open(`/api/sessions/${activeSessionId}/export?format=markdown`, '_blank');
  };

  const handleBookmarkToggle = async (messageId: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/bookmark`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_bookmarked: data.is_bookmarked } : m));
        setBookmarkVersion(v => v + 1);
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  const handleSelectBookmark = (sessionId: string, messageId: string) => {
    if (activeSessionId !== sessionId) {
      setActiveSessionId(sessionId);
    }
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-amber-400', 'shadow-[0_0_25px_rgba(251,191,36,0.4)]');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-amber-400', 'shadow-[0_0_25px_rgba(251,191,36,0.4)]');
        }, 2500);
      }
    }, 300);
  };

  const handleTemperatureChange = async (temp: number) => {
    const updated = { ...modelConfig, temperature: temp };
    setModelConfig(updated);
    try {
      await fetch('/api/models/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Failed to persist temperature:', err);
    }
  };

  const handleAskAgent = (filePath: string) => {
    handleSendMessage(t('prompt_deep_analyze_file', '請深入分析並解讀工作區檔案 {path} 的架構、核心邏輯與技術細節。', { path: filePath }));
  };

  const handleApplySwarm = (summaryText: string) => {
    handleSendMessage(summaryText);
  };

  const handleSelectPersona = async (id: string) => {
    setSelectedPersonaId(id);
    if (activeSessionId) {
      try {
        await fetch(`/api/sessions/${activeSessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona_id: id })
        });
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, persona_id: id } : s));
      } catch (e) {
        console.error('Failed to update session persona:', e);
      }
    }
  };

  const handleNewSession = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t('new_session', '開啟新對話'), persona_id: selectedPersonaId })
      });
      if (res.ok) {
        const newSess = await res.json();
        setSessions(prev => [newSess, ...prev]);
        setActiveSessionId(newSess.id);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter(s => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleStopGeneration = () => {
    const sessionId = streamingSessionIdRef.current || activeSessionId;
    if (mode === 'code' && sessionId && abortControllerRef.current) {
      const controller = abortControllerRef.current;
      fetch(`/api/code/stop/${sessionId}`, { method: 'POST' }).catch(() => {});
      // The agent finishes the current step and saves; abort only if it hasn't ended shortly after
      window.setTimeout(() => {
        if (abortControllerRef.current === controller) {
          controller.abort();
          abortControllerRef.current = null;
        }
      }, 4000);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    setIsStreaming(false);
    setAgentState('idle');
  };

  const handleEditPrompt = async (messageId: string, newContent: string) => {
    if (!newContent.trim()) return;

    // If currently streaming, stop active generation cleanly first
    if (isStreamingRef.current) {
      handleStopGeneration();
    }

    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return;

    const originalMsg = messages[msgIdx];
    const originalImages = originalMsg?.images;

    // Collect all subsequent messages (including preceding assistant reply) to delete
    const idsToDelete: string[] = [];
    for (let i = msgIdx + 1; i < messages.length; i++) {
      if (messages[i]?.id) {
        idsToDelete.push(messages[i].id);
      }
    }
    // Delete the original user message as well
    if (messageId) {
      idsToDelete.push(messageId);
    }

    // Delete from backend DB
    if (idsToDelete.length > 0) {
      await Promise.allSettled(
        idsToDelete.map(id => fetch(`/api/messages/${id}`, { method: 'DELETE' }))
      );
    }

    // Slice local messages state
    setMessages(prev => prev.slice(0, msgIdx));

    // Re-send revised prompt
    await handleSendMessage(newContent, originalImages);
  };

  const handleSendMessage = async (text: string, images?: string[]) => {
    if ((!text.trim() && (!images || images.length === 0)) || isStreamingRef.current) return;

    // Generate robust UUIDs for both messages
    const userMsgId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const assistantMsgId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `asst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Add User Message immediately
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      images: images,
      created_at: new Date().toISOString()
    };

    // Check if model is selected/available
    let effectiveModelConfig = modelConfig;
    if (!effectiveModelConfig.model || !effectiveModelConfig.model.trim()) {
      if (availableModels.length > 0) {
        effectiveModelConfig = { ...effectiveModelConfig, model: availableModels[0] };
        setModelConfig(effectiveModelConfig);
      } else {
        // No models detected/installed
        const noModelMsg: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: t('no_model_message', '❌ **未偵測到可用的 AI 模型**\n\n目前本機尚未安裝或載入任何 AI 模型：\n- 若使用 **Ollama**：請在終端機執行 `ollama pull llama3` 或 `ollama pull qwen2.5:7b` 下載模型。\n- 若使用 **LM Studio** 或 **OpenAI 相容端點**：請確認本地伺服器已啟動並載入模型。\n- 若使用 **雲端 API**（Gemini / OpenAI / Anthropic / DeepSeek）：請點擊右上角設定圖示填入 API Key。'),
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMsg, noModelMsg]);
        return;
      }
    }

    // Prepare Assistant Message container with initial status and persona attribution
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      tool_calls: [],
      persona_id: selectedPersonaId,
      status_text: t('slogan_thinking', '正在深度推理與分析問題架構...'),
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    isStreamingRef.current = true;
    setIsStreaming(true);
    setAgentState('thinking');
    streamStartTimeRef.current = performance.now();
    firstTokenTimeRef.current = null;
    streamTokenCountRef.current = 0;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          persona_id: selectedPersonaId,
          model_config_override: effectiveModelConfig,
          user_message_id: userMsgId,
          assistant_message_id: assistantMsgId,
          images: images,
          mode: mode,
          project: activeProject,
          code_execution_mode: codeExecutionMode,
          language: currentLang
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      // Persist across reads: an `event:` line and its `data:` line can arrive in different chunks
      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = 'message';
            continue;
          }

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.substring(7).trim();
          } else if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.substring(6).trim();
            try {
              const data = JSON.parse(jsonStr);

              if (currentEvent === 'session_info' || data.type === 'session_info') {
                if (data.session_id && data.session_id !== activeSessionId) {
                  streamingSessionIdRef.current = data.session_id;
                  setActiveSessionId(data.session_id);
                  fetchSessions();
                }
                if (data.user_message_id) {
                  setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, id: data.user_message_id } : m));
                }
              } else if (currentEvent === 'session_title' || data.type === 'session_title') {
                if (data.session_id && data.title) {
                  setSessions(prev => prev.map(s => s.id === data.session_id ? { ...s, title: data.title } : s));
                }
              } else if (currentEvent === 'status' || data.type === 'status') {
                if (data.stage) setAgentState(data.stage);
                if (data.text) {
                  const statusText = data.key ? t(data.key, data.text, data.params) : data.text;
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, status_text: statusText } : m));
                }
              } else if (currentEvent === 'thought' || data.type === 'thought') {
                setAgentState('thinking');
                // Thought tokens arrive as fast as content tokens; batch them the same way
                thoughtBufferRef.current[assistantMsgId] = (thoughtBufferRef.current[assistantMsgId] || '') + (data.content || '');
                scheduleFlush();
              } else if (currentEvent === 'tool_start' || data.type === 'tool_start') {
                setAgentState('calling_tool');
                const newTool: ToolCall = {
                  id: data.id,
                  name: data.name,
                  args: data.args,
                  isRunning: true
                };
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      const existing = m.tool_calls || [];
                      return { 
                        ...m, 
                        status_text: `${t('status_calling_tool', '調用工具中...')}: ${data.name}`,
                        tool_calls: [...existing, newTool] 
                      };
                    }
                    return m;
                  });
                });
              } else if (currentEvent === 'tool_result' || data.type === 'tool_result') {
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      const existing = m.tool_calls || [];
                      const updated = existing.map(t => {
                        if (t.id === data.id) {
                          return {
                            ...t,
                            output: data.output,
                            success: data.success,
                            duration: data.duration,
                            display: data.display,
                            isRunning: false
                          };
                        }
                        return t;
                      });
                      return { ...m, tool_calls: updated };
                    }
                    return m;
                  });
                });
              } else if (currentEvent === 'todos' || data.type === 'todos') {
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, todos: data.todos || [] } : m));
              } else if (currentEvent === 'approval_request' || data.type === 'approval_request') {
                setAgentState('idle');
                setMessages(prev => prev.map(m => {
                  if (m.id !== assistantMsgId) return m;
                  const calls = (m.tool_calls || []).map(tc => tc.id === data.tool_id
                    ? { ...tc, approval: { request_id: data.request_id, status: 'pending' as const, preview: data.preview } }
                    : tc);
                  return { ...m, tool_calls: calls, status_text: t('approval_waiting', '等待你的確認') };
                }));
              } else if (currentEvent === 'approval_resolved' || data.type === 'approval_resolved') {
                setAgentState('calling_tool');
                setMessages(prev => prev.map(m => {
                  if (m.id !== assistantMsgId) return m;
                  const calls = (m.tool_calls || []).map(tc => tc.id === data.tool_id && tc.approval
                    ? { ...tc, approval: { ...tc.approval, status: data.approved ? 'approved' as const : 'rejected' as const } }
                    : tc);
                  return { ...m, tool_calls: calls };
                }));
              } else if (currentEvent === 'token' || data.type === 'token') {
                if (firstTokenTimeRef.current === null) {
                  firstTokenTimeRef.current = performance.now();
                }
                setAgentState('generating');
                const chunk = data.content || '';
                streamTokenCountRef.current += Math.max(1, Math.ceil(chunk.length / 2.8));
                tokenBufferRef.current[assistantMsgId] = (tokenBufferRef.current[assistantMsgId] || '') + chunk;
                scheduleFlush();
              } else if (currentEvent === 'done' || data.type === 'done') {
                cancelScheduledFlush();
                flushTokenBuffer();
                isStreamingRef.current = false;
                setAgentState('idle');
                setIsStreaming(false);

                const finalElapsed = Math.max(0.01, (performance.now() - streamStartTimeRef.current) / 1000);
                const finalTps = streamTokenCountRef.current / finalElapsed;
                const finalTtft = firstTokenTimeRef.current ? Math.round(firstTokenTimeRef.current - streamStartTimeRef.current) : undefined;
                const finalTelemetry = {
                  tokens: streamTokenCountRef.current,
                  duration_s: Number(finalElapsed.toFixed(2)),
                  tokens_per_second: Number(finalTps.toFixed(1)),
                  ttft_ms: finalTtft,
                  temperature: modelConfig.temperature,
                  model: modelConfig.model
                };

                setMessages(prev => {
                  const exists = prev.some(m => m.id === assistantMsgId);
                  if (!exists && (data.content || data.thought)) {
                    return [
                      ...prev,
                      {
                        id: data.message_id || assistantMsgId,
                        role: 'assistant',
                        content: data.content || '',
                        thought: data.thought || '',
                        tool_calls: [],
                        persona_id: selectedPersonaId,
                        created_at: new Date().toISOString(),
                        telemetry: finalTelemetry
                      }
                    ];
                  }
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return {
                        ...m,
                        id: data.message_id || m.id,
                        content: m.content || data.content || '',
                        thought: m.thought || data.thought || '',
                        status_text: undefined,
                        telemetry: finalTelemetry
                      };
                    }
                    return m;
                  });
                });
                fetchSessions();
              } else if (currentEvent === 'error' || data.type === 'error') {
                cancelScheduledFlush();
                flushTokenBuffer();
                isStreamingRef.current = false;
                setAgentState('error');
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, content: m.content + `\n\n❌ **${t('exec_error', '執行錯誤')}**: ${data.error || t('unknown_error', '未知異常')}`, status_text: undefined };
                    }
                    return m;
                  });
                });
                setIsStreaming(false);
              }
            } catch (err) {
              console.error('Error parsing SSE data:', err, jsonStr);
            }
          }
        }
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAgentState('error');
        setMessages(prev => {
          return prev.map(m => {
            if (m.id === assistantMsgId) {
              return { ...m, content: m.content + `\n\n❌ **${t('connection_error', '連線異常')}**: ${err.message}` };
            }
            return m;
          });
        });
      }
    } finally {
      cancelScheduledFlush();
      flushTokenBuffer();
      isStreamingRef.current = false;
      setIsStreaming(false);
      setAgentState('idle');
      abortControllerRef.current = null;
    }
  };

  const activePersona = personas.find(p => p.id === selectedPersonaId);

  return (
    <div className="relative w-screen h-screen overflow-hidden flex bg-[#070a12] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Dynamic Animated Liquid Glass Background */}
      <LiquidBackground state={agentState} isEcoMode={isEcoMode} />

      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSessionId(id)}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        personas={personas}
        selectedPersonaId={selectedPersonaId}
        onSelectPersona={handleSelectPersona}
        onDeletePersona={handleDeletePersona}
        onOpenNewPersona={() => setIsPersonaModalOpen(true)}
        onOpenSettings={() => handleOpenSettings('model')}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        bookmarkVersion={bookmarkVersion}
        onSelectBookmark={handleSelectBookmark}
        onBookmarkToggle={handleBookmarkToggle}
        onUpdateSessionTitle={(id, title) => {
          setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
        }}
        mode={mode}
        onToggleMode={(m) => {
          if (m === 'code') {
            setIsNewProjectModalOpen(true);
          } else {
            setMode('chat');
            setIsTerminalOpen(false);
            try {
              localStorage.setItem('aether_mode', 'chat');
            } catch {}
          }
        }}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={async (p) => {
          try {
            await fetch('/api/projects/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: p })
            });
            setActiveProject(p);
            fetchProjects();
          } catch (err) {
            console.error('Failed to select project:', err);
          }
        }}
        onOpenNewProject={() => setIsNewProjectModalOpen(true)}
        codeExecutionMode={codeExecutionMode}
        onCodeExecutionModeChange={handleSetCodeExecutionMode}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen(prev => !prev)}
      />

      {/* Main Chat Workspace Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden min-w-0">
        {/* Header */}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          modelConfig={modelConfig}
          agentState={agentState}
          tools={tools}
          onToggleTool={handleToggleTool}
          onOpenSettings={handleOpenSettings}
          onExportSession={handleExportSession}
          onOpenWorkspace={() => setIsWorkspaceDrawerOpen(true)}
          onOpenSwarm={() => setIsSwarmModalOpen(true)}
          activePersona={activePersona}
          availableModels={availableModels}
          isProbingModels={isProbingModels}
          onSelectModel={handleQuickSelectModel}
          onRefreshModels={() => probeAvailableModels(modelConfig)}
          isEcoMode={isEcoMode}
          onToggleEcoMode={handleToggleEcoMode}
          mode={mode}
          onToggleMode={(m) => {
            if (m === 'code') {
              setIsNewProjectModalOpen(true);
            } else {
              setMode('chat');
              setIsTerminalOpen(false);
              try {
                localStorage.setItem('aether_mode', 'chat');
              } catch {}
            }
          }}
          projects={projects}
          activeProject={activeProject}
          codeExecutionMode={codeExecutionMode}
          onCodeExecutionModeChange={handleSetCodeExecutionMode}
          onSelectProject={async (p) => {
            try {
              await fetch('/api/projects/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: p })
              });
              setActiveProject(p);
              fetchProjects();
            } catch (err) {
              console.error('Failed to select project:', err);
            }
          }}
          onOpenNewProject={() => setIsNewProjectModalOpen(true)}
          isTerminalOpen={isTerminalOpen}
          onToggleTerminal={() => setIsTerminalOpen(prev => !prev)}
        />

        {/* Chat Canvas & Input */}
        <ChatView
          messages={messages}
          agentState={agentState}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isStreaming={isStreaming}
          onBookmarkToggle={handleBookmarkToggle}
          onEditPrompt={handleEditPrompt}
          temperature={modelConfig.temperature}
          onTemperatureChange={handleTemperatureChange}
          personas={personas}
          activePersona={activePersona}
          mode={mode}
          activeProject={activeProject}
          codeExecutionMode={codeExecutionMode}
          onOpenNewProject={() => setIsNewProjectModalOpen(true)}
          isTerminalOpen={isTerminalOpen}
          onToggleTerminal={() => setIsTerminalOpen(prev => !prev)}
        />
      </div>

      {/* Settings & Model Hub Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={modelConfig}
        onSaveConfig={handleSaveModelConfig}
        onModelsDetected={setAvailableModels}
        tools={tools}
        onToggleTool={handleToggleTool}
        onRefreshTools={fetchTools}
        initialTab={settingsTab}
      />

      {/* Custom Persona Builder Modal */}
      <PersonaModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        onSavePersona={handleSavePersona}
        onDeletePersona={handleDeletePersona}
        personas={personas}
        availableTools={tools}
      />

      {/* Workspace File Explorer Drawer */}
      <WorkspaceDrawer
        isOpen={isWorkspaceDrawerOpen}
        onClose={() => setIsWorkspaceDrawerOpen(false)}
        onAskAgent={handleAskAgent}
        activeProject={activeProject}
      />

      {/* Multi-Agent Swarm Roundtable Modal */}
      <SwarmModal
        isOpen={isSwarmModalOpen}
        onClose={() => setIsSwarmModalOpen(false)}
        personas={personas}
        onApplyToChat={handleApplySwarm}
        modelConfig={modelConfig}
      />

      {/* Code Mode Interactive Terminal */}
      <InteractiveTerminal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        activeProject={activeProject}
        projects={projects}
        onSelectProject={(p) => {
          setActiveProject(p);
          fetchProjects();
        }}
        onAutoFix={(cmd, err) => {
          const autoPrompt = t('prompt_autofix', '【🚨 終端指令執行失敗，請自主分析報錯並自動修復代碼】：\n\n執行指令: {cmd}\n\n錯誤 Traceback:\n{err}\n\n請自主檢查專案代碼、定位問題、修改檔案並重新執行測試驗證！', { cmd, err });
          handleSendMessage(autoPrompt);
        }}
      />

      {/* Outer Web Access PIN Protection Modal */}
      <PinLockModal
        isOpen={isPinModalOpen}
        onSuccess={() => {
          // Initial data requests were rejected before unlocking; reload them with the token
          setIsPinModalOpen(false);
          window.location.reload();
        }}
      />

      {/* New Project Modal */}
      <ProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        projects={projects}
        activeProject={activeProject}
        codeExecutionMode={codeExecutionMode}
        onSelectExecutionMode={handleSetCodeExecutionMode}
        onProjectCreated={(name, execM) => {
          setActiveProject(name);
          if (execM) handleSetCodeExecutionMode(execM);
          setMode('code');
          fetchProjects();
          setIsTerminalOpen(true);
          try {
            localStorage.setItem('aether_mode', 'code');
          } catch {}
        }}
        onSelectProject={(name) => {
          setActiveProject(name);
          setMode('code');
          fetchProjects();
          setIsTerminalOpen(true);
          try {
            localStorage.setItem('aether_mode', 'code');
          } catch {}
        }}
      />
    </div>
  );
};
export default App;
