import React, { useState, useMemo } from 'react';
import { Eye, Code, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MermaidRendererProps {
  code: string;
}

interface ParsedNode {
  id: string;
  label: string;
  shape: 'rect' | 'round' | 'rhombus' | 'circle' | 'db';
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  style: 'solid' | 'dashed' | 'thick';
}

interface ParsedSequenceMessage {
  from: string;
  to: string;
  text: string;
  isDashed: boolean;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code }) => {
  const [activeTab, setActiveTab] = useState<'diagram' | 'code'>('diagram');
  const [zoom, setZoom] = useState(1);

  // Parse diagram structure
  const diagramData = useMemo(() => {
    const lines = code
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('%%'));

    if (lines.length === 0) return null;

    const firstLine = lines[0].toLowerCase();
    const isSequence = firstLine.startsWith('sequencediagram');
    const isGraph = firstLine.startsWith('graph') || firstLine.startsWith('flowchart');
    const isLR = firstLine.includes('lr') || firstLine.includes('rl');

    if (isSequence) {
      // Sequence Diagram parsing
      const participants: string[] = [];
      const messages: ParsedSequenceMessage[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().startsWith('participant')) {
          const name = line.replace(/participant/i, '').trim();
          if (name && !participants.includes(name)) participants.push(name);
          continue;
        }

        // Match sequence arrows: Alice->>Bob: Hello or Bob-->>Alice: Hi
        const seqMatch = line.match(/^([a-zA-Z0-9_]+)\s*(-+>>|-->>|->|-->)\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
        if (seqMatch) {
          const [, from, arrow, to, text] = seqMatch;
          if (!participants.includes(from)) participants.push(from);
          if (!participants.includes(to)) participants.push(to);
          messages.push({
            from,
            to,
            text,
            isDashed: arrow.includes('--')
          });
        }
      }

      return {
        type: 'sequence' as const,
        participants,
        messages
      };
    }

    if (isGraph || lines.length > 0) {
      // Flowchart / Graph parsing
      const nodeMap = new Map<string, { label: string; shape: ParsedNode['shape'] }>();
      const edges: ParsedEdge[] = [];

      const parseNodeMatch = (str: string): string => {
        // e.g. A[Label], A(Round), A{Decision}, A((Circle)), A[(Database)]
        const m = str.match(/^([a-zA-Z0-9_]+)(?:\[\((.*?)\)\]|\[(.*?)\]|\((.*?)\)|\{(.*?)\}|\(\((.*?)\)\))?$/);
        if (m) {
          const id = m[1];
          let label = id;
          let shape: ParsedNode['shape'] = 'rect';

          if (m[2] !== undefined) { label = m[2]; shape = 'db'; }
          else if (m[3] !== undefined) { label = m[3]; shape = 'rect'; }
          else if (m[4] !== undefined) { label = m[4]; shape = 'round'; }
          else if (m[5] !== undefined) { label = m[5]; shape = 'rhombus'; }
          else if (m[6] !== undefined) { label = m[6]; shape = 'circle'; }

          if (!nodeMap.has(id)) {
            nodeMap.set(id, { label: label || id, shape });
          }
          return id;
        }
        return str;
      };

      for (const line of lines) {
        if (line.toLowerCase().startsWith('graph') || line.toLowerCase().startsWith('flowchart')) continue;
        if (line.toLowerCase().startsWith('subgraph') || line.toLowerCase().startsWith('end')) continue;

        // Match edges: A --> B or A -->|text| B or A -.-> B or A ==> B
        const edgeMatch = line.match(/(.+?)\s*(-->|==>|-\.->|---|-->\|(.*?)\|)\s*(.+)/);
        if (edgeMatch) {
          const rawFrom = edgeMatch[1].trim();
          const arrow = edgeMatch[2];
          const edgeLabel = edgeMatch[3] || undefined;
          const rawTo = edgeMatch[4].trim();

          const fromId = parseNodeMatch(rawFrom);
          const toId = parseNodeMatch(rawTo);

          let style: ParsedEdge['style'] = 'solid';
          if (arrow.includes('-.-')) style = 'dashed';
          if (arrow.includes('==')) style = 'thick';

          edges.push({ from: fromId, to: toId, label: edgeLabel, style });
        } else {
          parseNodeMatch(line);
        }
      }

      // Compute simple dynamic layout
      const nodeIds = Array.from(nodeMap.keys());
      if (nodeIds.length === 0) return null;

      const nodes: ParsedNode[] = [];
      const nodeWidth = 140;
      const nodeHeight = 54;
      const gapX = isLR ? 190 : 160;
      const gapY = isLR ? 90 : 100;

      // Assign grid layers
      const layers: string[][] = [];
      const inDegree = new Map<string, number>();
      nodeIds.forEach(id => inDegree.set(id, 0));
      edges.forEach(e => inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1));

      const roots = nodeIds.filter(id => (inDegree.get(id) || 0) === 0);
      layers.push(roots.length > 0 ? roots : [nodeIds[0]]);

      const placed = new Set<string>(layers[0]);
      while (placed.size < nodeIds.length) {
        const nextLayer: string[] = [];
        for (const e of edges) {
          if (placed.has(e.from) && !placed.has(e.to)) {
            if (!nextLayer.includes(e.to)) {
              nextLayer.push(e.to);
            }
          }
        }
        if (nextLayer.length === 0) {
          // Add remaining orphan nodes
          const remaining = nodeIds.filter(id => !placed.has(id));
          if (remaining.length > 0) nextLayer.push(remaining[0]);
        }
        nextLayer.forEach(id => placed.add(id));
        layers.push(nextLayer);
      }

      layers.forEach((layer, layerIdx) => {
        layer.forEach((id, rowIdx) => {
          const info = nodeMap.get(id) || { label: id, shape: 'rect' };
          let x = 0;
          let y = 0;

          if (isLR) {
            x = 40 + layerIdx * gapX;
            y = 40 + rowIdx * gapY;
          } else {
            const rowOffset = (Math.max(...layers.map(l => l.length)) - layer.length) * (nodeWidth / 2);
            x = 40 + rowOffset + rowIdx * gapX;
            y = 40 + layerIdx * gapY;
          }

          nodes.push({
            id,
            label: info.label,
            shape: info.shape,
            x,
            y,
            width: nodeWidth,
            height: nodeHeight
          });
        });
      });

      const maxX = Math.max(...nodes.map(n => n.x + n.width), 320) + 60;
      const maxY = Math.max(...nodes.map(n => n.y + n.height), 220) + 60;

      return {
        type: 'flowchart' as const,
        nodes,
        edges,
        width: maxX,
        height: maxY
      };
    }

    return null;
  }, [code]);

  const handleDownloadSvg = () => {
    const svgEl = document.querySelector(`#mermaid-svg-${Math.abs(code.length)}`);
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-4 rounded-2xl glass-card border border-white/10 overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Top Header Controls Bar */}
      <div className="px-4 py-2 bg-white/[0.04] border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('diagram')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'diagram'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>視覺圖表</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'code'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>原始語法</span>
          </button>
        </div>

        {activeTab === 'diagram' && diagramData && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-white"
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.8, z + 0.15))}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-white"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-white"
              title="重設大小"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-[1px] bg-white/10 mx-1" />
            <button
              onClick={handleDownloadSvg}
              className="p-1.5 rounded-lg glass-button text-slate-400 hover:text-cyan-300"
              title="下載 SVG 圖形"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Display Body */}
      {activeTab === 'diagram' ? (
        <div className="p-4 md:p-6 overflow-x-auto flex justify-center items-center bg-black/40 min-h-[220px]">
          {diagramData && diagramData.type === 'flowchart' ? (
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="transition-transform duration-200"
            >
              <svg
                id={`mermaid-svg-${Math.abs(code.length)}`}
                width={diagramData.width}
                height={diagramData.height}
                className="overflow-visible"
              >
                <defs>
                  {/* Arrow marker */}
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#00f2fe" />
                  </marker>
                  {/* Glow filter */}
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Render Edges */}
                {diagramData.edges.map((e, idx) => {
                  const fromNode = diagramData.nodes.find(n => n.id === e.from);
                  const toNode = diagramData.nodes.find(n => n.id === e.to);
                  if (!fromNode || !toNode) return null;

                  const x1 = fromNode.x + fromNode.width / 2;
                  const y1 = fromNode.y + fromNode.height;
                  const x2 = toNode.x + toNode.width / 2;
                  const y2 = toNode.y;

                  // Curved path
                  const midY = (y1 + y2) / 2;
                  const pathData = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                  return (
                    <g key={idx}>
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#00f2fe"
                        strokeWidth={e.style === 'thick' ? '3' : '2'}
                        strokeDasharray={e.style === 'dashed' ? '5,5' : undefined}
                        strokeOpacity="0.75"
                        markerEnd="url(#arrowhead)"
                      />
                      {e.label && (
                        <text
                          x={(x1 + x2) / 2}
                          y={midY - 4}
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="10"
                          fontFamily="monospace"
                          className="bg-black/60 px-1"
                        >
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {diagramData.nodes.map((node) => (
                  <g key={node.id} className="cursor-pointer group">
                    {/* Glowing background */}
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx={node.shape === 'round' ? 24 : node.shape === 'circle' ? node.height / 2 : 12}
                      fill="#0d1829"
                      fillOpacity="0.85"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                      className="group-hover:stroke-[#00f2fe] group-hover:stroke-2 transition-all shadow-lg"
                    />

                    {/* Database top cap indicator */}
                    {node.shape === 'db' && (
                      <ellipse
                        cx={node.x + node.width / 2}
                        cy={node.y + 10}
                        rx={node.width / 2 - 8}
                        ry="6"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                      />
                    )}

                    {/* Text Label */}
                    <text
                      x={node.x + node.width / 2}
                      y={node.y + node.height / 2 + 4}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="12"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          ) : diagramData && diagramData.type === 'sequence' ? (
            /* Sequence Diagram Rendering */
            <div className="w-full max-w-lg space-y-4 py-2">
              <div className="flex justify-around border-b border-white/10 pb-3">
                {diagramData.participants.map((p, idx) => (
                  <div key={idx} className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-semibold">
                    {p}
                  </div>
                ))}
              </div>
              <div className="space-y-3 px-2">
                {diagramData.messages.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-cyan-400 font-bold">{m.from}</span>
                    <div className="flex-1 flex items-center gap-1 border-b border-dashed border-cyan-400/50 pb-1">
                      <span className="text-[11px] text-slate-300 mx-auto bg-black/40 px-2 py-0.5 rounded">
                        {m.text}
                      </span>
                      <span className="text-cyan-400 font-bold">→</span>
                    </div>
                    <span className="text-purple-300 font-bold">{m.to}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-xs font-mono py-8">
              無法自動解析此 Mermaid 語法結構，請切換至「原始語法」檢視。
            </div>
          )}
        </div>
      ) : (
        <pre className="p-4 bg-black/50 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
};
