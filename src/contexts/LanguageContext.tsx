import { createContext, useContext, useState, ReactNode } from 'react';

export type VoiceLang = 'en-US' | 'ta-IN';

interface LanguageContextValue {
  lang: VoiceLang;
  setLang: (l: VoiceLang) => void;
  isTamil: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en-US',
  setLang: () => {},
  isTamil: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<VoiceLang>('en-US');
  return (
    <LanguageContext.Provider value={{ lang, setLang, isTamil: lang === 'ta-IN' }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
