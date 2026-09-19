import React, { useState, useEffect, useRef } from 'react';
import { LiquidBackground } from './components/LiquidBackground';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { PersonaModal } from './components/PersonaModal';
import { Session, Message, Persona, ModelConfig, ToolDefinition, AgentState, ToolCall } from './types';
import { useI18n } from './i18n/I18nContext';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('assistant');
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState<boolean>(false);

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'ollama',
    base_url: 'http://localhost:11434',
    model: 'llama3:latest',
    temperature: 0.7,
    max_tokens: 4096
  });

  const abortControllerRef = useRef<AbortController | null>(null);

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
      fetchSessionMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  const fetchActiveModel = async () => {
    try {
      const res = await fetch('/api/models/active');
      if (res.ok) {
        const data = await res.json();
        setModelConfig(data);
      }
    } catch (e) {
      console.error('Failed to load active model:', e);
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
      setModelConfig(newConfig);
    } catch (e) {
      console.error('Failed to save model config:', e);
    }
  };

  const handleSavePersona = async (newPersona: Persona) => {
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPersona)
      });
      if (res.ok) {
        setPersonas(prev => [...prev, newPersona]);
        setSelectedPersonaId(newPersona.id);
      }
    } catch (e) {
      console.error('Failed to save persona:', e);
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setAgentState('idle');
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add User Message immediately
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };

    // Prepare Assistant Message container
    const assistantMsgId = `asst_${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      tool_calls: [],
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setAgentState('thinking');

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

              if (currentEvent === 'session_info' || data.type === 'session_info') {
                if (data.session_id && data.session_id !== activeSessionId) {
                  setActiveSessionId(data.session_id);
                  fetchSessions();
                }
              } else if (currentEvent === 'thought' || data.type === 'thought') {
                setAgentState('thinking');
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, thought: (m.thought || '') + (data.content || '') };
                    }
                    return m;
                  });
                });
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
                      return { ...m, tool_calls: [...existing, newTool] };
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
              } else if (currentEvent === 'token' || data.type === 'token') {
                setAgentState('generating');
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, content: m.content + (data.content || '') };
                    }
                    return m;
                  });
                });
              } else if (currentEvent === 'done' || data.type === 'done') {
                setAgentState('idle');
                setIsStreaming(false);
                fetchSessions();
              } else if (currentEvent === 'error' || data.type === 'error') {
                setAgentState('error');
                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, content: m.content + `\n\n❌ **執行錯誤**: ${data.error || '未知異常'}` };
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
              return { ...m, content: m.content + `\n\n❌ **連線異常**: ${err.message}` };
            }
            return m;
          });
        });
      }
    } finally {
      setIsStreaming(false);
      setAgentState('idle');
      abortControllerRef.current = null;
    }
  };

  const activePersona = personas.find(p => p.id === selectedPersonaId);

  return (
    <div className="relative w-screen h-screen overflow-hidden flex bg-[#070a12] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Dynamic Animated Liquid Glass Background */}
      <LiquidBackground state={agentState} />

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
        onOpenNewPersona={() => setIsPersonaModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Chat Workspace Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden">
        {/* Header */}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          modelConfig={modelConfig}
          agentState={agentState}
          tools={tools}
          onToggleTool={handleToggleTool}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onExportSession={handleExportSession}
          activePersona={activePersona}
        />

        {/* Chat Canvas & Input */}
        <ChatView
          messages={messages}
          agentState={agentState}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isStreaming={isStreaming}
        />
      </div>

      {/* Settings & Model Hub Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={modelConfig}
        onSaveConfig={handleSaveModelConfig}
      />

      {/* Custom Persona Builder Modal */}
      <PersonaModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        onSavePersona={handleSavePersona}
        availableTools={tools}
      />
    </div>
  );
};
export default App;
