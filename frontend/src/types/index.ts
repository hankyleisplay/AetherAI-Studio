export type AgentState = 'idle' | 'thinking' | 'calling_tool' | 'generating' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  output?: string;
  success?: boolean;
  duration?: number;
  isRunning?: boolean;
}

export interface Message {
  id: string;
  session_id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thought?: string;
  tool_calls?: ToolCall[];
  created_at?: string;
}

export interface Session {
  id: string;
  title: string;
  persona_id: string;
  created_at: string;
  updated_at: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  enabled_tools: string[];
}

export interface ModelConfig {
  provider: 'ollama' | 'openai_compatible' | 'lm_studio' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'openai';
  base_url: string;
  api_key?: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  required: string[];
  enabled: boolean;
}
