import React, { useState } from 'react';
import { 
  FolderGit2, 
  Plus, 
  X, 
  Code2, 
  Globe, 
  Check, 
  FileCode2, 
  FileText, 
  Loader2,
  FolderOpen
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface ProjectItem {
  name: string;
  path: string;
  file_count: number;
  updated_at: number;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectItem[];
  activeProject: string | null;
  onProjectCreated: (name: string) => void;
  onSelectProject: (name: string | null) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  activeProject,
  onProjectCreated,
  onSelectProject
}) => {
  const { t } = useI18n();
  const [projectName, setProjectName] = useState('');
  const [template, setTemplate] = useState<'python' | 'web' | 'node' | 'empty'>('python');
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanName) {
      setErrorMsg('請輸入有效的專案名稱 (僅支援英數字母、底線與連字號)');
      return;
    }

    setIsCreating(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          template: template
        })
      });

      if (res.ok) {
        const data = await res.json();
        onProjectCreated(data.project);
        setProjectName('');
        onClose();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || '建立專案失敗');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '連線錯誤');
    } finally {
      setIsCreating(false);
    }
  };

  const templates = [
    {
      id: 'python',
      title: 'Python 應用',
      desc: t('tpl_python', 'Python 應用 (main.py, requirements.txt)'),
      icon: <Code2 className="w-4 h-4 text-emerald-400" />,
      color: 'border-emerald-500/40 bg-emerald-500/10'
    },
    {
      id: 'web',
      title: '前端網頁',
      desc: t('tpl_web', '前端網頁應用 (HTML, CSS, JS)'),
      icon: <Globe className="w-4 h-4 text-cyan-400" />,
      color: 'border-cyan-500/40 bg-cyan-500/10'
    },
    {
      id: 'node',
      title: 'Node.js 模組',
      desc: t('tpl_node', 'Node.js 模組 (package.json, index.js)'),
      icon: <FileCode2 className="w-4 h-4 text-amber-400" />,
      color: 'border-amber-500/40 bg-amber-500/10'
    },
    {
      id: 'empty',
      title: '空白專案',
      desc: t('tpl_empty', '空白專案 (README.md)'),
      icon: <FileText className="w-4 h-4 text-indigo-400" />,
      color: 'border-indigo-500/40 bg-indigo-500/10'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl glass-modal rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('new_project_modal_title', '新建工程專案 (New Project)')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-mono">
                  Code Mode
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('projects_title', '工作區專案管理 (Projects)')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Create New Project Form */}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('new_project_name', '專案名稱 (英文字母、數字或底線)')}
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="例如: ai-data-crawler, vite-web-app"
                className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono text-white placeholder-slate-500 border border-white/15 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                autoFocus
              />
              {errorMsg && (
                <p className="text-xs text-rose-400 mt-1.5">{errorMsg}</p>
              )}
            </div>

            {/* Template Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {t('new_project_template', '初始樣板 (Starter Template)')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {templates.map((tpl) => {
                  const isSelected = template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTemplate(tpl.id as any)}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                        isSelected 
                          ? `${tpl.color} border-cyan-400 ring-1 ring-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]` 
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{tpl.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white flex items-center justify-between">
                          <span>{tpl.title}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                          {tpl.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isCreating || !projectName.trim()}
                className="w-full py-2.5 px-4 rounded-xl glass-button-primary text-xs font-semibold text-white flex items-center justify-center gap-2 shadow-lg hover:shadow-cyan-500/25 disabled:opacity-40 transition-all"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>建立中...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{t('btn_create_project', '立即建立並切換專案')}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Existing Projects Quick Switcher */}
          {projects.length > 0 && (
            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  {t('projects_title', '已存在專案列表')} ({projects.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectProject(null);
                    onClose();
                  }}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                    activeProject === null 
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  切換回工作區根目錄
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {projects.map((proj) => {
                  const isActive = activeProject === proj.name;
                  return (
                    <button
                      key={proj.name}
                      type="button"
                      onClick={() => {
                        onSelectProject(proj.name);
                        onClose();
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isActive
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-white/[0.03] border-white/10 hover:border-cyan-400/30 text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold truncate">
                            {proj.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {proj.file_count} 檔案
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-mono font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default ProjectModal;
