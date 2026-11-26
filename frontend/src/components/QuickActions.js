// file: QuickActions.js
// description: small role-specific shortcut panel on the right rail.

import React from "react";
import {
    Zap, Plus, Search, Send, Scale, Flag, Briefcase, ShieldCheck
} from "lucide-react";

function QuickActions({ role, isAdmin, onNavigate, onSwitchAccount }) {
    let actions = [];

    if (role === "client") {
        actions = [
            { key: "create", label: "Post a new job",      icon: Plus,       onClick: () => onNavigate("create") },
            { key: "jobs",   label: "Review applicants",   icon: Briefcase,  onClick: () => onNavigate("jobs") },
        ];
    } else if (role === "freelancer") {
        actions = [
            { key: "browse",       label: "Browse open jobs", icon: Search, onClick: () => onNavigate("browse") },
            { key: "applications", label: "My applications",  icon: Send,   onClick: () => onNavigate("applications") },
            { key: "jobs",         label: "My assigned work", icon: Briefcase, onClick: () => onNavigate("jobs") },
        ];
    } else if (role === "arbiter") {
        actions = [
            { key: "open",     label: "Open disputes",    icon: Flag,  onClick: () => onNavigate("open") },
            { key: "split",    label: "Adjust split",     icon: Scale, onClick: () => onNavigate("split") },
        ];
        if (isAdmin) actions.push({ key: "admin", label: "Admin controls", icon: ShieldCheck, onClick: () => onNavigate("admin") });
    }

    actions.push({
        key: "switch", label: "Switch wallet", icon: Zap, onClick: onSwitchAccount,
    });

    return (
        <div className="widget">
            <div className="widget-head">
                <h4><span className="widget-icon"><Zap size={15} /></span> Quick Actions</h4>
            </div>
            {actions.map(a => {
                const Icon = a.icon;
                return (
                    <button key={a.key} className="quick-action" onClick={a.onClick}>
                        <span className="quick-icon"><Icon size={15} /></span>
                        <span>{a.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default QuickActions;
