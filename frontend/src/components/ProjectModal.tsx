import React, { useState } from 'react';
import { 
  FolderGit2, Folder, 
  Plus, 
  X, 
  Code2, 
  Globe, 
  Check, 
  FileCode2, 
  FileText, 
  Loader2,
  FolderOpen,
  Terminal,
  ShieldCheck,
  Zap,
  Bot,
  Trash2
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { CodeExecutionMode } from '../types';

interface ProjectItem {
  name: string;
  path: string;
  custom?: boolean;
  file_count: number;
  updated_at: number;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectItem[];
  activeProject: string | null;
  codeExecutionMode?: CodeExecutionMode;
  onProjectCreated: (name: string, execMode: CodeExecutionMode) => void;
  onSelectProject: (name: string | null) => void;
  onSelectExecutionMode?: (mode: CodeExecutionMode) => void;
  onProjectRemoved?: (name: string) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  activeProject,
  codeExecutionMode = 'auto',
  onProjectCreated,
  onSelectProject,
  onSelectExecutionMode,
  onProjectRemoved
}) => {
  const { t } = useI18n();
  const [folderType, setFolderType] = useState<'workspace' | 'custom'>('workspace');
  const [customPath, setCustomPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [execMode, setExecMode] = useState<CodeExecutionMode>(codeExecutionMode);
  const [template, setTemplate] = useState<'python' | 'web' | 'node' | 'empty'>('python');
  const [isCreating, setIsCreating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isWebPickerOpen, setIsWebPickerOpen] = useState(false);
  const [webPickerCurrent, setWebPickerCurrent] = useState('');
  const [webPickerParent, setWebPickerParent] = useState<string | null>(null);
  const [webPickerItems, setWebPickerItems] = useState<Array<{ name: string; path: string; is_dir: boolean }>>([]);
  const [isWebPickerLoading, setIsWebPickerLoading] = useState(false);

  const loadWebPicker = async (targetPath: string = '') => {
    setIsWebPickerLoading(true);
    setErrorMsg('');
    try {
      const url = targetPath ? `/api/system/fs-browse?path=${encodeURIComponent(targetPath)}` : '/api/system/fs-browse';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWebPickerCurrent(data.current || '');
        setWebPickerParent(data.parent || null);
        setWebPickerItems(data.items || []);
        setIsWebPickerOpen(true);
      } else {
        setErrorMsg(t('dir_list_failed', '無法讀取目錄清單'));
      }
    } catch (e: any) {
      setErrorMsg(t('dir_read_failed', '目錄讀取失敗: {error}', { error: e.message }));
    } finally {
      setIsWebPickerLoading(false);
    }
  };

  const handleSelectWebDirectory = (dirPath: string, dirName?: string) => {
    setCustomPath(dirPath);
    setFolderType('custom');
    if (!projectName.trim() || projectName === customPath.split(/[\\/]/).pop()) {
      const name = dirName || dirPath.split(/[\\/]/).filter(Boolean).pop() || '';
      const clean = name.replace(/[^a-zA-Z0-9_\-]/g, '');
      if (clean) setProjectName(clean);
    }
    setIsWebPickerOpen(false);
  };


  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/projects/browse-folder', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.path) {
          setCustomPath(data.path);
          setFolderType('custom');
          if (!projectName.trim() || projectName === customPath.split(/[/\\]/).pop()) {
            const derivedName = data.name ? data.name.replace(/[^a-zA-Z0-9_\-]/g, '') : '';
            if (derivedName) {
              setProjectName(derivedName);
            }
          }
        }
      } else {
        setErrorMsg(t('folder_picker_unavailable', '無法開啟系統資料夾選取視窗'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || t('folder_picker_failed', '開啟資料夾選取視窗失敗'));
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, proj: ProjectItem) => {
    e.stopPropagation();
    const name = proj.name;
    if (!window.confirm(t('confirm_remove_project', '確定要從專案列表中移除「{name}」嗎？（本機實體檔案仍會保留）', { name }))) {
      return;
    }
    // Only projects created inside the app's workspace can also have their files deleted
    const deleteFiles = !proj.custom && window.confirm(
      t('confirm_delete_project_files', '是否也要永久刪除「{name}」在工作區中的所有檔案？此操作無法復原。按「取消」則只從列表移除。', { name })
    );
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}?delete_files=${deleteFiles}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.detail || t('operation_failed', '操作失敗: {error}', { error: String(res.status) }));
        return;
      }
      onProjectRemoved?.(name);
    } catch (err) {
      console.error('Failed to remove project:', err);
      setErrorMsg(t('operation_failed', '操作失敗: {error}', { error: String(err) }));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const derivedDefaultName = folderType === 'custom' && customPath 
      ? customPath.trim().split(/[/\\]/).filter(Boolean).pop()?.replace(/[^a-zA-Z0-9_\-]/g, '') || ''
      : '';
    const cleanName = (projectName.trim() || derivedDefaultName).replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!cleanName) {
      setErrorMsg(t('invalid_project_name', '請輸入有效的專案名稱 (僅支援英數字母、底線與連字號)'));
      return;
    }

    if (folderType === 'custom' && !customPath.trim()) {
      setErrorMsg(t('custom_path_required', '請輸入或以圖形介面瀏覽選取自訂本機資料夾路徑'));
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
          template: template,
          custom_path: folderType === 'custom' ? customPath.trim() : null
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (onSelectExecutionMode) {
          onSelectExecutionMode(execMode);
        }
        onProjectCreated(data.project, execMode);
        setProjectName('');
        setCustomPath('');
        onClose();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || t('create_project_failed', '建立專案失敗'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || t('network_error', '連線錯誤'));
    } finally {
      setIsCreating(false);
    }
  };

  const templates = [
    {
      id: 'python',
      title: t('tpl_python', 'Python 應用'),
      desc: t('tpl_python', 'Python 應用 (main.py, requirements.txt)'),
      icon: <Code2 className="w-4 h-4 text-emerald-400" />,
      color: 'border-emerald-500/40 bg-emerald-500/10'
    },
    {
      id: 'web',
      title: t('tpl_web', '前端網頁'),
      desc: t('tpl_web', '前端網頁應用 (HTML, CSS, JS)'),
      icon: <Globe className="w-4 h-4 text-cyan-400" />,
      color: 'border-cyan-500/40 bg-cyan-500/10'
    },
    {
      id: 'node',
      title: t('tpl_node', 'Node.js 模組'),
      desc: t('tpl_node', 'Node.js 模組 (package.json, index.js)'),
      icon: <FileCode2 className="w-4 h-4 text-amber-400" />,
      color: 'border-amber-500/40 bg-amber-500/10'
    },
    {
      id: 'empty',
      title: t('tpl_empty', '現有/空白專案'),
      desc: t('tpl_empty', '現有或空白專案 (保留現有檔案)'),
      icon: <FileText className="w-4 h-4 text-indigo-400" />,
      color: 'border-indigo-500/40 bg-indigo-500/10'
    }
  ];

  const executionModes = [
    {
      id: 'auto' as CodeExecutionMode,
      name: t('exec_mode_auto', 'Auto 模式'),
      badge: t('exec_mode_auto_badge', '全自動'),
      desc: t('exec_mode_auto_desc', 'AI 全自主讀寫程式碼、調用終端機執行測試並自動修復 bug，全程主動閉環解決任務。'),
      icon: <Bot className="w-4 h-4 text-emerald-400" />,
      borderActive: 'border-emerald-400 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40'
    },
    {
      id: 'accept_edit' as CodeExecutionMode,
      name: t('exec_mode_accept', 'Accept Edit 模式'),
      badge: t('exec_mode_accept_badge', '審查核准'),
      desc: t('exec_mode_accept_desc', '變更任何程式碼檔案前均呈現 Diff 與說明，主動請求確認，經您核准後才正式落地變更。'),
      icon: <ShieldCheck className="w-4 h-4 text-amber-400" />,
      borderActive: 'border-amber-400 bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40'
    },
    {
      id: 'turbo' as CodeExecutionMode,
      name: t('exec_mode_turbo', 'Turbo 模式'),
      badge: t('exec_mode_turbo_badge', '極速交付'),
      desc: t('exec_mode_turbo_desc', '精簡思考鋪陳與多餘客套，最大化輸出速度與 Token 吞吐量，以極速生成生產級程式碼。'),
      icon: <Zap className="w-4 h-4 text-fuchsia-400" />,
      borderActive: 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-400/40'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl glass-modal rounded-3xl border border-cyan-500/30 shadow-[0_0_60px_rgba(6,182,212,0.2)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shadow-sm">
              <Terminal className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('code_onboarding_title', '配置 Code 工程專案 (Code Mode)')}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('code_mode_desc', '直接在專案目錄下寫程式、讀取與修改檔案、執行終端指令、自主測試與除錯。')}
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
          <form onSubmit={handleCreate} className="space-y-5">
            {/* 1. 資料夾目錄選擇 */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-2">
                📁 1. {t('select_folder_type', '選擇專案工作目錄 (Project Directory)')}
              </label>
              
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setFolderType('workspace')}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                    folderType === 'workspace'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                      : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <FolderGit2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{t('folder_workspace_preset', '工作區目錄 (預設)')}</div>
                    <div className="text-[10px] text-slate-400 truncate">workspace/projects/</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFolderType('custom')}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                    folderType === 'custom'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                      : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{t('folder_custom_path', '自訂本機目錄路徑')}</div>
                    <div className="text-[10px] text-slate-400 truncate">{t('gui_picker_supported', '支援本機圖形介面選取')}</div>
                  </div>
                </button>
              </div>

              {folderType === 'custom' && (
                <div className="animate-in fade-in duration-150 mt-2 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      disabled={isBrowsing}
                      className="py-2.5 px-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                      title={t('gui_picker_tooltip', '呼叫 Windows 原生資料夾選擇視窗 (本機桌面可用)')}
                    >
                      {isBrowsing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                          <span>{t('gui_picker_opening', '開啟本機視窗中...')}</span>
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4 text-amber-400" />
                          <span>{t('gui_picker_btn', '📂 本機視窗選擇 (GUI Picker)')}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isWebPickerOpen) {
                          setIsWebPickerOpen(false);
                        } else {
                          loadWebPicker(customPath || '');
                        }
                      }}
                      className="py-2.5 px-3 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 hover:from-cyan-500/25 hover:to-indigo-500/25 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      title={t('web_picker_tooltip', '直接在網頁彈窗內瀏覽選取磁碟與資料夾 (手機與遠端連線專用)')}
                    >
                      <Globe className="w-4 h-4 text-cyan-400" />
                      <span>{isWebPickerOpen ? t('web_picker_collapse', '🔼 收合網頁目錄') : t('web_picker_open', '🌐 網頁樹狀目錄 (手機/遠端專用)')}</span>
                    </button>
                  </div>

                  {/* Web Folder Browser Panel */}
                  {isWebPickerOpen && (
                    <div className="p-3.5 rounded-2xl bg-black/60 border border-cyan-500/40 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                          <FolderOpen className="w-4 h-4 text-cyan-400" />
                          <span>{t('web_picker_current', '當前瀏覽：')}</span>
                          <span className="font-mono text-white truncate max-w-[200px] md:max-w-xs">{webPickerCurrent || t('web_picker_root', '根目錄 (磁碟機)')}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          {webPickerParent && (
                            <button
                              type="button"
                              onClick={() => loadWebPicker(webPickerParent)}
                              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold"
                            >
                              {t('web_picker_up', '⬆️ 上一層')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => loadWebPicker('')}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold"
                          >
                            {t('web_picker_drives', '🔄 磁碟機')}
                          </button>
                        </div>
                      </div>

                      {/* Folder Listing */}
                      <div className="max-h-48 overflow-y-auto rounded-xl bg-black/40 border border-white/10 p-1.5 space-y-1">
                        {isWebPickerLoading ? (
                          <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                            <span>{t('dir_loading', '讀取目錄中...')}</span>
                          </div>
                        ) : webPickerItems.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400">
                            {t('dir_no_subfolders', '此目錄下無子資料夾')}
                          </div>
                        ) : (
                          webPickerItems.map((item) => (
                            <div
                              key={item.path}
                              onClick={() => loadWebPicker(item.path)}
                              className="group p-2 rounded-lg hover:bg-cyan-500/20 text-xs text-slate-200 flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="font-mono truncate">{item.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectWebDirectory(item.path, item.name);
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[10px] font-bold opacity-80 group-hover:opacity-100 shrink-0"
                              >
                                {t('dir_select_this', '選定此夾')}
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {webPickerCurrent && (
                        <button
                          type="button"
                          onClick={() => handleSelectWebDirectory(webPickerCurrent)}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('dir_use_current', '✅ 將當前目錄「{name}」設為專案工作區', { name: webPickerCurrent.split(/[\\/]/).filter(Boolean).pop() || '' })}</span>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type="text"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      placeholder={t('custom_path_placeholder', '已選擇之本機目錄絕對路徑 (亦可直接在此貼上或修改路徑)')}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono text-white placeholder-slate-500 border border-amber-500/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {t('custom_path_hint', '💡 系統將直接以此目錄作為專案核心，所有代碼讀寫與終端機指令均直接在此目錄執行。')}
                  </p>
                </div>
              )}
            </div>

            {/* 2. Project 名稱設定 */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                🏷️ 2. {t('project_name_input', '專案名稱 (Project Name)')}
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('project_name_placeholder', '例如: ai-data-crawler, my-web-app, backend-api')}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono text-white placeholder-slate-500 border border-white/15 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                autoFocus
              />
              {errorMsg && (
                <p className="text-xs text-rose-400 mt-1.5">{errorMsg}</p>
              )}
            </div>

            {/* 3. 執行模式選擇 (Auto / Accept Edit / Turbo) */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-2">
                ⚙️ 3. {t('execution_mode_title', '選擇 Code 執行模式 (Execution Mode)')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {executionModes.map((m) => {
                  const isSelected = execMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setExecMode(m.id)}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? m.borderActive
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          {m.icon}
                          <span>{m.name}</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          isSelected ? 'bg-white/20' : 'bg-white/5 text-slate-400'
                        }`}>
                          {m.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {m.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. 初始樣板 */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                📦 4. {t('new_project_template', '初始樣板 (Starter Template)')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {templates.map((tpl) => {
                  const isSelected = template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTemplate(tpl.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex flex-col items-start gap-1 ${
                        isSelected 
                          ? `${tpl.color} border-cyan-400 ring-1 ring-cyan-400/40 shadow-sm` 
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        {tpl.icon}
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <div className="text-xs font-bold text-white mt-1">
                        {tpl.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isCreating || (!projectName.trim() && !customPath.trim())}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-xs font-bold text-white flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.3)] disabled:opacity-40 transition-all"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{t('creating_project', '正在建立並初始化專案...')}</span>
                  </>
                ) : (
                  <>
                    <Terminal className="w-4 h-4 text-emerald-100" />
                    <span>{t('btn_launch_code_mode', '🚀 啟動 Code 專案並開啟終端機')}</span>
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
                  {t('switch_to_workspace_root', '切換回工作區根目錄')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {projects.map((proj) => {
                  const isActive = activeProject === proj.name;
                  return (
                    <div
                      key={proj.name}
                      onClick={() => {
                        onSelectProject(proj.name);
                        onClose();
                      }}
                      className={`group p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
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
                          <div className="text-[10px] text-slate-500 truncate" title={proj.path}>
                            {t('project_file_count', '{count} 檔案', { count: proj.file_count })} • {proj.path}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive && (
                          <span className="text-[10px] font-mono font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                            ACTIVE
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteProject(e, proj)}
                          title={t('remove_project', '從專案列表移除')}
                          className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
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
