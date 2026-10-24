import React from 'react';

interface DiffViewProps {
  diff: string;
  maxHeightClass?: string;
}

// Unified diff with per-line colouring and old/new line numbers from the hunk headers
export const DiffView: React.FC<DiffViewProps> = ({ diff, maxHeightClass = 'max-h-80' }) => {
  const rows: { kind: 'hunk' | 'add' | 'del' | 'ctx'; text: string; oldNo?: number; newNo?: number }[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldNo = parseInt(hunk[1], 10);
      newNo = parseInt(hunk[2], 10);
      rows.push({ kind: 'hunk', text: line });
    } else if (line.startsWith('+')) {
      rows.push({ kind: 'add', text: line.slice(1), newNo: newNo++ });
    } else if (line.startsWith('-')) {
      rows.push({ kind: 'del', text: line.slice(1), oldNo: oldNo++ });
    } else {
      rows.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line, oldNo: oldNo++, newNo: newNo++ });
    }
  }

  if (rows.length === 0) {
    return <div className="text-[11px] text-slate-400 italic px-2 py-1.5">(no changes)</div>;
  }

  return (
    <div className={`rounded-lg border border-white/10 bg-black/40 overflow-auto ${maxHeightClass}`}>
      <table className="w-full border-collapse font-mono text-[11px] leading-[1.45]">
        <tbody>
          {rows.map((r, i) =>
            r.kind === 'hunk' ? (
              <tr key={i} className="bg-cyan-500/10 text-cyan-300/80">
                <td colSpan={3} className="px-2 py-0.5 select-none">{r.text}</td>
              </tr>
            ) : (
              <tr
                key={i}
                className={
                  r.kind === 'add' ? 'bg-emerald-500/15 text-emerald-200'
                  : r.kind === 'del' ? 'bg-rose-500/15 text-rose-200'
                  : 'text-slate-300'
                }
              >
                <td className="w-9 px-1.5 text-right text-slate-500 select-none align-top">{r.oldNo ?? ''}</td>
                <td className="w-9 px-1.5 text-right text-slate-500 select-none align-top">{r.newNo ?? ''}</td>
                <td className="px-2 whitespace-pre-wrap break-all">
                  <span className="select-none opacity-60 mr-1">{r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}</span>
                  {r.text}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DiffView;
