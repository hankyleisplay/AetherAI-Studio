import React from 'react';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';

export interface ChartData {
  is_chart: boolean;
  type: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  values: number[];
  dataset_name?: string;
}

export const ChartWidget: React.FC<{ data: ChartData }> = ({ data }) => {
  const { type, title, labels, values, dataset_name = '數值' } = data;

  if (!labels || !values || labels.length === 0 || values.length === 0) {
    return null;
  }

  const maxVal = Math.max(...values, 1);
  const chartHeight = 160;
  const chartWidth = 460;
  const padding = 35;
  const usableWidth = chartWidth - padding * 2;
  const usableHeight = chartHeight - padding * 2;

  // Colors for gradients
  const colors = [
    'from-cyan-400 to-blue-500',
    'from-purple-400 to-pink-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-indigo-400 to-cyan-400',
    'from-rose-400 to-purple-500',
  ];

  return (
    <div className="my-3 rounded-2xl glass-panel p-4 border border-white/10 shadow-xl overflow-hidden max-w-lg">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-3 border-b border-white/[0.08] pb-2">
        <div className="flex items-center gap-2">
          {type === 'line' ? (
            <LineChartIcon className="w-4 h-4 text-cyan-400" />
          ) : type === 'pie' ? (
            <PieChartIcon className="w-4 h-4 text-purple-400" />
          ) : (
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-xs font-bold text-slate-100 tracking-wide">{title}</span>
        </div>
        <span className="text-[10px] text-cyan-400 font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
          {dataset_name}
        </span>
      </div>

      {/* Bar Chart Representation */}
      {type === 'bar' && (
        <div className="space-y-2 pt-1">
          {labels.map((label, idx) => {
            const val = values[idx] || 0;
            const pct = Math.min(Math.round((val / maxVal) * 100), 100);
            const colorClass = colors[idx % colors.length];

            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-300 truncate max-w-[200px]">{label}</span>
                  <span className="text-cyan-300 font-bold">{val.toLocaleString()}</span>
                </div>
                <div className="h-3.5 w-full rounded-full bg-black/40 overflow-hidden p-0.5 border border-white/5">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-700 shadow-sm`}
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Line Chart Representation (SVG) */}
      {type === 'line' && (
        <div className="pt-2">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-40 overflow-visible">
            {/* Grid lines */}
            <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.12)" />

            {/* Polyline Path */}
            {(() => {
              const points = values.map((val, idx) => {
                const x = padding + (idx / Math.max(values.length - 1, 1)) * usableWidth;
                const y = chartHeight - padding - (val / maxVal) * usableHeight;
                return `${x},${y}`;
              });
              return (
                <>
                  <polyline
                    fill="none"
                    stroke="#00f2fe"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points.join(' ')}
                    filter="drop-shadow(0 0 8px rgba(0,242,254,0.6))"
                  />
                  {/* Glowing Data Dots */}
                  {values.map((val, idx) => {
                    const x = padding + (idx / Math.max(values.length - 1, 1)) * usableWidth;
                    const y = chartHeight - padding - (val / maxVal) * usableHeight;
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r="4.5" fill="#00f2fe" stroke="#070a12" strokeWidth="2" />
                        <text x={x} y={y - 8} textAnchor="middle" fill="#a5f3fc" fontSize="9" fontFamily="monospace">
                          {val}
                        </text>
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>
          <div className="flex justify-between px-2 text-[10px] font-mono text-slate-400 mt-1">
            {labels.map((l, i) => (
              <span key={i} className="truncate max-w-[60px] text-center">{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Pie Chart Representation */}
      {type === 'pie' && (
        <div className="grid grid-cols-2 gap-2 pt-2 items-center">
          <div className="space-y-1.5">
            {labels.map((label, idx) => {
              const val = values[idx] || 0;
              const total = values.reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((val / total) * 100);
              const colorClass = colors[idx % colors.length];

              return (
                <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${colorClass} shrink-0`} />
                  <span className="truncate text-slate-300 flex-1">{label}</span>
                  <span className="font-mono text-cyan-300 font-bold">{pct}%</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            {/* Minimal SVG donut visualization */}
            <div className="relative w-28 h-28 rounded-full border-4 border-cyan-400/30 flex items-center justify-center bg-black/30 shadow-[0_0_20px_rgba(0,242,254,0.15)]">
              <span className="text-xs font-mono font-bold text-white text-center leading-tight">
                {values.reduce((a, b) => a + b, 0).toLocaleString()}
                <br />
                <span className="text-[9px] text-slate-400 font-normal">總計</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
