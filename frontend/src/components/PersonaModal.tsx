import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Code2, 
  Search, 
  Terminal, 
  Cpu, 
  Database, 
  ShieldCheck, 
  Check, 
  Bot, 
  Plus 
} from 'lucide-react';
import { Persona, ToolDefinition } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePersona: (persona: Persona) => Promise<void>;
  availableTools: ToolDefinition[];
}

export const PersonaModal: React.FC<PersonaModalProps> = ({
  isOpen,
  onClose,
  onSavePersona,
  availableTools
}) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Sparkles');
  const [enabledTools, setEnabledTools] = useState<string[]>([
    'web_search', 'python_eval', 'file_system'
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const iconOptions = [
    { id: 'Sparkles', label: '核心主控', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'Code2', label: '系統架構', icon: <Code2 className="w-4 h-4" /> },
    { id: 'Search', label: '情報研析', icon: <Search className="w-4 h-4" /> },
    { id: 'Terminal', label: '基礎設施', icon: <Terminal className="w-4 h-4" /> },
    { id: 'Database', label: '資料工程', icon: <Database className="w-4 h-4" /> },
    { id: 'ShieldCheck', label: '資安審計', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  const handleToggleTool = (toolName: string) => {
    if (enabledTools.includes(toolName)) {
      setEnabledTools(enabledTools.filter(t => t !== toolName));
    } else {
      setEnabledTools([...enabledTools, toolName]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg(t('persona_name_placeholder', '請輸入角色名稱！'));
      return;
    }
    if (!systemPrompt.trim()) {
      setErrorMsg(t('persona_prompt', '請輸入角色 System Prompt 提示詞！'));
      return;
    }

    setErrorMsg(null);
    setIsSaving(true);
    const newPersona: Persona = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || '專案工程代理角色',
      icon: selectedIcon,
      system_prompt: systemPrompt.trim(),
      enabled_tools: enabledTools
    };

    try {
      await onSavePersona(newPersona);
      onClose();
      setName('');
      setDescription('');
      setSystemPrompt('');
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || '儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-lg glass-panel rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('persona_modal_title', '配置專屬工程代理角色')}</h3>
              <p className="text-xs text-slate-400">{t('persona_modal_sub', '定義客製化 System Prompt 與專屬授權工具集')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Name & Icon Selection */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('persona_name', '角色名稱')} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('persona_name_placeholder', '例如: 智慧合約稽核員')}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('persona_icon', '圖示')}
              </label>
              <div className="flex gap-1 overflow-x-auto py-1">
                {iconOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedIcon(opt.id)}
                    className={`p-2 rounded-xl border transition-all ${
                      selectedIcon === opt.id
                        ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                        : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                    title={opt.label}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('persona_desc', '角色簡介')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('persona_desc_placeholder', '簡要描述該角色的專業定位與工作執掌')}
              className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('persona_prompt', '系統設定提示詞 (System Prompt)')} *
            </label>
            <textarea
              rows={4}
              required
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="設定此角色的思考方式、回應口吻與指示規範..."
              className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 leading-relaxed font-mono"
            />
          </div>

          {/* Tool Permissions Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              {t('persona_tools', '授權工具鏈')} ({enabledTools.length} 已授權)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableTools.map((tool) => {
                const isChecked = enabledTools.includes(tool.name);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => handleToggleTool(tool.name)}
                    className={`p-2 rounded-xl text-left text-xs transition-all flex items-center justify-between border ${
                      isChecked
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/5 text-slate-500 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="font-mono text-[11px] truncate">{tool.name}</span>
                    <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                      isChecked ? 'bg-cyan-400 border-cyan-400 text-black' : 'border-slate-600'
                    }`}>
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
            >
              {t('cancel', '取消')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl glass-button-primary text-xs font-semibold text-white shadow-md flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('create_agent_btn', '建立專案代理角色')}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
export default PersonaModal;
