/** Shared helpers for the local Ollama endpoints. */

export interface PullProgress {
  percent: number | null;
  status: string;
}

/**
 * Download a model through /api/ollama/pull (server-sent events), reporting progress.
 * Resolves when the download finished; throws with Ollama's message when it fails.
 */
export async function pullOllamaModel(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
  const res = await fetch('/api/ollama/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let event = 'message';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { event = 'message'; continue; }
      if (line.startsWith('event:')) { event = line.slice(6).trim(); continue; }
      if (!line.startsWith('data:')) continue;
      const data = JSON.parse(line.slice(5).trim());
      if (event === 'progress') {
        onProgress({ percent: typeof data.percent === 'number' ? data.percent : null, status: data.status || '' });
      } else if (event === 'error') {
        throw new Error(data.error || 'download failed');
      } else if (event === 'done') {
        reader.cancel().catch(() => {});
        return;
      }
    }
  }
  throw new Error('interrupted');
}

/** POST JSON to an Ollama management endpoint; throws the server's message on failure. */
export async function ollamaAction<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data as T;
}

export const formatGB = (bytes: number) => (bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1);
