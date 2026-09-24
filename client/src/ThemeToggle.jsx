import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    const apply = value => {
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value;
      setTheme(value);
    };
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      let saved;
      try { saved = localStorage.getItem('shree-theme'); } catch {}
      if (!['light','dark'].includes(saved)) apply(preference.matches ? 'dark' : 'light');
    };
    const sync = event => {
      if (event.key === 'shree-theme' || event.key === null) {
        if (['light','dark'].includes(event.newValue)) apply(event.newValue);
        else followSystem();
      }
    };
    preference.addEventListener('change', followSystem);
    window.addEventListener('storage', sync);
    return () => { preference.removeEventListener('change', followSystem); window.removeEventListener('storage', sync); };
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    setTheme(next);
    try { localStorage.setItem('shree-theme', next); } catch {}
  };
  return <button type="button" className="theme-toggle" onClick={toggle}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
    {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
    <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
  </button>;
}
