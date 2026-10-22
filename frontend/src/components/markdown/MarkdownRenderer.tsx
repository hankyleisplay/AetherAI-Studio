import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { ExternalLink, CheckSquare, Square, EyeOff, Eye, Sparkles, ChevronDown } from 'lucide-react';
import { parseMarkdown } from './parser';
import { CodeBlock } from './CodeBlock';
import { TableRenderer } from './TableRenderer';
import { AlertRenderer } from './AlertRenderer';
import { MathBlock, renderMathFormula } from './MathRenderer';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Interactive Spoiler Span (防雷 / 劇透黑幕)
 * Obscures content with blur and dark background until clicked.
 */
const SpoilerSpan: React.FC<{
  content: string;
  renderInline: (text: string) => React.ReactNode;
}> = ({ content, renderInline }) => {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(!revealed);
        }
      }}
      title={revealed ? t('hide_spoiler_hint', '點擊重新隱藏防雷內容') : t('spoiler_warning', '🚨 包含暴雷劇透內容，點擊揭示')}
      className={`relative inline-flex items-center px-2 py-0.5 my-0.5 mx-0.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 cursor-pointer select-none group border ${
        revealed
          ? 'bg-amber-500/15 text-amber-200 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
          : 'bg-[#151926] text-transparent border-amber-500/20 hover:border-amber-400/50 hover:bg-[#1a2032] shadow-inner'
      }`}
    >
      {/* Blurred / Hidden content */}
      <span
        className={`transition-all duration-300 ${
          revealed
            ? 'filter-none opacity-100 select-text text-amber-100'
            : 'filter blur-[5px] opacity-25 select-none pointer-events-none'
        }`}
      >
        {renderInline(content)}
      </span>

      {/* Lock / Reveal Hint Pill Badge when hidden */}
      {!revealed && (
        <span className="absolute inset-0 flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-300 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          <EyeOff className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
          <span className="bg-black/75 px-1.5 py-0.5 rounded backdrop-blur-md border border-amber-500/30 whitespace-nowrap">
            {t('spoiler_badge', '劇透預警 • 點擊揭示')}
          </span>
        </span>
      )}

      {/* Subtle indicator when revealed */}
      {revealed && (
        <span className="ml-1.5 text-[10px] text-amber-400/70 border-l border-amber-500/30 pl-1 shrink-0 font-mono select-none">
          {t('spoiler_revealed_tag', '[已防雷]')}
        </span>
      )}
    </span>
  );
};

/**
 * Interactive Accordion / Folding Card (<details> ... </details>)
 */
