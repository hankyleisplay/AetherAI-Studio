import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MathBlockProps {
  latex: string;
}

export const renderMathFormula = (mathStr: string): string => {
  if (!mathStr) return '';
  let rendered = mathStr;

  // Handle matrices: \begin{matrix} a & b \\ c & d \end{matrix} or pmatrix or bmatrix
  const matrixRegex = /\\begin\{(matrix|pmatrix|bmatrix|vmatrix)\}([\s\S]*?)\\end\{\1\}/g;
  rendered = rendered.replace(matrixRegex, (_, type, body) => {
    const rows = body.trim().split('\\\\');
    const tableRows = rows.map((r: string) => {
      const cells = r.split('&').map((c: string) => `<td class="math-matrix-cell">${renderMathFormula(c.trim())}</td>`);
      return `<tr>${cells.join('')}</tr>`;
    }).join('');

    const bracketClass = type === 'pmatrix' ? 'math-paren' : type === 'bmatrix' ? 'math-bracket' : '';
    return `<span class="math-matrix ${bracketClass}"><table class="math-matrix-table">${tableRows}</table></span>`;
  });

  const mathSymbols: Record<string, string> = {
    // Arrows
    '\\rightarrow': '→',
    '\\leftarrow': '←',
    '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐',
    '\\Leftrightarrow': '⇔',
    '\\to': '→',
    '\\iff': '⟺',
    '\\implies': '⟹',
    '\\mapsto': '↦',

    // Relations & Logic
    '\\le': '≤',
    '\\leq': '≤',
    '\\ge': '≥',
    '\\geq': '≥',
    '\\ne': '≠',
    '\\neq': '≠',
    '\\approx': '≈',
    '\\sim': '∼',
    '\\equiv': '≡',
    '\\pm': '±',
    '\\mp': '∓',
    '\\times': '×',
    '\\div': '÷',
    '\\cdot': '·',
    '\\circ': '∘',
    '\\bullet': '•',
    '\\forall': '∀',
    '\\exists': '∃',
    '\\nexists': '∄',
    '\\neg': '¬',

    // Sets
    '\\in': '∈',
    '\\notin': '∉',
    '\\ni': '∋',
    '\\subset': '⊂',
    '\\supset': '⊃',
    '\\subseteq': '⊆',
    '\\supseteq': '⊇',
    '\\cup': '∪',
    '\\cap': '∩',
    '\\setminus': '∖',
    '\\emptyset': '∅',
    '\\mathbb{R}': 'ℝ',
    '\\mathbb{C}': 'ℂ',
    '\\mathbb{N}': 'ℕ',
    '\\mathbb{Z}': 'ℤ',
    '\\mathbb{Q}': 'ℚ',

    // Calculus & Physics
    '\\infty': '∞',
    '\\nabla': '∇',
    '\\partial': '∂',
    '\\sum': '<span class="math-large">∑</span>',
    '\\prod': '<span class="math-large">∏</span>',
    '\\int': '<span class="math-large">∫</span>',
    '\\iint': '<span class="math-large">∬</span>',
    '\\iiint': '<span class="math-large">∭</span>',
    '\\oint': '<span class="math-large">∮</span>',
    '\\lim': 'lim',

    // Lowercase Greek
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\epsilon': 'ε',
    '\\varepsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\theta': 'θ',
    '\\vartheta': 'ϑ',
    '\\iota': 'ι',
    '\\kappa': 'κ',
    '\\lambda': 'λ',
    '\\mu': 'μ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\pi': 'π',
    '\\varpi': 'ϖ',
    '\\rho': 'ρ',
    '\\varrho': 'ϱ',
    '\\sigma': 'σ',
    '\\varsigma': 'ς',
    '\\tau': 'τ',
    '\\upsilon': 'υ',
    '\\phi': 'φ',
    '\\varphi': 'ϕ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',

    // Uppercase Greek
    '\\Gamma': 'Γ',
    '\\Delta': 'Δ',
    '\\Theta': 'Θ',
    '\\Lambda': 'Λ',
    '\\Xi': 'Ξ',
    '\\Pi': 'Π',
    '\\Sigma': 'Σ',
    '\\Upsilon': 'Υ',
    '\\Phi': 'Φ',
    '\\Psi': 'Ψ',
    '\\Omega': 'Ω',
  };

  for (const [cmd, symbol] of Object.entries(mathSymbols)) {
    rendered = rendered.split(cmd).join(symbol);
  }

  // Fractions: \frac{a}{b}
  rendered = rendered.replace(
    /\\frac\{([^{}]+)\}\{([^{}]+)\}/g,
    '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>'
  );

  // Square roots: \sqrt{x} or \sqrt[n]{x}
  rendered = rendered.replace(
    /\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g,
    '<span class="math-sqrt"><sup class="math-root-index">$1</sup><span class="math-radicand">$2</span></span>'
  );
  rendered = rendered.replace(
    /\\sqrt\{([^{}]+)\}/g,
    '<span class="math-sqrt"><span class="math-radicand">$1</span></span>'
  );

  // Superscripts x^{y} or x^2
  rendered = rendered.replace(/\^{([^{}]+)}/g, '<sup class="math-sup">$1</sup>');
  rendered = rendered.replace(/\^([a-zA-Z0-9+\-−])/g, '<sup class="math-sup">$1</sup>');

  // Subscripts x_{y} or x_1
  rendered = rendered.replace(/_{([^{}]+)}/g, '<sub class="math-sub">$1</sub>');
  rendered = rendered.replace(/_([a-zA-Z0-9+\-−])/g, '<sub class="math-sub">$1</sub>');

  // Text formatting inside math: \text{...} or \mathbf{...}
  rendered = rendered.replace(/\\text\{([^{}]+)\}/g, '<span class="math-text">$1</span>');
  rendered = rendered.replace(/\\mathbf\{([^{}]+)\}/g, '<strong class="math-bold">$1</strong>');
  rendered = rendered.replace(/\\mathrm\{([^{}]+)\}/g, '<span class="math-roman">$1</span>');

  // Clean unparsed backslashes before regular alphabetic names
  rendered = rendered.replace(/\\([a-zA-Z]+)/g, '$1');

  return rendered;
};

export const MathBlock: React.FC<MathBlockProps> = ({ latex }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 relative group">
      <div
        className="math-block"
        dangerouslySetInnerHTML={{ __html: renderMathFormula(latex) }}
      />
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300 opacity-0 group-hover:opacity-100 transition-all text-xs flex items-center gap-1"
        title="複製 LaTeX 原始碼"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        <span className="text-[10px]">{copied ? '已複製' : 'LaTeX'}</span>
      </button>
    </div>
  );
};
