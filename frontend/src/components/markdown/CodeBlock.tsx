import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Terminal, 
  FileCode, 
  Code2 
} from 'lucide-react';
import { highlightLine, normalizeLanguage } from './syntaxHighlighter';
import { MermaidRenderer } from './MermaidRenderer';

interface CodeBlockProps {
  lang: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ lang, code }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const normLang = normalizeLanguage(lang);

  // If this is a Mermaid diagram, render the Mermaid interactive viewer!
  if (normLang === 'mermaid') {
    return <MermaidRenderer code={code} />;
  }

  const lines = code.split('\n');
  const lineCount = lines.length;
  const isLongCode = lineCount > 22;
  const displayedLines = isLongCode && !isExpanded ? lines.slice(0, 18) : lines;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extensions: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      bash: 'sh',
      sql: 'sql',
      rust: 'rs',
      go: 'go',
      json: 'json',
      yaml: 'yaml',
      html: 'html',
      css: 'css',
      markdown: 'md'
    };
    const ext = extensions[normLang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code-${Date.now()}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getLanguageBadgeColor = (l: string) => {
    switch (l) {
      case 'python':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'javascript':
      case 'typescript':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'bash':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'sql':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'rust':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'go':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'json':
      case 'yaml':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
      default:
        return 'bg-white/[0.08] text-slate-300 border-white/10';
    }
  };

  return (
    <div className="my-4 rounded-2xl overflow-hidden glass-card border border-white/15 shadow-2xl backdrop-blur-xl">
      {/* Code Header Bar */}
      <div className="px-4 py-2 bg-white/[0.05] border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border ${getLanguageBadgeColor(normLang)}`}>
            {normLang || 'CODE'}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {lineCount} 行 • {code.length} 字元
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 transition-colors"
            title="下載代碼檔案"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg glass-button text-xs font-semibold text-slate-300 hover:text-cyan-300 transition-all flex items-center gap-1.5"
            title="複製程式碼"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-300">已複製</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">複製代碼</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Body with Gutter */}
      <div className="overflow-x-auto p-3.5 bg-black/45 font-mono text-xs leading-relaxed selection:bg-cyan-500/30">
        <table className="w-full border-collapse">
          <tbody>
            {displayedLines.map((line, idx) => {
              const highlightedSpans = highlightLine(line, normLang);
              return (
                <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                  {/* Line Number Gutter */}
                  <td className="select-none text-right pr-4 text-slate-600 font-mono text-[11px] w-8 align-top">
                    {idx + 1}
                  </td>
                  {/* Code Line */}
                  <td className="whitespace-pre">
                    {highlightedSpans.map((span, sIdx) => (
                      <span key={sIdx} className={span.className}>
                        {span.text}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Truncation Fade & Expand Bar for long snippets */}
        {isLongCode && (
          <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center justify-center">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3.5 py-1 rounded-xl glass-button text-xs text-cyan-300 hover:text-white flex items-center gap-1.5 transition-all"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>收合代碼區塊</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>展開全部 {lineCount} 行代碼</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
