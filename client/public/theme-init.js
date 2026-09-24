// Apply before the app paints to avoid a bright flash on dark-theme visits.
(() => {
  let theme;
  try { theme = localStorage.getItem('shree-theme'); } catch {}
  if (!['light', 'dark'].includes(theme)) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
