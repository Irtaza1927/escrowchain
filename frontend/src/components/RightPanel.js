// file: RightPanel.js
// description: composes the three right-rail widgets.

import React from "react";
import ActivityFeed  from "./ActivityFeed";
import QuickActions  from "./QuickActions";
import SystemStatus  from "./SystemStatus";

function RightPanel({ signer, role, isAdmin, onNavigate, onSwitchAccount, refreshKey }) {
    return (
        <>
            <QuickActions role={role} isAdmin={isAdmin} onNavigate={onNavigate} onSwitchAccount={onSwitchAccount} />
            <ActivityFeed signer={signer} refreshKey={refreshKey} />
            <SystemStatus signer={signer} />
        </>
    );
}

export default RightPanel;
