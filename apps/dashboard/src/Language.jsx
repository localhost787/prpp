import React, { createContext, useContext } from 'react';
import { DEFAULT_LANGUAGE, translate } from './i18n.mjs';
export const Language = createContext(DEFAULT_LANGUAGE);
export function useLanguage() {
  const language = useContext(Language);
  return { language, t: (key, parameters) => translate(language, key, parameters) };
}
// React Native 0.81 documents accessibilityLanguage on iOS only.
export function accessibilityLanguageProps(platform, language) {
  return platform === 'ios' ? { accessibilityLanguage: language } : {};
}
