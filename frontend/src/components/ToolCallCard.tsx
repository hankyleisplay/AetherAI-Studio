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
  Loader2,
  GitBranch,
  Database,
  FileCode2,
  ShieldCheck,
  Binary,
  Archive,
  Globe,
  FileSearch,
  BarChart3,
  Network,
  FileText,
  FolderTree,
  FilePen,
  FilePlus2,
  ListTodo,
  Check,
  X,
  FileStack,
  Trash2,
  MoveRight,
  ShieldQuestion,
  Link2
} from 'lucide-react';
import { ToolCall } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { DiffView } from './DiffView';

interface ToolCallCardProps {
  tool: ToolCall;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ tool }) => {
  const { t } = useI18n();
  const approvalPending = tool.approval?.status === 'pending';
  const [isOpen, setIsOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const expanded = isOpen || approvalPending;

  const resolveApproval = async (approved: boolean) => {
    if (!tool.approval) return;
    setIsResolving(true);
    try {
      await fetch('/api/code/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: tool.approval.request_id, approved, feedback: approved ? '' : feedback.trim() })
      });
    } catch (err) {
      console.error('Failed to send approval:', err);
    } finally {
      setIsResolving(false);
    }
  };

  // One-line description of what the coding tools did, shown next to the tool name
  const summary = (() => {
    const a = tool.args || {};
    const d = tool.display;
    switch (tool.name) {
      case 'read_file':
        return a.offset ? `${a.path} : ${a.offset}+` : a.path;
      case 'edit_file':
      case 'write_file':
      case 'multi_edit':
        return d?.path || a.path;
      case 'delete_path':
      case 'check_syntax':
        return a.path;
      case 'move_path':
        return `${a.source} → ${a.destination}`;
      case 'git':
        return [a.action, a.path].filter(Boolean).join(' ');
      case 'web_fetch':
        return a.url;
      case 'web_search':
        return a.query;
      case 'run_command':
        return a.command;
      case 'grep':
        return `/${a.pattern}/${a.include ? ` ${a.include}` : ''}`;
      case 'glob':
        return a.pattern;
      case 'list_dir':
        return a.path || '.';
      default:
        return '';
    }
  })();

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
      case 'read_url':
        return <Globe className="w-4 h-4 text-sky-400" />;
      case 'knowledge_memory':
        return <Database className="w-4 h-4 text-indigo-400" />;
      case 'generate_chart':
      case 'mermaid_generator':
        return <BarChart3 className="w-4 h-4 text-teal-400" />;
      case 'http_request_api':
        return <Network className="w-4 h-4 text-violet-400" />;
      case 'document_text_extractor':
        return <FileText className="w-4 h-4 text-orange-400" />;
      case 'code_linter_analyzer':
        return <FileCode2 className="w-4 h-4 text-yellow-400" />;
      case 'ocr_extractor':
      case 'image_to_text':
        return <FileSearch className="w-4 h-4 text-rose-400" />;
      case 'git_version_control':
        return <GitBranch className="w-4 h-4 text-orange-500" />;
      case 'database_sqlite_inspector':
        return <Database className="w-4 h-4 text-cyan-500" />;
      case 'data_transformer_converter':
        return <Binary className="w-4 h-4 text-emerald-400" />;
      case 'hash_crypto_inspector':
        return <ShieldCheck className="w-4 h-4 text-green-400" />;
      case 'regex_pattern_matcher':
        return <Code2 className="w-4 h-4 text-fuchsia-400" />;
      case 'archive_compressor':
        return <Archive className="w-4 h-4 text-amber-500" />;
      case 'network_dns_whois_lookup':
        return <Globe className="w-4 h-4 text-blue-400" />;
      case 'list_dir':
        return <FolderTree className="w-4 h-4 text-blue-400" />;
      case 'glob':
      case 'grep':
        return <Search className="w-4 h-4 text-sky-400" />;
      case 'read_file':
        return <FileText className="w-4 h-4 text-slate-300" />;
      case 'edit_file':
        return <FilePen className="w-4 h-4 text-amber-400" />;
      case 'write_file':
        return <FilePlus2 className="w-4 h-4 text-emerald-400" />;
      case 'run_command':
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case 'todo_write':
        return <ListTodo className="w-4 h-4 text-violet-400" />;
      case 'multi_edit':
        return <FileStack className="w-4 h-4 text-amber-400" />;
      case 'delete_path':
        return <Trash2 className="w-4 h-4 text-rose-400" />;
      case 'move_path':
        return <MoveRight className="w-4 h-4 text-sky-400" />;
      case 'git':
        return <GitBranch className="w-4 h-4 text-orange-400" />;
      case 'check_syntax':
        return <ShieldQuestion className="w-4 h-4 text-teal-400" />;
      case 'web_fetch':
        return <Link2 className="w-4 h-4 text-sky-400" />;
      default:
        return <Wrench className="w-4 h-4 text-cyan-400" />;
    }
  };

  const isRunning = !approvalPending && (tool.isRunning || (!tool.output && tool.success === undefined));
  const diffStats = tool.display?.kind === 'diff' && tool.success
    ? { added: tool.display.added ?? 0, removed: tool.display.removed ?? 0 }
    : null;
  const exitCode = tool.display?.kind === 'command' ? tool.display.exit_code : undefined;

  return (
    <div className={`my-2 rounded-xl overflow-hidden glass-card border transition-all duration-300 ${approvalPending ? 'border-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.15)]' : 'border-white/10'}`}>
      {/* Tool Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 shadow-sm shrink-0">
            {getToolIcon(tool.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-200 tracking-wide font-mono shrink-0">
                {tool.name}
              </span>
              {summary && (
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[16rem] md:max-w-md" title={summary}>
                  {summary}
                </span>
              )}
              {diffStats && (
                <span className="text-[11px] font-mono shrink-0">
                  <span className="text-emerald-400">+{diffStats.added}</span>{' '}
                  <span className="text-rose-400">-{diffStats.removed}</span>
                </span>
              )}
              {exitCode !== undefined && exitCode !== null && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${exitCode === 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                  exit {exitCode}
                </span>
              )}
              {approvalPending && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0">
                  {t('approval_waiting', '等待你的確認')}
                </span>
              )}
              {tool.approval?.status === 'rejected' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-300 border border-slate-500/30 whitespace-nowrap shrink-0">
                  {t('approval_rejected', '已拒絕')}
                </span>
              )}
              {isRunning && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 animate-pulse whitespace-nowrap">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  {t('tool_running', '執行中...')}
                </span>
              )}
              {!isRunning && tool.success && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {t('tool_completed', '已完成')}
                </span>
              )}
              {!isRunning && tool.success === false && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                  <AlertCircle className="w-2.5 h-2.5" />
                  {t('tool_failed', '執行失敗')}
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
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Tool Content Details */}
      {/* Accept Edit approval: preview of the change or command, with approve / reject */}
      {approvalPending && tool.approval && (
        <div className="px-3.5 pb-3 pt-2 border-t border-amber-400/20 bg-amber-500/[0.04] space-y-2.5">
          <div className="text-[11px] text-amber-200/90">
            {tool.name === 'run_command'
              ? t('approval_command_prompt', 'Agent 想要執行這個指令：')
              : tool.approval.preview?.kind === 'action'
                ? t('approval_action_prompt', 'Agent 想要執行這個操作：')
                : t('approval_edit_prompt', 'Agent 想要修改這個檔案：')}
          </div>
          {tool.approval.preview?.kind === 'action' ? (
            <pre className="p-2 rounded-lg bg-black/50 border border-white/10 text-amber-100 font-mono text-[11px] whitespace-pre-wrap break-all">
              {tool.approval.preview.text}
            </pre>
          ) : tool.approval.preview?.kind === 'command' ? (
            <pre className="p-2 rounded-lg bg-black/50 border border-white/10 text-emerald-200 font-mono text-[11px] whitespace-pre-wrap break-all">
              {'$ ' + (tool.approval.preview.command || '')}
            </pre>
          ) : (
            <>
              <div className="text-[11px] font-mono text-slate-300">
                {tool.approval.preview?.path}
                {tool.approval.preview?.created && <span className="ml-2 text-emerald-300">({t('approval_new_file', '新檔案')})</span>}
              </div>
              <DiffView diff={tool.approval.preview?.diff || ''} />
            </>
          )}
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && feedback.trim()) resolveApproval(false);
            }}
            placeholder={t('approval_feedback_placeholder', '（選填）拒絕時告訴 Agent 應該怎麼做，按 Enter 送出')}
            className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/50"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isResolving}
              onClick={() => resolveApproval(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {t('approval_approve', '允許')}
            </button>
            <button
              type="button"
              disabled={isResolving}
              onClick={() => resolveApproval(false)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25 flex items-center gap-1.5 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {t('approval_reject', '拒絕')}
            </button>
          </div>
        </div>
      )}

      {isOpen && !approvalPending && tool.display?.kind === 'diff' && tool.display.diff !== undefined && (
        <div className="px-3.5 pb-3 pt-2 border-t border-white/[0.06] bg-black/20">
          <DiffView diff={tool.display.diff} />
        </div>
      )}

      {isOpen && !approvalPending && tool.display?.kind !== 'diff' && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.06] bg-black/20 text-xs font-mono space-y-2">
          {/* Input Arguments */}
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{t('tool_input_args', '輸入參數 :')}</span>
            <pre className="mt-1 p-2 rounded-lg bg-black/40 border border-white/5 text-slate-300 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>

          {/* Output / Error */}
          {tool.output && (
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{t('tool_output_result', '工具輸出 :')}</span>
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
