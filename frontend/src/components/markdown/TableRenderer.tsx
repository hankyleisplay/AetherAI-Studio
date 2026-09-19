import React from 'react';
import { TableAlignment } from './types';

interface TableRendererProps {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  renderInline: (text: string) => React.ReactNode;
}

export const TableRenderer: React.FC<TableRendererProps> = ({
  headers,
  alignments,
  rows,
  renderInline
}) => {
  const getAlignClass = (align?: TableAlignment) => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      case 'left':
      default:
        return 'text-left';
    }
  };

  return (
    <div className="my-4 rounded-2xl overflow-hidden glass-card border border-white/10 shadow-2xl backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs md:text-sm">
          {/* Table Header */}
          <thead>
            <tr className="bg-white/[0.06] border-b border-cyan-500/30">
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 font-bold text-cyan-300 tracking-wide ${getAlignClass(alignments[idx])}`}
                >
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`transition-colors duration-150 hover:bg-cyan-500/[0.08] ${
                  rIdx % 2 === 1 ? 'bg-white/[0.02]' : 'bg-transparent'
                }`}
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`px-4 py-2.5 text-slate-200 leading-relaxed ${getAlignClass(alignments[cIdx])}`}
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