const DetailsCard: React.FC<{
  summary: string;
  body: string;
  defaultOpen?: boolean;
  renderInline: (text: string) => React.ReactNode;
}> = ({ summary, body, defaultOpen = false, renderInline }) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-3 rounded-2xl glass-panel border border-white/10 overflow-hidden transition-all duration-300 hover:border-amber-400/30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 text-xs md:text-sm font-semibold text-amber-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{renderInline(summary)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 text-xs shrink-0">
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            {isOpen ? t('collapse_content', '收合內容') : t('click_to_expand', '點擊展開')}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-amber-400' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-white/10 bg-black/20 text-xs md:text-sm text-slate-200 leading-relaxed animate-in fade-in duration-200">
          <MarkdownRenderer content={body} isStreaming={false} />
        </div>
      )}
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isStreaming }) => {
  const tokens = useMemo(() => parseMarkdown(content), [content]);

  // Comprehensive inline spans parser
  const renderInline = (text: string): React.ReactNode => {
    if (!text) return null;

    // Tokenize inline markdown:
    // 1. Spoilers: ||...||, >!...<!, <spoiler>...</spoiler>
    // 2. Highlights: ==...==
    // 3. Keycaps: <kbd>...</kbd>
    // 4. Links: [text](url), Images: ![alt](url)
    // 5. Math: $...$, \(...\)
    // 6. Code: `...`
    // 7. Bold: **...**, Strikethrough: ~~...~~, Italic: *...*, _..._
    const inlineRegex = /(!?\[.*?\]\(.*?\)|(?:\$[^$\n]+?\$)|(?:\\\(.*?\\\))|(?:```[\s\S]+?```)|(?:``[\s\S]+?``)|(?:`[^`\r\n]+?`)|(?:\|\|[\s\S]+?\|\|)|(?:>![\s\S]+?!<)|(?:<spoiler>[\s\S]*?<\/spoiler>)|(?:==[^=\n]+?==)|(?:<kbd>[\s\S]*?<\/kbd>)|(?:\*\*[^*\n]+?\*\*)|(?:~~[^~\n]+?~~)|(?:\*[^*\n]+?\*)|(?:_[^_\n]+?_))/gi;

    const parts = text.split(inlineRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

      // Image: ![alt](url)
      if (part.startsWith('![') && part.includes('](') && part.endsWith(')')) {
        const m = part.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (m) {
          return (
            <span key={idx} className="my-2 block text-center">
              <img
                src={m[2]}
                alt={m[1]}
                className="max-h-96 rounded-xl border border-white/10 shadow-lg mx-auto object-contain hover:scale-105 transition-transform"
                loading="lazy"
              />
              {m[1] && <span className="text-[11px] text-slate-400 mt-1 block">{m[1]}</span>}
            </span>
          );
        }
      }

      // Link: [text](url)
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const m = part.match(/^\[(.*?)\]\((.*?)\)$/);
        if (m) {
          return (
            <a
              key={idx}
              href={m[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-400/50 hover:decoration-cyan-300 inline-flex items-center gap-0.5 mx-0.5"
            >
              <span>{m[1]}</span>
              <ExternalLink className="w-3 h-3 inline-block" />
            </a>
          );
        }
      }

      // Inline LaTeX Math: $...$ or \(...\)
      if (
        (part.startsWith('$') && part.endsWith('$') && part.length > 2 && !part.slice(1, -1).includes('$')) ||
        (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 4)
      ) {
        const formula = part.startsWith('\\(') ? part.slice(2, -2) : part.slice(1, -1);
        return (
          <span
            key={idx}
            className="math-inline"
            dangerouslySetInnerHTML={{ __html: renderMathFormula(formula) }}
          />
        );
      }

      // Inline Code: ```...```, ``...``, `...`
      if (
        (part.startsWith('```') && part.endsWith('```') && part.length >= 6) ||
        (part.startsWith('``') && part.endsWith('``') && part.length >= 4) ||
        (part.startsWith('`') && part.endsWith('`') && part.length >= 2)
      ) {
        let codeContent = '';
        if (part.startsWith('```')) {
          codeContent = part.slice(3, -3);
        } else if (part.startsWith('``')) {
          codeContent = part.slice(2, -2);
        } else {
          codeContent = part.slice(1, -1);
        }
        // CommonMark: strip single leading and trailing space if both exist
        if (codeContent.startsWith(' ') && codeContent.endsWith(' ') && codeContent.trim().length > 0) {
          codeContent = codeContent.slice(1, -1);
        }
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-white/[0.08] text-cyan-300 font-mono text-xs border border-white/10"
          >
            {codeContent}
          </code>
        );
      }

      // Spoiler: ||text|| or >!text!< or <spoiler>text</spoiler>
      if (
        (part.startsWith('||') && part.endsWith('||') && part.length >= 4) ||
        (part.startsWith('>!') && part.endsWith('!<') && part.length >= 4) ||
        (part.toLowerCase().startsWith('<spoiler>') && part.toLowerCase().endsWith('</spoiler>'))
      ) {
        let spoilerText = '';
        if (part.startsWith('||')) {
          spoilerText = part.slice(2, -2);
        } else if (part.startsWith('>!')) {
          spoilerText = part.slice(2, -2);
        } else {
          spoilerText = part.slice(9, -10);
        }
        return (
          <SpoilerSpan key={idx} content={spoilerText} renderInline={renderInline} />
        );
      }

      // Highlight: ==text==
      if (part.startsWith('==') && part.endsWith('==') && part.length >= 4) {
        return (
          <mark key={idx} className="px-1.5 py-0.5 mx-0.5 rounded-md bg-amber-400/20 text-amber-200 border-b border-amber-400 font-medium">
            {renderInline(part.slice(2, -2))}
          </mark>
        );
      }

      // Keyboard Keycap: <kbd>text</kbd>
      if (part.toLowerCase().startsWith('<kbd>') && part.toLowerCase().endsWith('</kbd>')) {
        return (
          <kbd key={idx} className="px-2 py-0.5 mx-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono text-[11px] border border-white/20 shadow-[0_2px_0_0_rgba(255,255,255,0.15)] inline-block align-baseline">
            {part.slice(5, -6)}
          </kbd>
        );
      }

      // Bold: **...**
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={idx} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Strikethrough: ~~...~~
      if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
        return (
          <del key={idx} className="line-through text-slate-500">
            {part.slice(2, -2)}
          </del>
        );
      }

      // Italic: *...* or _..._
      if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
          (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
        return (
          <em key={idx} className="italic text-slate-300">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="markdown-content text-slate-200 leading-relaxed select-text space-y-3 font-sans">
      {tokens.map((token, tIdx) => {
        switch (token.type) {
          case 'heading': {
            const hId = token.text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (token.level === 1) {
              return (
                <h1 key={tIdx} id={hId} className="text-xl md:text-2xl font-extrabold text-white mt-5 mb-2 pb-1 border-b border-white/10 flex items-center gap-2">
                  <span className="text-cyan-400">#</span>
                  <span>{renderInline(token.text)}</span>
                </h1>
              );
            }
            if (token.level === 2) {
              return (
                <h2 key={tIdx} id={hId} className="text-lg md:text-xl font-bold text-cyan-200 mt-4 mb-2 pb-1 border-b border-white/[0.06] flex items-center gap-2">
                  <span className="text-cyan-500/80">##</span>
                  <span>{renderInline(token.text)}</span>
                </h2>
              );
            }
            if (token.level === 3) {
              return (
                <h3 key={tIdx} id={hId} className="text-base font-bold text-cyan-300 mt-3 mb-1 flex items-center gap-1.5">
                  <span className="text-cyan-400/70">###</span>
                  <span>{renderInline(token.text)}</span>
                </h3>
              );
            }
            return (
              <h4 key={tIdx} id={hId} className="text-sm font-bold text-slate-100 mt-2 mb-1">
                {renderInline(token.text)}
              </h4>
            );
          }

          case 'code_block':
            return <CodeBlock key={tIdx} lang={token.lang} code={token.code} isStreaming={isStreaming} />;

          case 'table':
            return (
              <TableRenderer
                key={tIdx}
                headers={token.headers}
                alignments={token.alignments}
                rows={token.rows}
                renderInline={renderInline}
              />
            );

          case 'alert':
            return (
              <AlertRenderer
                key={tIdx}
                type={token.alertType}
                title={token.title}
                lines={token.lines}
                renderInline={renderInline}
              />
            );

          case 'math_block':
            return <MathBlock key={tIdx} latex={token.latex} />;

          case 'blockquote':
            return (
              <blockquote
                key={tIdx}
                className="my-3 pl-4 py-1.5 border-l-4 border-cyan-400/60 bg-white/[0.02] rounded-r-xl text-slate-300 italic text-xs md:text-sm"
              >
                {token.lines.map((line, lIdx) => (
                  <p key={lIdx} className="my-0.5">{renderInline(line)}</p>
                ))}
              </blockquote>
            );

          case 'list': {
            const isTaskList = token.items.some(it => it.checked !== undefined);

            if (isTaskList) {
              return (
                <div key={tIdx} className="my-2.5 space-y-1.5 pl-1">
                  {token.items.map((item, itIdx) => (
                    <div key={itIdx} className="flex items-start gap-2 text-xs md:text-sm">
                      {item.checked ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                      )}
                      <span className={item.checked ? 'line-through text-slate-500' : 'text-slate-200'}>
                        {renderInline(item.text)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }

            if (token.ordered) {
              return (
                <ol key={tIdx} className="my-2.5 list-decimal list-outside ml-6 space-y-1 text-xs md:text-sm text-slate-200">
                  {token.items.map((item, itIdx) => (
                    <li key={itIdx} className="leading-relaxed">
                      {renderInline(item.text)}
                    </li>
                  ))}
                </ol>
              );
            }

            return (
              <ul key={tIdx} className="my-2.5 list-disc list-outside ml-6 space-y-1 text-xs md:text-sm text-slate-200 marker:text-cyan-400">
                {token.items.map((item, itIdx) => (
                  <li key={itIdx} className="leading-relaxed">
                    {renderInline(item.text)}
                  </li>
                ))}
              </ul>
            );
          }

          case 'hr':
            return (
              <hr
                key={tIdx}
                className="my-5 border-none h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"
              />
            );

          case 'details':
            return (
              <DetailsCard
                key={tIdx}
                summary={token.summary}
                body={token.body}
                defaultOpen={token.isOpenDefault}
                renderInline={renderInline}
              />
            );

          case 'paragraph':
          default:
            return (
              <p key={tIdx} className="my-1.5 leading-relaxed text-xs md:text-[14.5px] text-slate-200 whitespace-pre-line">
                {renderInline(token.text)}
              </p>
            );
        }
      })}

      {/* Streaming blinking cursor */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle rounded-sm shadow-[0_0_8px_#00f2fe]" />
      )}
    </div>
  );
};
export default MarkdownRenderer;
