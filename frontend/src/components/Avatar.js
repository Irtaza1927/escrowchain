// file: Avatar.js
// description: deterministic colorful SVG avatar derived from a wallet address.
// style is inspired by jazzicon: layered rotated shapes over a gradient base,
// unique per address. zero external dependencies so the bundle stays small.

import React from "react";

// convert a hex string segment to an integer with a cheap hash mix
function hashInt(hex, offset = 0, len = 6) {
    try {
        return parseInt(hex.slice(2 + offset, 2 + offset + len), 16) || 0;
    } catch { return 0; }
}

function Avatar({ address, size = 28, className = "" }) {
    if (!address || typeof address !== "string") {
        return <div className={className} style={{ width: size, height: size, borderRadius: "50%", background: "var(--bg-3)" }} />;
    }

    const addr  = address.toLowerCase();
    const hue1  = hashInt(addr, 0)  % 360;
    const hue2  = (hue1 + 60 + hashInt(addr, 6) % 180) % 360;
    const hue3  = (hue2 + 90 + hashInt(addr, 12) % 180) % 360;
    const rot1  = hashInt(addr, 8)  % 360;
    const rot2  = hashInt(addr, 14) % 360;
    const dx    = (hashInt(addr, 20, 2) % 12) - 6;
    const dy    = (hashInt(addr, 22, 2) % 12) - 6;

    const gradId = `g-${addr.slice(2, 10)}`;

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" className={className}
             style={{ borderRadius: "50%", display: "block", flexShrink: 0 }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={`hsl(${hue1}, 70%, 55%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue2}, 70%, 45%)`} />
                </linearGradient>
            </defs>
            <rect width="32" height="32" fill={`url(#${gradId})`} />
            <circle cx={16 + dx} cy={16 + dy} r="10"
                    fill={`hsl(${hue3}, 75%, 60%)`}
                    opacity="0.75"
                    transform={`rotate(${rot1} 16 16)`} />
            <rect x="4" y="4" width="8" height="8"
                  fill={`hsl(${(hue1 + 180) % 360}, 80%, 70%)`}
                  opacity="0.85"
                  transform={`rotate(${rot2} 16 16)`} />
        </svg>
    );
}

export default Avatar;
