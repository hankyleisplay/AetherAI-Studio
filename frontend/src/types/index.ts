export type AgentState = 'idle' | 'thinking' | 'calling_tool' | 'generating' | 'error';
export type CodeExecutionMode = 'auto' | 'accept_edit' | 'turbo';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  output?: string;
  success?: boolean;
  duration?: number;
  isRunning?: boolean;
  // Code agent: structured result (diff / command) and Accept Edit approval state
  display?: ToolDisplay;
  approval?: ToolApproval;
}

export interface ToolDisplay {
  kind?: 'diff' | 'command' | 'todos' | 'action';
  text?: string;
  path?: string;
  diff?: string;
  added?: number;
  removed?: number;
  created?: boolean;
  command?: string;
  cwd?: string;
  exit_code?: number | null;
  timed_out?: boolean;
  duration?: number;
  todos?: TodoItem[];
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'video';
  prompt: string;
  provider: string;
  model?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
  created_at?: string;
  url: string | null;
  meta?: { aspect?: string; progress?: number; [key: string]: any };
}

export interface MediaConfig {
  image_provider: string;
  video_provider: string;
  openai_api_key?: string;
  gemini_api_key?: string;
  has_openai_api_key?: boolean;
  has_gemini_api_key?: boolean;
  sd_base_url: string;
  openai_image_model: string;
  gemini_image_model: string;
  veo_model: string;
  sora_model: string;
  image_providers?: string[];
  video_providers?: string[];
}

export interface CodeToolInfo {
  name: string;
  description: string;
  parameters: string[];
  required: string[];
  mutating: boolean;
  enabled: boolean;
}

export interface ToolApproval {
  request_id: string;
  status: 'pending' | 'approved' | 'rejected';
  preview?: ToolDisplay;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface MessageTelemetry {
  tokens?: number;
  duration_s?: number;
  tokens_per_second?: number;
  ttft_ms?: number;
  temperature?: number;
  model?: string;
}

export interface Message {
  id: string;
  session_id?: string;
  session_title?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thought?: string;
  tool_calls?: ToolCall[];
  created_at?: string;
  is_bookmarked?: boolean | number;
  persona_id?: string;
  status_text?: string;
  images?: string[];
  telemetry?: MessageTelemetry;
  todos?: TodoItem[];
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  mtime: number;
  extension: string;
}

export interface SwarmPersona {
  id: string;
  name: string;
  icon: string;
}

export interface SwarmTurn {
  round: number;
  persona_id: string;
  persona_name: string;
  persona_icon?: string;
  content: string;
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
  provider: 'ollama' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'openai';
  base_url: string;
  api_key?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  context_window?: number;
  /** Ollama: choose context window / output length from the GPU and model */
  auto_tune?: boolean;
  /** Ollama thinking models: on / off, or null for the model's default */
  think?: boolean | null;
}

export interface OllamaInstalledModel {
  name: string;
  size_bytes: number;
  modified_at?: string;
  parameter_size?: string;
  quantization?: string;
  family?: string;
  capabilities: string[];
}

export interface OllamaLoadedModel {
  name: string;
  size_bytes: number;
  vram_bytes: number;
  gpu_percent: number | null;
  context_length?: number;
  expires_at?: string;
}

export interface OllamaModelsInfo {
  base_url: string;
  installed: OllamaInstalledModel[];
  loaded: OllamaLoadedModel[];
  active: ModelConfig;
  auto: { context_window: number; max_tokens: number; source: string } | null;
  started_by_aether: boolean;
}

export interface HardwareIssue {
  code: string;
  level: 'info' | 'warn' | 'danger';
  params: Record<string, any>;
}

export interface HardwareCheckResult {
  provider: string;
  model: string;
  local: boolean;
  verdict: 'ok' | 'warn' | 'danger' | 'cloud' | 'unknown';
  hardware: {
    gpu_detected: boolean;
    gpu_name: string | null;
    vram_total_gb: number;
    vram_used_gb: number;
    unified_memory: boolean;
    ram_total_gb: number;
    ram_available_gb: number;
  } | null;
  model_info: {
    params_b: number | null;
    weights_gb: number | null;
    native_context: number | null;
    source: 'ollama' | 'estimated' | 'unknown';
  } | null;
  estimate: {
    weights_gb: number;
    kv_cache_gb: number;
    overhead_gb: number;
    total_gb: number;
    gpu_fit_pct?: number;
    vram_free_gb?: number;
  } | null;
  issues: HardwareIssue[];
  recommended: { context_window: number; max_tokens: number } | null;
  /** Ollama auto-tune: the values chat uses (null when auto-tune is off) */
  auto?: { context_window: number; max_tokens: number; source: string } | null;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  required: string[];
  enabled: boolean;
}
