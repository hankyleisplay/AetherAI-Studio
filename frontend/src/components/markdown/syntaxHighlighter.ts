export interface HighlightedSpan {
  text: string;
  className: string;
}

export type HighlightedLine = HighlightedSpan[];

const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  python: new Set([
    'def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'for', 'while',
    'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue',
    'raise', 'global', 'nonlocal', 'assert', 'async', 'await', 'in', 'is', 'not', 'and', 'or'
  ]),
  javascript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw',
    'class', 'extends', 'import', 'export', 'from', 'as', 'new', 'this', 'super',
    'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete'
  ]),
  typescript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw',
    'class', 'extends', 'import', 'export', 'from', 'as', 'new', 'this', 'super',
    'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete',
    'type', 'interface', 'enum', 'namespace', 'implements', 'declare', 'abstract',
    'readonly', 'keyof', 'is', 'never', 'any', 'unknown', 'string', 'number', 'boolean'
  ]),
  bash: new Set([
    'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until', 'do', 'done',
    'in', 'function', 'select', 'time', 'echo', 'cd', 'export', 'source', 'alias', 'set',
    'unset', 'chmod', 'chown', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'curl', 'wget', 'sudo'
  ]),
  sql: new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'DROP', 'ALTER', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
    'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL',
    'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY'
  ]),
  rust: new Set([
    'fn', 'let', 'mut', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'match',
    'if', 'else', 'for', 'while', 'loop', 'return', 'break', 'continue', 'async', 'await',
    'move', 'ref', 'unsafe', 'where', 'type', 'const', 'static', 'self', 'Self'
  ]),
  go: new Set([
    'func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'return',
    'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go',
    'chan', 'defer', 'select', 'map'
  ])
};

const BUILTINS_BY_LANG: Record<string, Set<string>> = {
  python: new Set([
    'True', 'False', 'None', 'print', 'len', 'range', 'int', 'str', 'float', 'bool',
    'list', 'dict', 'set', 'tuple', 'open', 'type', 'isinstance', 'enumerate', 'zip', 'map', 'filter', 'sum'
  ]),
  javascript: new Set([
    'true', 'false', 'null', 'undefined', 'console', 'window', 'document', 'Math', 'JSON',
    'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Map', 'Set'
  ]),
  typescript: new Set([
    'true', 'false', 'null', 'undefined', 'console', 'window', 'document', 'Math', 'JSON',
    'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Map', 'Set'
  ]),
  rust: new Set(['true', 'false', 'Some', 'None', 'Ok', 'Err', 'println', 'format', 'vec', 'String', 'Option', 'Result']),
  go: new Set(['true', 'false', 'nil', 'make', 'new', 'len', 'cap', 'append', 'panic', 'recover', 'fmt'])
};

/**
 * Normalizes language name
 */
export function normalizeLanguage(lang: string): string {
  const clean = (lang || '').trim().toLowerCase();
  if (['py', 'python', 'python3'].includes(clean)) return 'python';
  if (['js', 'javascript', 'mjs', 'cjs'].includes(clean)) return 'javascript';
  if (['ts', 'typescript', 'tsx'].includes(clean)) return 'typescript';
  if (['sh', 'bash', 'zsh', 'shell'].includes(clean)) return 'bash';
  if (['sql', 'mysql', 'postgres', 'sqlite'].includes(clean)) return 'sql';
  if (['rs', 'rust'].includes(clean)) return 'rust';
  if (['golang', 'go'].includes(clean)) return 'go';
  if (['json', 'jsonc'].includes(clean)) return 'json';
  if (['yaml', 'yml'].includes(clean)) return 'yaml';
  if (['html', 'xml', 'svg'].includes(clean)) return 'html';
  if (['css', 'scss', 'sass', 'less'].includes(clean)) return 'css';
  if (['md', 'markdown'].includes(clean)) return 'markdown';
  if (['mermaid', 'mmd'].includes(clean)) return 'mermaid';
  return clean || 'text';
}

/**
 * High-performance line-by-line syntax tokenizer
 */
export function highlightLine(line: string, lang: string): HighlightedSpan[] {
  const normLang = normalizeLanguage(lang);
  if (!line) {
    return [{ text: '', className: '' }];
  }

  // Handle comments first
  if (['python', 'bash', 'yaml'].includes(normLang) && line.trim().startsWith('#')) {
    return [{ text: line, className: 'text-slate-500 italic' }];
  }
  if (['javascript', 'typescript', 'rust', 'go'].includes(normLang) && line.trim().startsWith('//')) {
    return [{ text: line, className: 'text-slate-500 italic' }];
  }
  if (normLang === 'sql' && line.trim().startsWith('--')) {
    return [{ text: line, className: 'text-slate-500 italic' }];
  }

  const keywords = KEYWORDS_BY_LANG[normLang] || KEYWORDS_BY_LANG['javascript'];
  const builtins = BUILTINS_BY_LANG[normLang] || BUILTINS_BY_LANG['javascript'];

  const spans: HighlightedSpan[] = [];
  // Tokenize using regex: comments, strings, identifiers, numbers, operators, decorators
  const tokenRegex = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|@[a-zA-Z0-9_.]+|0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[!=<>]=?|&&|\|\||=>|->|[{}()[\];,.:?+\-*/%^&|~]|\s+)/g;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    const token = match[0];

    // Comments
    if (token.startsWith('//') || (['python', 'bash', 'yaml'].includes(normLang) && token.startsWith('#')) || token.startsWith('--')) {
      spans.push({ text: token, className: 'text-slate-500 italic' });
    }
    // Strings
    else if ((token.startsWith('"') && token.endsWith('"')) || 
             (token.startsWith("'") && token.endsWith("'")) || 
             (token.startsWith('`') && token.endsWith('`'))) {
      spans.push({ text: token, className: 'text-emerald-300' });
    }
    // Decorators (@app.get)
    else if (token.startsWith('@')) {
      spans.push({ text: token, className: 'text-cyan-400 font-semibold' });
    }
    // Numbers
    else if (/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(token)) {
      spans.push({ text: token, className: 'text-amber-300' });
    }
    // Keywords
    else if (keywords.has(token) || (normLang === 'sql' && keywords.has(token.toUpperCase()))) {
      spans.push({ text: token, className: 'text-purple-400 font-semibold' });
    }
    // Builtins / Booleans
    else if (builtins.has(token)) {
      spans.push({ text: token, className: 'text-cyan-300 font-medium' });
    }
    // Functions (word followed by '(')
    else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(token)) {
      const remaining = line.slice(tokenRegex.lastIndex).trimStart();
      if (remaining.startsWith('(')) {
        spans.push({ text: token, className: 'text-sky-300 font-medium' });
      } else {
        spans.push({ text: token, className: 'text-slate-200' });
      }
    }
    // Operators
    else if (/^[!=<>]=?|&&|\|\||=>|->|[+\-*/%^&|~]=?$/.test(token)) {
      spans.push({ text: token, className: 'text-pink-400' });
    }
    // Delimiters / Punctuation / Whitespace
    else {
      spans.push({ text: token, className: 'text-slate-300' });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Remainder if any
  if (lastIndex < line.length) {
    spans.push({ text: line.slice(lastIndex), className: 'text-slate-300' });
  }

  return spans.length > 0 ? spans : [{ text: line, className: 'text-slate-200' }];
}
