import React, { useState } from 'react';
import { 
  Terminal, 
  Search, 
  Code2, 
  FolderGit2, 
  Cpu, 
  Clock, 
  Wrench, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';
import { ToolCall } from '../types';

interface ToolCallCardProps {
  tool: ToolCall;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ tool }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'web_search':
        return <Search className="w-4 h-4 text-cyan-400" />;
      case 'python_eval':
        return <Code2 className="w-4 h-4 text-amber-400" />;
      case 'bash_executor':
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case 'file_system':
        return <FolderGit2 className="w-4 h-4 text-blue-400" />;
      case 'system_status':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case 'datetime_calc':
        return <Clock className="w-4 h-4 text-pink-400" />;
      default:
        return <Wrench className="w-4 h-4 text-cyan-400" />;
    }
  };

  const isRunning = tool.isRunning || (!tool.output && tool.success === undefined);

  return (
    <div className="my-2 rounded-xl overflow-hidden glass-card border border-white/10 transition-all duration-300">
      {/* Tool Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 shadow-sm">
            {getToolIcon(tool.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200 tracking-wide font-mono">
                {tool.name}
              </span>
              {isRunning && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  執行中...
                </span>
              )}
              {!isRunning && tool.success && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  已完成
                </span>
              )}
              {!isRunning && tool.success === false && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <AlertCircle className="w-2.5 h-2.5" />
                  執行失敗
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          {tool.duration !== undefined && (
            <span className="text-[11px] font-mono text-slate-400/80 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
              {tool.duration}s
            </span>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Tool Content Details */}
      {isOpen && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.06] bg-black/20 text-xs font-mono space-y-2">
          {/* Input Arguments */}
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">輸入參數 :</span>
            <pre className="mt-1 p-2 rounded-lg bg-black/40 border border-white/5 text-slate-300 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>

          {/* Output / Error */}
          {tool.output && (
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">工具輸出 :</span>
              <pre className="mt-1 p-2 rounded-lg bg-black/40 border border-white/5 text-emerald-300/90 overflow-x-auto whitespace-pre-wrap break-all text-[11px] max-h-52 overflow-y-auto">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
