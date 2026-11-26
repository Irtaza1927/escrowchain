// file: InfoBanner.js
// description: dismissible one-time banner shown to new users explaining the 3-role flow.
// persists dismissal in localStorage so it stays hidden after the first dismiss.

import React, { useState, useEffect } from "react";
import { Info, X } from "lucide-react";

const KEY = "escrow:info-banner-dismissed";

function InfoBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(KEY) !== "1") setVisible(true);
        } catch { setVisible(true); }
    }, []);

    function dismiss() {
        try { localStorage.setItem(KEY, "1"); } catch {}
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="info-banner slide-in">
            <div className="info-banner-icon"><Info size={18} /></div>
            <div style={{ flex: 1 }}>
                <h4>Testing with 3 roles</h4>
                <p>
                    This DApp has 3 roles (Client, Freelancer, Arbiter). The deployer wallet is the Arbiter by default.
                    To test as Client or Freelancer, import extra Ganache accounts into MetaMask, then use the
                    <strong> Switch Account </strong> button in the top bar to change roles anytime.
                </p>
            </div>
            <button className="info-banner-close" onClick={dismiss} title="dismiss">
                <X size={16} />
            </button>
        </div>
    );
}

export default InfoBanner;
