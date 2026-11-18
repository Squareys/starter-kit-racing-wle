/*
 * Shows uncaught errors, rejected promises and console.error output in a box
 * on the page, so problems are visible without the browser's developer tools.
 */
let box = null;

function show(text) {
    if (!document.body) return;
    if (!box) {
        box = document.createElement('pre');
        box.id = 'error-overlay';
        box.style.cssText =
            'position:fixed;left:8px;right:8px;bottom:80px;max-height:40vh;overflow:auto;margin:0;' +
            'padding:10px 12px;background:rgba(90,0,0,0.88);color:#fff;font:12px/1.4 monospace;' +
            'white-space:pre-wrap;z-index:1000;border-radius:8px;';
        document.body.appendChild(box);
    }
    box.textContent += text + '\n';
}

function describe(value) {
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

export function installErrorOverlay() {
    /* The editor also evaluates modules without a DOM to read component properties. */
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    if (window.__errorOverlay) return;
    window.__errorOverlay = true;
    window.addEventListener('error', (e) => show(describe(e.error || e.message)));
    window.addEventListener('unhandledrejection', (e) => show('Unhandled rejection: ' + describe(e.reason)));
    const original = console.error.bind(console);
    console.error = (...args) => {
        original(...args);
        show(args.map(describe).join(' '));
    };
}
