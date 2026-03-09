import { createContext, useContext, useState, type ReactNode } from "react";
import type { LangCode } from "@/types/coach";
import { UI_LABELS } from "@/types/coach";

interface LanguageContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "ko",
  setLang: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LangCode>("ko");

  const t = (key: string): string => {
    const labels = UI_LABELS[key];
    if (!labels) return key;
    return labels[lang] || labels["ko"] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
