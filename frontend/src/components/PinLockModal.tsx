import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, Loader2, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface PinLockModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({ isOpen, onSuccess }) => {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg(t('pin_enter', '請輸入訪問 PIN 碼'));
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('aether_access_token', data.token || pin.trim());
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || t('pin_wrong', 'PIN 碼錯誤，請重新輸入'));
      }
    } catch (err: any) {
      setErrorMsg(t('pin_verify_failed', '驗證連線失敗: {error}', { error: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 md:p-8 shadow-[0_0_50px_rgba(0,242,254,0.25)] text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
          <Lock className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>

        <h2 className="text-lg font-bold text-white mb-1">
          {t('pin_lock_title', '外網安全訪問鎖定')}
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          {t('pin_lock_desc', '此 Aether AI Studio 伺服器已啟用外網存取 PIN 碼保護。請輸入 PIN 碼以解鎖終端機與檔案存取權限。')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErrorMsg('');
              }}
              placeholder={t('pin_enter', '請輸入訪問 PIN 碼')}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-black/50 border border-white/20 text-center text-sm font-mono tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              autoFocus
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 animate-in fade-in">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !pin.trim()}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,242,254,0.3)] disabled:opacity-40 transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('verifying', '驗證中...')}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{t('pin_unlock', '解鎖並進入工作區')}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
