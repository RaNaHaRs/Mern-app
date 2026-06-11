import React, { useState, useEffect, createContext, useContext } from 'react';

// ── Theme Context ──────────────────────────────────────────────
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ── Font Size Context ──────────────────────────────────────────
const FontSizeContext = createContext({ fontSize: 'default', setFontSize: () => {} });
export const useFontSize = () => useContext(FontSizeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('crm_theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crm_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function FontSizeProvider({ children }) {
  const [fontSize, setFontSizeState] = useState(() => localStorage.getItem('crm_font_size') || 'default');
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
    localStorage.setItem('crm_font_size', fontSize);
  }, [fontSize]);
  const setFontSize = (s) => setFontSizeState(s);
  return <FontSizeContext.Provider value={{ fontSize, setFontSize }}>{children}</FontSizeContext.Provider>;
}
