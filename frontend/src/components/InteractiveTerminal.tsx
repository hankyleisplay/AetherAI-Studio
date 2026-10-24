import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, 
  Play, 
  Trash2, 
  X, 
  Maximize2, 
  Minimize2, 
  FolderGit2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface TerminalOutputItem {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  timestamp: string;
}

interface InteractiveTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: string | null;
  projects?: Array<{ name: string; path: string }>;
  onSelectProject?: (name: string | null) => void;
  onAutoFix?: (command: string, stderr: string) => void;
}

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({
  isOpen,
  onClose,
  activeProject,
  projects = [],
  onSelectProject,
  onAutoFix
}) => {
  const { t } = useI18n();
  const [command, setCommand] = useState('');
  const [outputs, setOutputs] = useState<TerminalOutputItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal output
  useEffect(() => {
    if (isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputs, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun ?? command).trim();
    if (!cmd || isRunning) return;

    if (cmd === 'clear' || cmd === 'cls') {
      setOutputs([]);
      setCommand('');
      setHistoryIndex(-1);
      return;
    }

    setIsRunning(true);
    // Add to history
    setHistory(prev => [cmd, ...prev.filter(c => c !== cmd)]);
    setHistoryIndex(-1);
    setCommand('');

    try {
      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          project: activeProject
        })
      });

      if (res.ok) {
        const data = await res.json();
        const item: TerminalOutputItem = {
          id: String(Date.now()),
          command: cmd,
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          exitCode: data.exit_code ?? 0,
          durationMs: data.duration_ms ?? 0,
          cwd: data.cwd || '',
          timestamp: new Date().toLocaleTimeString()
        };
        setOutputs(prev => [...prev, item]);
      } else {
        const item: TerminalOutputItem = {
          id: String(Date.now()),
          command: cmd,
          stdout: '',
          stderr: `HTTP error ${res.status}`,
          exitCode: 1,
          durationMs: 0,
          cwd: '',
          timestamp: new Date().toLocaleTimeString()
        };
        setOutputs(prev => [...prev, item]);
      }
    } catch (err: any) {
      const item: TerminalOutputItem = {
        id: String(Date.now()),
        command: cmd,
        stdout: '',
        stderr: String(err.message || err),
        exitCode: 1,
        durationMs: 0,
        cwd: '',
        timestamp: new Date().toLocaleTimeString()
      };
      setOutputs(prev => [...prev, item]);
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };


  const handleKillCommand = async () => {
    try {
      await fetch('/api/terminal/kill', { method: 'POST' });
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setOutputs([]);
    }
  };

  if (!isOpen) return null;

  const currentProjectName = activeProject || t('root_workspace', '工作區根目錄 (Root)');

  return (
    <div 
      className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-[#070b14]/98 backdrop-blur-2xl border-l border-cyan-500/30 shadow-[-15px_0_40px_rgba(0,0,0,0.85)] transition-all duration-300 ease-in-out ${
        isExpanded ? 'w-[75vw] md:w-[60vw]' : 'w-[420px] sm:w-[480px] md:w-[520px] max-w-[95vw]'
      }`}
    >
      {/* Terminal Title Bar */}
      <div className="h-12 px-4 bg-black/50 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">{t('terminal_title', '互動工作區終端 (Terminal)')}</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded-md truncate max-w-[130px] sm:max-w-[180px]">
            <FolderGit2 className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="text-slate-400 hidden sm:inline">{t('active_project_label', '專案:')}</span>
            <span className="font-bold text-cyan-200 truncate">{currentProjectName}</span>
          </div>
        </div>

        {/* Quick Commands & Window Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Command Pills */}
          <div className="hidden sm:flex items-center gap-1 mr-1 text-[10px] font-mono">
            <button
              onClick={() => handleRunCommand('dir')}
              className="px-2 py-0.5 rounded glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title="列出目錄內容 (dir / ls)"
            >
              dir
            </button>
            <button
              onClick={() => handleRunCommand('python main.py')}
              className="px-2 py-0.5 rounded glass-button text-slate-300 hover:text-cyan-300 transition-colors"
              title="執行主程式 (python main.py)"
            >
              python
            </button>
          </div>

          <button
            onClick={() => setOutputs([])}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
            title={t('terminal_clear', '清空終端 (Ctrl+L)')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors"
            title={isExpanded ? '寬度收窄 (預設)' : '寬度展開 (寬螢幕)'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            title={t('close', '關閉')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div 
        onClick={() => inputRef.current?.focus()}
        className="flex-1 overflow-y-auto p-3.5 font-mono text-xs space-y-3.5 select-text cursor-text"
      >
        {/* Welcome Banner */}
        <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-slate-300 text-[11px] leading-relaxed">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold mb-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Aether Code Terminal v3.7.0 • Autonomous Engine</span>
          </div>
          <div className="text-slate-400">
            {t('code_mode_desc', '直接在專案目錄下寫程式、讀取與修改檔案、執行終端指令、自主測試與除錯。')}
          </div>
        </div>

        {outputs.map((item) => (
          <div key={item.id} className="space-y-1.5">
            {/* Command Header */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-white/5 pb-1">
              <div className="flex items-center gap-1.5 min-w-0 font-bold text-cyan-300">
                <span className="text-emerald-400">➜</span>
                <span className="text-slate-400">{item.cwd ? item.cwd.split('\\').pop() : 'workspace'} $</span>
                <span className="text-white truncate">{item.command}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[10px]">
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-3 h-3" />
                  {item.durationMs} ms
                </span>
                <span className={`px-1.5 py-0.2 rounded font-semibold ${
                  item.exitCode === 0 
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                }`}>
                  {item.exitCode === 0 ? 'EXIT 0' : `EXIT ${item.exitCode}`}
                </span>
              </div>
            </div>

            {/* Stdout */}
            {item.stdout && (
              <pre className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-slate-200 whitespace-pre-wrap break-all text-[11.5px] leading-relaxed selection:bg-cyan-500/30">
                {item.stdout}
              </pre>
            )}

            {/* Stderr */}
            {item.stderr && (
              <pre className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 whitespace-pre-wrap break-all text-[11.5px] leading-relaxed">
                {item.stderr}
              </pre>
            )}

            {item.exitCode !== 0 && item.stderr && onAutoFix && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onAutoFix(item.command, item.stderr)}
                  className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500/25 to-rose-500/25 hover:from-amber-500/35 hover:to-rose-500/35 border border-amber-500/50 text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>🤖 一鍵交給 Agent 自動分析並修復 (Auto-Fix)</span>
                </button>
              </div>
            )}
          </div>
        ))}

        <div ref={terminalEndRef} />
      </div>

      {/* Mobile Quick Action Bar */}
      <div className="px-2.5 pt-2 pb-1 bg-black/40 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <button
          type="button"
          onClick={() => handleRunCommand('dir')}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono shrink-0"
        >
          dir
        </button>
        <button
          type="button"
          onClick={() => handleRunCommand('git status')}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono shrink-0"
        >
          git status
        </button>
        <button
          type="button"
          onClick={() => handleRunCommand('git diff')}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono shrink-0"
        >
          git diff
        </button>
        <button
          type="button"
          onClick={() => handleRunCommand('python main.py')}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-300 font-mono shrink-0"
        >
          python main.py
        </button>
        <button
          type="button"
          onClick={() => handleRunCommand('clear')}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 font-mono shrink-0"
        >
          清屏 (cls)
        </button>
        {isRunning && (
          <button
            type="button"
            onClick={handleKillCommand}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold shrink-0 flex items-center gap-1"
          >
            <span>中斷 (Ctrl+C)</span>
          </button>
        )}
      </div>

      {/* Terminal Input Bar */}
      <div className="p-2.5 bg-black/60 border-t border-white/10 flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 font-mono text-xs text-emerald-400 pl-1 shrink-0 font-bold select-none">
          <span>{currentProjectName.split('/').pop()}</span>
          <span className="text-cyan-400">$</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder={t('terminal_input_placeholder', '輸入終端指令 (如 python main.py, dir, git status)...')}
          className="flex-1 bg-transparent border-0 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:ring-0 disabled:opacity-50"
        />

        <button
          onClick={() => handleRunCommand()}
          disabled={isRunning || !command.trim()}
          className="px-3 py-1.5 rounded-lg glass-button-primary flex items-center gap-1.5 text-xs font-mono font-semibold text-white disabled:opacity-40 transition-all shrink-0"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
              <span>{t('terminal_running', '執行中...')}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-cyan-300 fill-cyan-300/30" />
              <span>{t('terminal_run', '執行')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
export default InteractiveTerminal;
