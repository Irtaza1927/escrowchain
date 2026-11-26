// file: Sidebar.js
// description: slanted blue nav tabs with cartoon icon chips. click brand to go home.

import React from "react";
import {
    Hammer, LayoutDashboard, Briefcase, Plus, Scale, Flag, Gavel,
    History, HelpCircle, Zap, ShieldCheck, Search, Send, Wrench, Settings
} from "lucide-react";

function navForRole(role, isAdmin) {
    let items = [];
    if (role === "client") {
        items = [
            { key: "overview", label: "Overview",   icon: LayoutDashboard },
            { key: "create",   label: "Post Job",   icon: Plus },
            { key: "jobs",     label: "My Jobs",    icon: Briefcase },
        ];
    } else if (role === "freelancer") {
        items = [
            { key: "overview",     label: "Overview",      icon: LayoutDashboard },
            { key: "browse",       label: "Browse Jobs",   icon: Search },
            { key: "applications", label: "Applications",  icon: Send },
            { key: "jobs",         label: "My Work",       icon: Briefcase },
        ];
    } else if (role === "arbiter") {
        items = [
            { key: "overview", label: "Overview",   icon: LayoutDashboard },
            { key: "split",    label: "Split",      icon: Scale },
            { key: "open",     label: "Disputes",   icon: Flag },
            { key: "resolved", label: "History",    icon: History },
        ];
    } else {
        items = [
            { key: "home",  label: "Home",  icon: LayoutDashboard },
            { key: "about", label: "About", icon: HelpCircle },
        ];
    }

    if (isAdmin && role === "arbiter") {
        items.push({ key: "admin", label: "Admin",    icon: ShieldCheck });
    }

    return items;
}

function Sidebar({ role, isAdmin, open, activeSection, onNavigate }) {
    const items = navForRole(role, isAdmin);

    function goHome() {
        onNavigate(items[0]?.key || "overview");
    }

    return (
        <aside className={`sidebar ${open === false ? "closed" : ""}`}>
            <div className="sidebar-brand" onClick={goHome} title="Go home">
                <div className="brand-mark"><Hammer size={18} /></div>
                <span>EscrowChain</span>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section-label">
                    {role ? `${role} tools` : "Menu"}
                </div>
                {items.map(item => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.key}
                            className={`nav-item ${activeSection === item.key ? "active" : ""}`}
                            onClick={() => onNavigate(item.key)}
                        >
                            <span className="nav-icon"><Icon size={16} /></span>
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="row" style={{ gap: 6 }}>
                    <Zap size={12} />
                    <span>Powered by Ethereum</span>
                </div>
                <span>Built by Irtaza Zahid</span>
            </div>
        </aside>
    );
}

export default Sidebar;
