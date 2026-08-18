import React, { createContext, useContext, useEffect, useState } from 'react';

// Theme (light/dark) provider — module 10 of the portfolio standard.
// tailwind.config.js already had darkMode:"class" and index.css already had
// a full .dark token palette; this is the missing piece that actually
// applies the class. Resolution order mirrors index.html's inline
// pre-mount script (kept in sync manually — see its own comment): stored
// preference in localStorage, else the OS's prefers-color-scheme, else light.
const STORAGE_KEY = 'pp-theme';
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} });

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch { /* localStorage/matchMedia unavailable */ }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = (next) => setThemeState(next === 'dark' ? 'dark' : 'light');
  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
