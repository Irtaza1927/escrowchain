// file: Timeline.js
// description: vertical activity timeline for a job. renders a single chronological
// trail of every on-chain event tied to the job across all three contracts.

import React, { useEffect, useState } from "react";
import {
    Briefcase, Send, UserCheck, Ban, Plus, Upload, Check, X,
    Coins, CheckCircle2, XCircle, Flag, Gavel
} from "lucide-react";
import { fetchJobEvents, EVENT_TYPES } from "../utils/jobEvents";
import { formatEth } from "../utils/ethers";

const ICONS = {
    created:       Briefcase,
    applied:       Send,
    accepted:      UserCheck,
    withdrawn:     Ban,
    assigned:      UserCheck,
    ms_added:      Plus,
    ms_submitted:  Upload,
    ms_approved:   Check,
    ms_rejected:   X,
    paid:          Coins,
    completed:     CheckCircle2,
    cancelled:     XCircle,
    disputed:      Flag,
    dispute_resolved: Gavel,
};

const COLORS = {
    cyan:   { bg: "rgba(34,211,238,0.15)",  fg: "#67e8f9" },
    violet: { bg: "rgba(139,92,246,0.15)",  fg: "#c4b5fd" },
    green:  { bg: "rgba(16,185,129,0.15)",  fg: "#6ee7b7" },
    red:    { bg: "rgba(244,63,94,0.15)",   fg: "#fda4af" },
    amber:  { bg: "rgba(245,158,11,0.15)",  fg: "#fcd34d" },
    slate:  { bg: "rgba(148,163,184,0.15)", fg: "#cbd5e1" },
};

function shortAddr(a) {
    if (!a) return "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function detailFor(ev) {
    const a = ev.args || {};
    switch (ev.type) {
        case "created":          return `${a.title || ""} for ${formatEth(a.amount || 0n)} ETH by ${shortAddr(a.client)}`;
        case "applied":          return `${shortAddr(a.freelancer)} applied with: "${(a.proposal || "").slice(0, 60)}${(a.proposal || "").length > 60 ? "..." : ""}"`;
        case "accepted":         return `${shortAddr(a.freelancer)} was selected`;
        case "withdrawn":        return `${shortAddr(a.freelancer)} withdrew their application`;
        case "assigned":         return `Assigned to ${shortAddr(a.freelancer)}`;
        case "ms_added":         return `Milestone #${a.milestoneId?.toString()}: "${a.description}" (${formatEth(a.amount || 0n)} ETH)`;
        case "ms_submitted":     return `Milestone #${a.milestoneId?.toString()} submitted by ${shortAddr(a.freelancer)}`;
        case "ms_approved":      return `Milestone #${a.milestoneId?.toString()} approved (${formatEth(a.amountReleased || 0n)} ETH released)`;
        case "ms_rejected":      return `Milestone #${a.milestoneId?.toString()} rejected: "${(a.reason || "").slice(0, 60)}"`;
        case "paid":             return `${formatEth(a.amount || 0n)} ETH to ${shortAddr(a.to)}`;
        case "completed":        return "All funds have been released";
        case "cancelled":        return `Refund of ${formatEth(a.refundAmount || 0n)} ETH sent to ${shortAddr(a.client)}`;
        case "disputed":         return "Job is now awaiting arbitration";
        case "dispute_resolved": return "Arbiter has distributed the remaining funds";
        default:                 return "";
    }
}

function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleString();
}

function Timeline({ signer, jobId, refreshKey = 0 }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const evs = await fetchJobEvents(signer, jobId);
            if (!cancelled) {
                setEvents(evs);
                setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [signer, jobId, refreshKey]);

    if (loading) {
        return (
            <div className="loading">
                <span className="spinner spinner-lg" />
                <div className="mt-sm">Loading activity...</div>
            </div>
        );
    }

    if (events.length === 0) {
        return <div className="muted small">No activity yet.</div>;
    }

    return (
        <div className="timeline">
            {events.map((ev, i) => {
                const meta = EVENT_TYPES[ev.type] || { label: ev.name, color: "slate" };
                const palette = COLORS[meta.color] || COLORS.slate;
                const Icon = ICONS[ev.type] || Briefcase;
                return (
                    <div key={`${ev.txHash}-${i}`} className="timeline-item">
                        <div className="timeline-icon" style={{ background: palette.bg, color: palette.fg }}>
                            <Icon size={14} />
                        </div>
                        <div className="timeline-content">
                            <div className="row-between" style={{ gap: 8 }}>
                                <strong style={{ fontSize: 13.5 }}>{meta.label}</strong>
                                <span className="subtle small">{formatTime(ev.timestamp)}</span>
                            </div>
                            <div className="muted small" style={{ marginTop: 2 }}>{detailFor(ev)}</div>
                            <div className="mono subtle" style={{ fontSize: 11, marginTop: 4 }}>
                                block {ev.blockNumber} &middot; {ev.txHash.slice(0, 12)}...
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default Timeline;
