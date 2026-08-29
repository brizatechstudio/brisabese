import { useCallback } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Small bilingual helper used by the Phase 1 console. Product names and code
 * identifiers stay unchanged; user-facing copy can opt into PT-BR/EN-US with
 * `tr(portuguese, english)`.
 */
export function useLocale() {
  const { language } = useApp();
  const isEnglish = language === 'en-US';
  const tr = useCallback((ptBr: string, enUs: string) => (isEnglish ? enUs : ptBr), [isEnglish]);
  return { language, isEnglish, locale: isEnglish ? 'en-US' : 'pt-BR', tr } as const;
}
