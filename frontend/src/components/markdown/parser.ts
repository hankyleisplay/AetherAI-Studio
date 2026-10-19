import { 
  MarkdownBlockToken, 
  TableAlignment, 
  AlertType, 
  ListItem 
} from './types';

/**
 * Checks whether a markdown table delimiter row is valid (e.g. |---|:---:|---:| or ---|---).
 */
export function isTableDelimiter(str: string): boolean {
  const clean = str.trim();
  if (!clean.includes('-')) return false;
  return /^\|?(\s*:?-+:?\s*\|?)+\s*$/.test(clean);
}

/**
 * Checks whether a line starts a valid markdown table (has a header and a following delimiter row).
 */
export function isTableStart(lines: string[], i: number): boolean {
  if (i >= lines.length) return false;
  const line = lines[i].trim();
  if (!line.includes('|')) return false;
  if (i + 1 >= lines.length) return false;
  const next = lines[i + 1].trim();
  return isTableDelimiter(next);
}

/**
 * Parses markdown text into a structured array of block tokens.
 * Resilient to streaming tokens (e.g. unclosed code fences, tables, or math).
 */
export function parseMarkdown(text: string): MarkdownBlockToken[] {
  if (!text) return [];

  const tokens: MarkdownBlockToken[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const startI = i;
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Fenced Code Blocks (```lang ... ```)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      let closed = false;

      while (i < lines.length) {
        if (lines[i].trim().startsWith('```')) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }

      tokens.push({
        type: 'code_block',
        lang: lang || 'text',
        code: codeLines.join('\n'),
        isMermaid: ['mermaid', 'mmd'].includes(lang.toLowerCase())
      });
      continue;
    }

    // 2. Display Math Blocks ($$ ... $$ or \[ ... \] or \begin{equation} ... \end{equation})
    const isMathStart = trimmed.startsWith('$$') || trimmed.startsWith('\\[') || trimmed.startsWith('\\begin{equation}') || trimmed.startsWith('\\begin{align}');
    if (isMathStart) {
      let endMarker = '$$';
      let mathPrefixLen = 2;
      if (trimmed.startsWith('\\[')) {
        endMarker = '\\]';
        mathPrefixLen = 2;
      } else if (trimmed.startsWith('\\begin{equation}')) {
        endMarker = '\\end{equation}';
        mathPrefixLen = 16;
      } else if (trimmed.startsWith('\\begin{align}')) {
        endMarker = '\\end{align}';
        mathPrefixLen = 13;
      }

      const mathLines: string[] = [];
      const inlineMathAfter = trimmed.slice(mathPrefixLen);
      if (inlineMathAfter.endsWith(endMarker) && inlineMathAfter.length >= endMarker.length) {
        tokens.push({
          type: 'math_block',
          latex: inlineMathAfter.slice(0, -endMarker.length).trim()
        });
        i++;
        continue;
      }

      if (inlineMathAfter.trim()) {
        mathLines.push(inlineMathAfter.trim());
      }
      i++;

      while (i < lines.length) {
        const cur = lines[i].trim();
        if (cur.endsWith(endMarker)) {
          const content = cur.slice(0, -endMarker.length).trim();
          if (content) mathLines.push(content);
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }

      tokens.push({
        type: 'math_block',
        latex: mathLines.join('\n')
      });
      continue;
    }

    // 3. GitHub Callout Alerts (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
    const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*(.*))?$/i);
    if (alertMatch) {
      const alertType = alertMatch[1].toLowerCase() as AlertType;
      const title = alertMatch[2]?.trim() || '';
      const contentLines: string[] = [];
      i++;

      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        const alertLine = lines[i].trim().replace(/^>\s?/, '');
        contentLines.push(alertLine);
        i++;
      }

      tokens.push({
        type: 'alert',
        alertType,
        title,
        lines: contentLines
      });
      continue;
    }

    // 4. Standard Blockquotes (> quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        const qLine = lines[i].trim().replace(/^>\s?/, '');
        quoteLines.push(qLine);
        i++;
      }
      tokens.push({
        type: 'blockquote',
        lines: quoteLines
      });
      continue;
    }

    // 5. Tables (| col1 | col2 |)
    if (isTableStart(lines, i)) {
      const headerRow = trimmed;
      const alignRow = lines[i + 1].trim();

      const splitCells = (rowStr: string): string[] => {
        let r = rowStr.trim();
        if (r.startsWith('|')) r = r.slice(1);
        if (r.endsWith('|')) r = r.slice(0, -1);
        return r.split('|').map(c => c.trim());
      };

      const headers = splitCells(headerRow);
      const alignTokens = splitCells(alignRow);

      const alignments: TableAlignment[] = headers.map((_, idx) => {
        const a = alignTokens[idx] || '';
        const clean = a.trim();
        if (clean.startsWith(':') && clean.endsWith(':')) return 'center';
        if (clean.endsWith(':')) return 'right';
        return 'left';
      });

      const rows: string[][] = [];
      i += 2;

      while (
        i < lines.length && 
        lines[i].includes('|') && 
        !lines[i].trim().startsWith('```') && 
        !lines[i].trim().startsWith('#')
      ) {
        const rawCells = splitCells(lines[i]);
        while (rawCells.length < headers.length) {
          rawCells.push('');
        }
        rows.push(rawCells);
        i++;
      }

      tokens.push({
        type: 'table',
        headers,
        alignments,
        rows
      });
      continue;
    }

    // 6. Horizontal Rules (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }

    // 7. Headings (# H1, ## H2, ### H3, #### H4, ##### H5, ###### H6)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      tokens.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      i++;
      continue;
    }

    // 8. Lists (Unordered, Task Lists, Ordered)
    const taskMatch = trimmed.match(/^([-*+])\s+\[([ xX])\]\s+(.*)$/);
    const unorderedMatch = trimmed.match(/^([-*+])\s+(.*)$/);
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

    if (taskMatch || unorderedMatch || orderedMatch) {
      const isOrdered = !!orderedMatch && !taskMatch;
      const items: ListItem[] = [];

      while (i < lines.length) {
        const cur = lines[i].trim();
        const curTask = cur.match(/^([-*+])\s+\[([ xX])\]\s+(.*)$/);
        const curUnordered = cur.match(/^([-*+])\s+(.*)$/);
        const curOrdered = cur.match(/^(\d+)\.\s+(.*)$/);

        if (curTask) {
          items.push({
            checked: curTask[2].toLowerCase() === 'x',
            text: curTask[3]
          });
          i++;
        } else if (curUnordered && !isOrdered) {
          items.push({ text: curUnordered[2] });
          i++;
        } else if (curOrdered && isOrdered) {
          items.push({ text: curOrdered[2] });
          i++;
        } else {
          break;
        }
      }

      tokens.push({
        type: 'list',
        ordered: isOrdered,
        items
      });
      continue;
    }

    // 9. Paragraphs
    if (trimmed === '') {
      i++;
      continue;
    }

    // Gather consecutive non-empty lines into a paragraph
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().match(/^#{1,6}\s+/) &&
      !lines[i].trim().match(/^[-*+]\s+/) &&
      !lines[i].trim().match(/^\d+\.\s+/) &&
      !lines[i].trim().match(/^(\*{3,}|-{3,}|_{3,})$/) &&
      !isTableStart(lines, i)
    ) {
      pLines.push(lines[i]);
      i++;
    }

    if (pLines.length > 0) {
      tokens.push({
        type: 'paragraph',
        text: pLines.join('\n')
      });
    }

    // Emergency safeguard: if no parser rule advanced i, advance it by 1 line to prevent browser lockup
    if (i === startI) {
      tokens.push({
        type: 'paragraph',
        text: lines[i]
      });
      i++;
    }
  }

  return tokens;
}
