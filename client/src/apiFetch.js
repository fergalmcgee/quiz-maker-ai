const AUTH_IGNORED_PATHS = new Set(['/api/login', '/api/logout', '/api/me']);

function getRequestPath(input) {
    const url = typeof input === 'string'
        ? input
        : input?.url;

    if (!url) return null;

    try {
        const parsedUrl = new URL(url, window.location.origin);
        if (parsedUrl.origin !== window.location.origin) return null;
        return parsedUrl.pathname;
    } catch {
        return url.startsWith('/api/') ? url.split('?')[0] : null;
    }
}

function shouldHandleAuthExpiry(input) {
    const path = getRequestPath(input);
    return !!path && path.startsWith('/api/') && !AUTH_IGNORED_PATHS.has(path);
}

export function installApiSessionHandler(onSessionExpired) {
    const originalFetch = window.fetch.bind(window);
    let lastNotificationAt = 0;

    window.fetch = async (...args) => {
        const response = await originalFetch(...args);

        if (response.status === 401 && shouldHandleAuthExpiry(args[0])) {
            const now = Date.now();
            if (now - lastNotificationAt > 5000) {
                lastNotificationAt = now;
                try {
                    onSessionExpired();
                } catch (error) {
                    console.error('Session expiry handler failed:', error);
                }
            }
        }

        return response;
    };

    return () => {
        window.fetch = originalFetch;
    };
}
