// file: celebrate.js
// description: small wrapper around canvas-confetti for celebration moments.

import confetti from "canvas-confetti";

const COLORS = ["#ff8c42", "#ffc857", "#4dd0e1", "#4caf50", "#c97cff"];

export function celebrate(level = "milestone") {
    if (level === "job-complete") {
        // big burst from both sides
        const end = Date.now() + 900;
        (function frame() {
            confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: COLORS });
            confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: COLORS });
            if (Date.now() < end) requestAnimationFrame(frame);
        })();
        return;
    }
    // default: single milestone pop
    confetti({
        particleCount: 120,
        spread: 75,
        startVelocity: 40,
        origin: { y: 0.65 },
        colors: COLORS,
        scalar: 0.9,
    });
}
