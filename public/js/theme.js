const THEMES = ['dark', 'light'];
const STORAGE_KEY = 'runway_theme';

const getSavedTheme = () => {
    return localStorage.getItem(STORAGE_KEY);
};

const applyTheme = (themeName) => {
    const validTheme = THEMES.includes(themeName) ? themeName : 'dark';
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem(STORAGE_KEY, validTheme);
};

const toggleNextTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    return nextTheme; 
};

const init = () => {
    const saved = getSavedTheme();
    // Default to 'dark' if nothing saved
    const initial = saved || 'dark';
    applyTheme(initial);
};

init();

export { toggleNextTheme };