// file: Navbar.js
// description: two-row HUD. row 1 has brand + title + counters + wallet.
// row 2 has pill navigation. no sidebar anymore.

import React, { useState, useEffect, useRef } from "react";
import {
    Wallet, Copy, Check, LogOut, RefreshCw, Hammer, Home, ChevronDown,
    LayoutDashboard, Briefcase, Plus, Scale, Flag, History, Search, Send,
    ShieldCheck
} from "lucide-react";
import toast from "react-hot-toast";
import Avatar from "./Avatar";
import { getKnownAccounts } from "../utils/accountRegistry";
import { isDemoMode } from "../utils/ipfs";

const ICONS = {
    overview: LayoutDashboard, create: Plus, jobs: Briefcase,
    browse: Search, applications: Send, split: Scale, open: Flag,
    resolved: History, admin: ShieldCheck,
};

function shortenAddress(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function roleBadgeClass(role) {
    if (role === "client")     return "badge badge-progress";
    if (role === "freelancer") return "badge badge-submitted";
    if (role === "arbiter")    return "badge badge-disputed";
    return "badge badge-pending";
}

function fmtEth(balance) {
    if (balance == null) return "0.000";
    const num = Number(balance);
    if (!Number.isFinite(num)) return "0.000";
    if (num >= 1000) return num.toFixed(0);
    if (num >= 10)   return num.toFixed(2);
    return num.toFixed(3);
}

function Navbar({
    account, role, onConnect, onDisconnect, onSwitchAccount, onHome,
    loading, networkOk, title, subtitle, ethBalance, roleScore,
    navItems = [], activeSection, onNavigate,
}) {
    const [copied, setCopied]   = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [known,  setKnown]    = useState([]);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        function onClick(e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        }
        window.addEventListener("mousedown", onClick);
        return () => window.removeEventListener("mousedown", onClick);
    }, [menuOpen]);

    useEffect(() => {
        if (menuOpen) setKnown(getKnownAccounts());
    }, [menuOpen, account, role]);

    async function copyAddress() {
        try {
            await navigator.clipboard.writeText(account);
            setCopied(true);
            toast.success("Address copied");
            setTimeout(() => setCopied(false), 1500);
        } catch { toast.error("Copy failed"); }
    }

    function handleSwitchFromMenu(entry) {
        setMenuOpen(false);
        if (entry.address.toLowerCase() === account?.toLowerCase()) return;
        toast(`Pick ${shortenAddress(entry.address)} in MetaMask`, { icon: "👉", duration: 5000 });
        onSwitchAccount?.();
    }

    return (
        <>
            {/* HUD row */}
            <header className="topbar">
                <div className="topbar-brand" onClick={onHome}>
                    <div className="brand-mark"><Hammer size={18} /></div>
                    <div>
                        <h1>EscrowChain</h1>
                        <div className="brand-tag">Trustless Escrow</div>
                    </div>
                </div>

                {title && (
                    <div className="topbar-title" style={{ flex: 1, textAlign: "center" }}>
                        <h2>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                )}

                <div className="topbar-actions">
                    {account && onHome && (
                        <button className="btn-ghost btn-icon" onClick={onHome} title="Overview">
                            <Home size={16} />
                        </button>
                    )}

                    {account && ethBalance != null && (
                        <span className="counter eth-type" title="Your ETH balance">
                            <span className="counter-icon">Ξ</span>
                            <span>{fmtEth(ethBalance)}</span>
                        </span>
                    )}

                    {account && roleScore != null && (
                        <span className="counter gem-type" title="Role activity">
                            <span className="counter-icon">◆</span>
                            <span>{roleScore}</span>
                        </span>
                    )}

                    {account && (
                        <span className={networkOk ? "pill pill-live" : "pill pill-warn"}>
                            <span className={networkOk ? "dot dot-live" : "dot dot-warn"} />
                            {networkOk ? "Ganache" : "Wrong Net"}
                        </span>
                    )}

                    {account && (
                        <span className={isDemoMode() ? "pill pill-warn" : "pill pill-live"} title="IPFS mode">
                            <span className={isDemoMode() ? "dot dot-warn" : "dot dot-live"} />
                            {isDemoMode() ? "Demo IPFS" : "Pinata"}
                        </span>
                    )}

                    {account && role && (
                        <span className={roleBadgeClass(role)}>{role.toUpperCase()}</span>
                    )}

                    {account ? (
                        <div className="wallet-chip" ref={menuRef}>
                            <button className="btn-secondary btn-sm" onClick={() => setMenuOpen(v => !v)} title="Switch accounts">
                                <Avatar address={account} size={20} />
                                <span className="mono">{shortenAddress(account)}</span>
                                <ChevronDown size={13} />
                            </button>

                            {menuOpen && (
                                <div className="wallet-menu">
                                    <div className="wallet-menu-label">Your known accounts</div>

                                    {known.length === 0 && (
                                        <div className="small muted" style={{ padding: "8px 12px" }}>
                                            Register as another role to see it here.
                                        </div>
                                    )}

                                    {known.map(entry => {
                                        const current = entry.address.toLowerCase() === account.toLowerCase();
                                        return (
                                            <button key={entry.address}
                                                    className={`wallet-menu-item ${current ? "current" : ""}`}
                                                    onClick={() => handleSwitchFromMenu(entry)}>
                                                <Avatar address={entry.address} size={24} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="row" style={{ gap: 6 }}>
                                                        <span className={roleBadgeClass(entry.role)} style={{ fontSize: 10 }}>
                                                            {(entry.role || "unknown").toUpperCase()}
                                                        </span>
                                                        {current && <span className="small muted">current</span>}
                                                    </div>
                                                    <div className="mono small" style={{ marginTop: 2 }}>
                                                        {shortenAddress(entry.address)}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}

                                    <div style={{ height: 2, background: "var(--border)", margin: "8px 4px", borderRadius: 999 }} />

                                    <button className="wallet-menu-item" onClick={() => { setMenuOpen(false); copyAddress(); }}>
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        <span className="small">Copy current address</span>
                                    </button>
                                    <button className="wallet-menu-item" onClick={() => { setMenuOpen(false); onSwitchAccount?.(); }}>
                                        <RefreshCw size={14} />
                                        <span className="small">Open MetaMask picker</span>
                                    </button>
                                    {onDisconnect && (
                                        <button className="wallet-menu-item" onClick={() => { setMenuOpen(false); onDisconnect(); }}>
                                            <LogOut size={14} />
                                            <span className="small">Disconnect</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="cta-open">
                            <span className="cta-tag">OPEN</span>
                            <button className="cta-body" onClick={onConnect} disabled={loading}>
                                {loading
                                    ? <><span className="spinner" /> Connecting</>
                                    : <><Wallet size={16} /> Start — Connect Wallet</>}
                            </button>
                        </span>
                    )}
                </div>
            </header>

            {/* nav pills row — only when connected and nav items present */}
            {account && navItems.length > 0 && (
                <nav className="topnav">
                    {navItems.map(item => {
                        const Icon = ICONS[item.key] || LayoutDashboard;
                        return (
                            <button
                                key={item.key}
                                className={`topnav-item ${activeSection === item.key ? "active" : ""}`}
                                onClick={() => onNavigate(item.key)}
                            >
                                <Icon size={15} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            )}
        </>
    );
}

export default Navbar;
