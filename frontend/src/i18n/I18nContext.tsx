import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations } from './translations';

export interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
}

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

interface I18nContextType {
  currentLang: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
  availableLanguages: LanguageOption[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'aether_language';

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentLang, setCurrentLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved && ['zh-TW', 'zh-CN', 'en', 'ja'].includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'zh-TW';
  });

  const setLanguage = (lang: Language) => {
    setCurrentLangState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore localStorage errors
    }
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = currentLang;
  }, [currentLang]);

  const t = (key: string, fallback?: string, params?: Record<string, string | number>): string => {
    // Non-Chinese UIs fall back to English before the zh-TW source strings
    const chain: Language[] = currentLang === 'zh-TW' || currentLang === 'zh-CN'
      ? [currentLang, 'zh-TW']
      : [currentLang, 'en', 'zh-TW'];
    let text: string | undefined;
    for (const lang of chain) {
      const dict = translations[lang];
      if (dict && key in dict) {
        text = dict[key];
        break;
      }
    }
    if (text === undefined) text = fallback ?? key;
    if (!params) return text;
    // Callback form so values containing `$&`, `$1`… are inserted literally
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };

  return (
    <I18nContext.Provider value={{ currentLang, setLanguage, t, availableLanguages: AVAILABLE_LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
