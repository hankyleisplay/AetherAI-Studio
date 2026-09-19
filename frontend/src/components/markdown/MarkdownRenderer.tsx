import React, { useMemo } from 'react';
import { ExternalLink, CheckSquare, Square } from 'lucide-react';
import { parseMarkdown } from './parser';
import { CodeBlock } from './CodeBlock';
import { TableRenderer } from './TableRenderer';
import { AlertRenderer } from './AlertRenderer';
import { MathBlock, renderMathFormula } from './MathRenderer';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isStreaming }) => {
  const tokens = useMemo(() => parseMarkdown(content), [content]);

  // Comprehensive inline spans parser
  const renderInline = (text: string): React.ReactNode => {
    if (!text) return null;

    // Tokenize inline markdown: links [text](url), images ![alt](url), math $...$, code `...`, bold **...**, strikethrough ~~...~~, italic *...*
    const inlineRegex = /(!?\[.*?\]\(.*?\)|(?:\$[^$\n]+?\$)|(?:`[^`\n]+?`)|(?:\*\*[^*\n]+?\*\*)|(?:~~[^~\n]+?~~)|(?:\*[^*\n]+?\*)|(?:_[^_\n]+?_))/g;

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

      // Inline LaTeX Math: $...$
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2 && !part.slice(1, -1).includes('$')) {
        const formula = part.slice(1, -1);
        return (
          <span
            key={idx}
            className="math-inline"
            dangerouslySetInnerHTML={{ __html: renderMathFormula(formula) }}
          />
        );
      }

      // Inline Code: `...`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-white/[0.08] text-cyan-300 font-mono text-xs border border-white/10"
          >
            {part.slice(1, -1)}
          </code>
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
            return <CodeBlock key={tIdx} lang={token.lang} code={token.code} />;

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
