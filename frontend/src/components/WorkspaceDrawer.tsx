import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, FileText, Code2, GitBranch, GitCommit, UploadCloud, Edit3, Save, CheckCircle2, Image as ImageIcon, FileSpreadsheet, 
  File, Eye, Download, Trash2, Sparkles, X, RotateCw, Search,
  ExternalLink, Check, Copy
} from 'lucide-react';
import { WorkspaceFile } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAskAgent: (filePath: string) => void;
  activeProject?: string | null;
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  isOpen,
  onClose,
  onAskAgent,
  activeProject
}) => {
  const { t } = useI18n();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Preview Modal State
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // In-Studio Code Editor State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Git Panel State
  const [drawerTab, setDrawerTab] = useState<'files' | 'git'>('files');
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [isGitLoading, setIsGitLoading] = useState<boolean>(false);
  const [commitMsg, setCommitMsg] = useState<string>('');
  const [isAiCommitLoading, setIsAiCommitLoading] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [gitNotice, setGitNotice] = useState<string>('');

  const fetchGitStatus = async () => {
    setIsGitLoading(true);
    setGitNotice('');
    try {
      const res = await fetch(`/api/git/status?project=${encodeURIComponent(activeProject || '')}`);
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
      }
    } catch (err: any) {
      console.error('Git status error:', err);
    } finally {
      setIsGitLoading(false);
    }
  };

  const handleGenerateAiCommit = async () => {
    setIsAiCommitLoading(true);
    setGitNotice('');
    try {
      const res = await fetch('/api/git/ai-commit-msg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: activeProject })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.commit_message) {
          setCommitMsg(data.commit_message);
        }
      }
    } catch (err: any) {
      setGitNotice(t('ai_generate_failed', 'AI 生成失敗: {error}', { error: err.message }));
    } finally {
      setIsAiCommitLoading(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMsg.trim()) {
      setGitNotice(t('commit_msg_required', '請先輸入或生成 Commit 訊息'));
      return;
    }
    setIsPushing(true);
    setGitNotice('');
    try {
      const commitRes = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg.trim(), stage_all: true, project: activeProject })
      });
      if (!commitRes.ok) {
        const err = await commitRes.json().catch(() => ({}));
        throw new Error(err.detail || t('commit_failed', 'Commit 失敗'));
      }
      const pushRes = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: activeProject })
      });
      if (!pushRes.ok) {
        const err = await pushRes.json().catch(() => ({}));
        throw new Error(err.detail || t('push_failed', 'Push 失敗'));
      }
      setGitNotice(t('push_success', '🎉 成功提交並推送至 GitHub 遠端版本庫！'));
      setCommitMsg('');
      fetchGitStatus();
    } catch (err: any) {
      setGitNotice(t('operation_failed', '操作失敗: {error}', { error: err.message }));
    } finally {
      setIsPushing(false);
    }
  };

  const handleSaveFile = async () => {
    if (!previewFile) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: previewFile.path, content: editContent })
      });
      if (res.ok) {
        setPreviewContent(editContent);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        fetchFiles();
      } else {
        alert(t('save_file_failed', '儲存檔案失敗'));
      }
    } catch (err: any) {
      alert(`${t('save_failed', '儲存失敗')}: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };


  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/workspace/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
    }
  }, [isOpen]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const handleOpenPreview = async (file: WorkspaceFile) => {
    setPreviewFile(file);
    setIsPreviewLoading(true);
    setCopied(false);
    try {
      const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(file.extension);
      if (!isImg) {
        const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewContent(data.content || '');
        } else {
          setPreviewContent(t('file_unreadable', '無法讀取檔案內容或為二進位檔案。'));
        }
      }
    } catch (err) {
      setPreviewContent(t('read_failed', '讀取失敗: {error}', { error: String(err) }));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDelete = async (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`${t('confirm_delete_file', '確定要刪除工作區檔案嗎？')} \n\n${file.path}`)) {
      return;
    }
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.path !== file.path));
        if (previewFile?.path === file.path) {
          setPreviewFile(null);
        }
      }
    } catch (err) {
      alert(t('delete_failed', '刪除失敗: {error}', { error: String(err) }));
    }
  };

  const handleDownload = (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/workspace/file?path=${encodeURIComponent(file.path)}&raw=true`, '_blank');
  };

  const handleCopyPreview = () => {
    if (previewContent) {
      navigator.clipboard.writeText(previewContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (ext: string, isDir: boolean) => {
    if (isDir) return <Folder className="w-4 h-4 text-amber-400 shrink-0" />;
    const lower = ext.toLowerCase();
    if (['py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'sh', 'sql'].includes(lower)) {
      return <Code2 className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(lower)) {
      return <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (['csv', 'xlsx', 'xls', 'tsv'].includes(lower)) {
      return <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />;
    }
    if (['md', 'txt', 'log', 'pdf'].includes(lower)) {
      return <FileText className="w-4 h-4 text-indigo-400 shrink-0" />;
    }
    return <File className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Slide-out Drawer Panel */}
      <div className="relative w-full max-w-md h-full bg-[#0d1322]/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col z-10 animate-slide-left text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm tracking-wide text-white flex items-center gap-2">
                {t('workspace_explorer', '工作區檔案導航')}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {files.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                {activeProject ? `📂 ${t('project_label', '專案')}: ${activeProject}` : 'backend/workspace/'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchFiles}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title={t('refresh', '重新整理')}
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title={t('close', '關閉')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Tab Bar: Files vs Git */}
        <div className="grid grid-cols-2 p-1.5 mx-3 mt-2 rounded-xl bg-black/40 border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setDrawerTab('files')}
            className={`py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              drawerTab === 'files'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Folder className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('file_explorer', '檔案總管')} ({files.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawerTab('git');
              fetchGitStatus();
            }}
            className={`py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              drawerTab === 'git'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('git_repo', 'Git 版本庫')}</span>
          </button>
        </div>

        {drawerTab === 'git' ? (
          /* Git Visual Panel */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('git_branch', '當前分支 (Branch):')}</span>
                <span className="font-mono font-bold text-emerald-300 flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <GitBranch className="w-3 h-3 text-emerald-400" />
                  {gitStatus?.branch || 'main'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('git_changed_files', '變更檔案數:')}</span>
                <span className="font-mono font-bold text-white">
                  {t('git_change_count', '{count} 個變更', { count: gitStatus?.total_changes ?? 0 })}
                </span>
              </div>
            </div>

            {/* Changed files list */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                {t('git_change_list', '變更清單 (Modified & Untracked)')}
              </div>
              {isGitLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">{t('git_loading', '讀取 Git 狀態中...')}</div>
              ) : !gitStatus?.is_git ? (
                <div className="p-4 rounded-xl bg-black/30 text-center text-xs text-slate-400 border border-white/5">
                  {t('git_not_repo', '目前專案非 Git 版本庫')}
                </div>
              ) : (gitStatus?.total_changes ?? 0) === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-950/20 text-center text-xs text-emerald-300 border border-emerald-500/30">
                  {t('git_clean', '✨ 工作區乾淨，無任何未提交變更！')}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 bg-black/30 rounded-xl p-2 border border-white/10 font-mono text-xs">
                  {gitStatus?.modified?.map((m: string) => (
                    <div key={m} className="flex items-center justify-between p-1 rounded hover:bg-white/5 text-amber-300">
                      <span className="truncate">{m}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40">M</span>
                    </div>
                  ))}
                  {gitStatus?.untracked?.map((u: string) => (
                    <div key={u} className="flex items-center justify-between p-1 rounded hover:bg-white/5 text-cyan-300">
                      <span className="truncate">{u}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40">?</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commit Message & AI Assistant */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">{t('commit_message', 'Commit 訊息')}</label>
                <button
                  type="button"
                  onClick={handleGenerateAiCommit}
                  disabled={isAiCommitLoading || (gitStatus?.total_changes ?? 0) === 0}
                  className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1 font-bold disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isAiCommitLoading ? t('ai_analyzing', 'AI 分析中...') : t('ai_commit_msg', '✨ AI 生成 Commit 訊息')}</span>
                </button>
              </div>

              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder={t('commit_placeholder', '例如: feat: 新增網頁目錄選取器')}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />

              {gitNotice && (
                <p className="text-xs font-medium text-emerald-300 bg-emerald-950/30 p-2 rounded-lg border border-emerald-500/30">
                  {gitNotice}
                </p>
              )}

              <button
                type="button"
                onClick={handleCommitAndPush}
                disabled={isPushing || (gitStatus?.total_changes ?? 0) === 0 || !commitMsg.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-40 transition-all"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{isPushing ? t('pushing', '正在提交並推送到 GitHub...') : t('commit_push_btn', '🚀 一鍵 Commit & Push 到 GitHub')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Files View */
          <>
            {/* Search Filter Bar */}
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('search_files', '搜尋工作區檔案...')}
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-black/40 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* File Tree List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                  <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">{t('loading_files', '載入工作區檔案中...')}</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                  <Folder className="w-8 h-8 opacity-40" />
                  <span className="text-xs">{t('workspace_empty', '工作區目前無檔案')}</span>
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => !file.is_dir && handleOpenPreview(file)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-cyan-500/20 transition-all cursor-pointer ${
                      file.is_dir ? 'bg-amber-500/[0.02]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      {getFileIcon(file.extension, file.is_dir)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>{file.path}</span>
                          {!file.is_dir && (
                            <>
                              <span>•</span>
                              <span>{formatSize(file.size)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!file.is_dir && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAskAgent(file.path);
                              onClose();
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                            title={t('ask_about_file', '向 Agent 詢問此檔案')}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPreview(file);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('file_preview', '檔案內容檢視')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDownload(file, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('download_file', '下載檔案')}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => handleDelete(file, e)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title={t('delete_file', '刪除檔案')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Footer Quick Action */}
        <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px] text-slate-400">
          <span>{t('workspace_click_hint', '點選檔案直接檢視內容與語法結構')}</span>
          <span className="font-mono text-cyan-400">{filteredFiles.length} {t('workspace_items_count', '檔案/資料夾')}</span>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-3xl max-h-[85vh] bg-[#0c111e] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2.5 min-w-0">
                {getFileIcon(previewFile.extension, previewFile.is_dir)}
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{previewFile.name}</h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {previewFile.path} • {formatSize(previewFile.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(previewFile.extension) && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                      isEditing
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isEditing ? t('view_mode', '檢視模式') : t('edit_mode', '編輯模式')}</span>
                  </button>
                )}

                {isEditing && (
                  <button
                    type="button"
                    onClick={handleSaveFile}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold shadow-md hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {saveSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>{t('saved_ok', '已儲存！')}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSaving ? t('saving', '儲存中...') : t('save_file', '儲存檔案')}</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    onAskAgent(previewFile.path);
                    setPreviewFile(null);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:brightness-125 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  {t('ask_about_file', '向 Agent 詢問此檔案')}
                </button>

                <button
                  onClick={handleCopyPreview}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title={t('copy_content', '複製內容')}
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => window.open(`/api/workspace/file?path=${encodeURIComponent(previewFile.path)}&raw=true`, '_blank')}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title={t('download_file', '下載檔案')}
                >
                  <ExternalLink className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 bg-black/40 font-mono text-xs text-slate-300 leading-relaxed">
              {isPreviewLoading ? (
                <div className="flex items-center justify-center h-64 gap-2 text-slate-400">
                  <RotateCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>{t('file_loading', '載入檔案內容中...')}</span>
                </div>
              ) : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(previewFile.extension) ? (
                <div className="flex flex-col items-center justify-center p-6 gap-4">
                  <img
                    src={`/api/workspace/file?path=${encodeURIComponent(previewFile.path)}&raw=true`}
                    alt={previewFile.name}
                    className="max-w-full max-h-[60vh] object-contain rounded-xl border border-white/10 shadow-lg"
                  />
                  <span className="text-xs text-slate-400">{previewFile.name}</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap select-text selection:bg-cyan-500/30 selection:text-white">
                  {previewContent || t('file_empty', '(檔案內容為空)')}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
