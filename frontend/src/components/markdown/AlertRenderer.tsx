import React from 'react';
import { 
  Info, 
  Lightbulb, 
  AlertCircle, 
  AlertTriangle, 
  ShieldAlert 
} from 'lucide-react';
import { AlertType } from './types';

interface AlertRendererProps {
  type: AlertType;
  title: string;
  lines: string[];
  renderInline: (text: string) => React.ReactNode;
}

export const AlertRenderer: React.FC<AlertRendererProps> = ({
  type,
  title,
  lines,
  renderInline
}) => {
  const getAlertConfig = (alertType: AlertType) => {
    switch (alertType) {
      case 'tip':
        return {
          icon: <Lightbulb className="w-4 h-4 text-emerald-400" />,
          containerClass: 'bg-emerald-950/25 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
          titleColor: 'text-emerald-300',
          defaultTitle: 'TIP (小技巧 / 最佳實踐)'
        };
      case 'important':
        return {
          icon: <AlertCircle className="w-4 h-4 text-purple-400" />,
          containerClass: 'bg-purple-950/25 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]',
          titleColor: 'text-purple-300',
          defaultTitle: 'IMPORTANT (關鍵重要規範)'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          containerClass: 'bg-amber-950/25 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]',
          titleColor: 'text-amber-300',
          defaultTitle: 'WARNING (警示注意)'
        };
      case 'caution':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
          containerClass: 'bg-rose-950/25 border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]',
          titleColor: 'text-rose-300',
          defaultTitle: 'CAUTION (高風險 / 破壞性操作)'
        };
      case 'note':
      default:
        return {
          icon: <Info className="w-4 h-4 text-cyan-400" />,
          containerClass: 'bg-sky-950/25 border-sky-500/40 shadow-[0_0_20px_rgba(14,165,233,0.15)]',
          titleColor: 'text-cyan-300',
          defaultTitle: 'NOTE (重點說明)'
        };
    }
  };

  const config = getAlertConfig(type);

  return (
    <div className={`my-4 p-4 rounded-2xl border backdrop-blur-xl ${config.containerClass}`}>
      <div className="flex items-center gap-2 mb-2">
        {config.icon}
        <span className={`text-xs font-bold tracking-wider uppercase ${config.titleColor}`}>
          {title || config.defaultTitle}
        </span>
      </div>
      <div className="space-y-1 text-xs md:text-sm text-slate-200 leading-relaxed pl-6">
        {lines.map((line, idx) => (
          <p key={idx}>{renderInline(line)}</p>
        ))}
      </div>
    </div>
  );
};
