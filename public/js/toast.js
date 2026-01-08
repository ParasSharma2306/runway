const createToastContainer = () => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
};

export const showToast = (message, type = 'info') => {
    const container = createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Icon Logic
    const icon = document.createElement('span');
    icon.style.marginRight = '8px';
    if (type === 'success') icon.innerHTML = '✓';
    else if (type === 'error') icon.innerHTML = '✕';
    else icon.innerHTML = 'ℹ';
    
    toast.prepend(icon);

    container.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Auto Dismiss
    setTimeout(() => {
        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3000);
};