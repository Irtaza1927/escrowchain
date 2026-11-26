// file: accountRegistry.js
// description: tracks every (address, role) pair the user has connected with,
// so the top-bar role switcher dropdown can offer a visual picker of their
// own known accounts. Pure localStorage, no secrets stored.

const KEY = "escrow:known-accounts";

export function getKnownAccounts() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const obj = JSON.parse(raw);
        return Object.values(obj).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    } catch { return []; }
}

export function registerAccount(address, role) {
    if (!address) return;
    try {
        const raw = localStorage.getItem(KEY);
        const obj = raw ? JSON.parse(raw) : {};
        const norm = address.toLowerCase();
        obj[norm] = {
            address,
            role,
            lastSeen: Date.now()
        };
        localStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
}

export function forgetAccount(address) {
    if (!address) return;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        delete obj[address.toLowerCase()];
        localStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
}
