console.log('[System] Version manager loaded...');

const fetchVersion = async () => {
    try {
        const response = await fetch(`/version?t=${Date.now()}`);
        if (!response.ok) throw new Error('Version check failed');
        return await response.json();
    } catch (err) {
        console.warn('System: Could not fetch version metadata', err);
        return null;
    }
};

const checkVersion = async () => {
    const meta = await fetchVersion();
    
    if (meta) {
        console.groupCollapsed(`[System] v${meta.version}`);
        console.log(`Build: ${meta.build}`);
        console.log(`Env:   ${meta.environment}`);
        console.log(`Time:  ${meta.updatedAt}`);
        console.groupEnd();

        window.__RUNWAY_VERSION__ = meta;
    }
};

checkVersion();

export { checkVersion };