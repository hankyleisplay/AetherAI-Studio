export type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export type TableAlignment = 'left' | 'center' | 'right';

export interface TableToken {
  type: 'table';
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
}

export interface HeadingToken {
  type: 'heading';
  level: number;
  text: string;
}

export interface CodeBlockToken {
  type: 'code_block';
  lang: string;
  code: string;
  isMermaid: boolean;
}

export interface AlertToken {
  type: 'alert';
  alertType: AlertType;
  title: string;
  lines: string[];
}

export interface BlockquoteToken {
  type: 'blockquote';
  lines: string[];
}

export interface ListItem {
  text: string;
  checked?: boolean; // If task list item
}

export interface ListToken {
  type: 'list';
  ordered: boolean;
  start?: number;
  items: ListItem[];
}

export interface MathBlockToken {
  type: 'math_block';
  latex: string;
}

export interface HorizontalRuleToken {
  type: 'hr';
}

export interface ParagraphToken {
  type: 'paragraph';
  text: string;
}

export type MarkdownBlockToken =
  | HeadingToken
  | CodeBlockToken
  | TableToken
  | AlertToken
  | BlockquoteToken
  | ListToken
  | MathBlockToken
  | HorizontalRuleToken
  | ParagraphToken;
