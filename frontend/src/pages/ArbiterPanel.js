// file: ArbiterPanel.js
// description: ARBITER panel. view open disputes, resolve by splitting remaining escrowed funds.
// stat cards jump to sections. admin tools visible to DEFAULT_ADMIN_ROLE holder.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Scale, AlertTriangle, CheckCircle2, RefreshCw, Gavel, Coins, Briefcase,
    ShieldCheck, UserPlus, Pause, Play
} from "lucide-react";
import toast from "react-hot-toast";
import { getEscrowCore, getMilestoneManager, getDisputeResolver, formatEth } from "../utils/ethers";
import Avatar from "../components/Avatar";
import RightPanel from "../components/RightPanel";
import { ConfirmModal } from "../components/Modal";

function ArbiterPanel({ signer, account, isAdmin, activeSection, onNavigate, onSwitchAccount }) {
    const [newArbiterAddr, setNewArbiterAddr] = useState("");
    const [disputes, setDisputes] = useState([]);
    const [jobs,     setJobs]     = useState({});
    const [loading,  setLoading]  = useState(false);
    const [fetching, setFetching] = useState(true);

    const [clientPct,     setClientPct]     = useState(50);
    const [freelancerPct, setFreelancerPct] = useState(50);

    const [resolving,  setResolving]  = useState(null); // dispute being resolved
    const [pauseAll,   setPauseAll]   = useState(null); // true for pause confirmation, false for unpause

    const loadDisputes = useCallback(async () => {
        setFetching(true);
        try {
            const dr  = getDisputeResolver(signer);
            const esc = getEscrowCore(signer);
            const total  = await dr.getTotalDisputes();
            const loaded = [];
            const cache  = {};
            for (let i = 1; i <= Number(total); i++) {
                try {
                    const d = await dr.getDispute(i);
                    loaded.push(d);
                    const jid = d.jobId.toString();
                    if (!cache[jid]) cache[jid] = await esc.getJob(jid);
                } catch {}
            }
            setDisputes(loaded);
            setJobs(cache);
        } catch (err) { toast.error("Failed to load disputes"); }
        setFetching(false);
    }, [signer]);

    useEffect(() => { loadDisputes(); }, [loadDisputes]);

    function handleClientSlider(val) {
        const n = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
        setClientPct(n);
        setFreelancerPct(100 - n);
    }

    async function handleGrantArbiter() {
        const addr = newArbiterAddr.trim();
        if (!addr.startsWith("0x") || addr.length !== 42) {
            toast.error("Please enter a valid wallet address (0x...)"); return;
        }
        if (addr.toLowerCase() === account.toLowerCase()) {
            toast.error("You already have the arbiter role"); return;
        }
        setLoading(true);
        const tid = toast.loading("Granting on EscrowCore (1 of 3)...");
        try {
            const esc = getEscrowCore(signer);
            const ms  = getMilestoneManager(signer);
            const dr  = getDisputeResolver(signer);

            let tx = await esc.grantArbiterRole(addr);
            await tx.wait();

            toast.loading("Granting on MilestoneManager (2 of 3)...", { id: tid });
            tx = await ms.grantArbiterRole(addr);
            await tx.wait();

            toast.loading("Granting on DisputeResolver (3 of 3)...", { id: tid });
            tx = await dr.grantArbiterRole(addr);
            await tx.wait();

            toast.success(`Arbiter role granted to ${addr.slice(0, 10)}...${addr.slice(-4)}`, { id: tid });
            setNewArbiterAddr("");
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Grant failed", { id: tid });
        }
        setLoading(false);
    }

    async function handlePauseToggle() {
        const doPause = pauseAll === true;
        setLoading(true);
        const tid = toast.loading(doPause ? "Pausing all contracts..." : "Unpausing all contracts...");
        try {
            const esc = getEscrowCore(signer);
            const ms  = getMilestoneManager(signer);
            const dr  = getDisputeResolver(signer);
            const fn  = doPause ? "pause" : "unpause";

            let tx = await esc[fn]();   await tx.wait();
            tx     = await ms[fn]();    await tx.wait();
            tx     = await dr[fn]();    await tx.wait();

            toast.success(doPause ? "All contracts paused" : "All contracts resumed", { id: tid });
            setPauseAll(null);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Operation failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleResolve() {
        const dispute = resolving;
        if (clientPct + freelancerPct !== 100) {
            toast.error("Split must total 100%"); return;
        }
        setLoading(true);
        const tid = toast.loading("Resolving dispute and releasing funds...");
        try {
            const dr = getDisputeResolver(signer);
            const tx = await dr.resolveDispute(dispute.disputeId, clientPct, freelancerPct);
            await tx.wait();
            toast.success(`Resolved. Client ${clientPct}% / Freelancer ${freelancerPct}%`, { id: tid });
            setResolving(null);
            await loadDisputes();
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Resolution failed", { id: tid });
        }
        setLoading(false);
    }

    const openDisputes     = useMemo(() => disputes.filter(d => Number(d.status) === 0), [disputes]);
    const resolvedDisputes = useMemo(() => disputes.filter(d => Number(d.status) === 1), [disputes]);

    return (
        <div className="container fade-in">
        <div className="layout-magazine">
        <div className="layout-main">
            {/* overview */}
            <section id="sec-overview">
                <div className="row-between mb-lg">
                    <h2>Overview</h2>
                    <button className="btn-ghost btn-sm" onClick={loadDisputes} disabled={fetching}>
                        <RefreshCw size={14} className={fetching ? "spin-slow" : ""} /> Refresh
                    </button>
                </div>

                <div className="grid grid-4 mb-lg">
                    <button className="stat stat-clickable" onClick={() => onNavigate("open")}>
                        <div>
                            <div className="stat-label">Open Disputes</div>
                            <div className="stat-value">{openDisputes.length}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(244,63,94,0.14)", color: "#fda4af" }}>
                            <AlertTriangle size={18} />
                        </div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => onNavigate("resolved")}>
                        <div>
                            <div className="stat-label">Resolved</div>
                            <div className="stat-value">{resolvedDisputes.length}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(16,185,129,0.14)", color: "#6ee7b7" }}>
                            <CheckCircle2 size={18} />
                        </div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => onNavigate("split")}>
                        <div>
                            <div className="stat-label">Set Split</div>
                            <div className="stat-value">{clientPct}/{freelancerPct}</div>
                        </div>
                        <div className="stat-icon"><Scale size={18} /></div>
                    </button>
                    {isAdmin && (
                        <button className="stat stat-clickable" onClick={() => onNavigate("admin")}>
                            <div>
                                <div className="stat-label">Role</div>
                                <div className="stat-value" style={{ fontSize: 18 }}>Admin</div>
                            </div>
                            <div className="stat-icon" style={{ background: "rgba(139,92,246,0.14)", color: "#c4b5fd" }}>
                                <ShieldCheck size={18} />
                            </div>
                        </button>
                    )}
                </div>
            </section>

            {/* split control */}
            <section id="sec-split">
                <div className="panel mb-lg">
                    <div className="row-between mb">
                        <div className="row" style={{ gap: 10 }}>
                            <div className="feature-icon" style={{ marginBottom: 0 }}><Scale size={18} /></div>
                            <div>
                                <h3>Resolution Split</h3>
                                <p className="muted small">Must total exactly 100%. Controls how escrow funds split on resolve.</p>
                            </div>
                        </div>
                        <span className={`pill ${clientPct + freelancerPct === 100 ? "pill-live" : "pill-warn"}`}>
                            Total: {clientPct + freelancerPct}%
                        </span>
                    </div>

                    <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <label className="form-label">Client Share</label>
                            <input type="number" min="0" max="100" value={clientPct}
                                onChange={e => handleClientSlider(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <label className="form-label">Freelancer Share</label>
                            <input type="number" min="0" max="100" value={freelancerPct}
                                onChange={e => handleClientSlider(100 - (parseInt(e.target.value, 10) || 0))} />
                        </div>
                    </div>

                    <div className="split-bar mt">
                        <div style={{ width: `${clientPct}%`, background: "linear-gradient(90deg, var(--cyan-500), var(--blue-500))" }} />
                        <div style={{ width: `${freelancerPct}%`, background: "linear-gradient(90deg, var(--violet-500), #7c3aed)" }} />
                    </div>
                    <div className="row-between small mt-sm">
                        <span className="muted">Client {clientPct}%</span>
                        <span className="muted">Freelancer {freelancerPct}%</span>
                    </div>
                </div>
            </section>

            {/* open disputes */}
            <section id="sec-open">
                <h3 className="mb">
                    <AlertTriangle size={18} style={{ display: "inline", verticalAlign: "-3px", color: "var(--danger-400)" }} />
                    &nbsp;Open Disputes ({openDisputes.length})
                </h3>

                {fetching ? (
                    <div className="loading"><span className="spinner spinner-lg" /><div className="mt-sm">Loading disputes...</div></div>
                ) : openDisputes.length === 0 ? (
                    <div className="empty mb-lg">
                        <div className="empty-icon"><CheckCircle2 size={22} /></div>
                        <h4>No open disputes</h4>
                        <p>All clear. Clients and freelancers are getting along.</p>
                    </div>
                ) : (
                    <div className="grid grid-2 mb-lg">
                        {openDisputes.map(d => {
                            const job = jobs[d.jobId?.toString()];
                            const remaining = job ? BigInt(job.totalAmount) - BigInt(job.amountReleased) : 0n;
                            return (
                                <div className="card card-accent-danger fade-in" key={d.disputeId?.toString()}>
                                    <div className="row-between mb-sm">
                                        <span style={{ fontWeight: 700 }}>Dispute #{d.disputeId?.toString()}</span>
                                        <span className="badge badge-disputed">OPEN</span>
                                    </div>

                                    <p className="small mb-sm">
                                        <strong>Reason:</strong> <span className="muted">{d.reason}</span>
                                    </p>

                                    <div className="row mb" style={{ gap: 10, flexWrap: "wrap" }}>
                                        <span className="pill">
                                            <Briefcase size={12} /> Job #{d.jobId?.toString()} / {job?.title || "..."}
                                        </span>
                                        {job && (
                                            <span className="pill pill-brand">
                                                <Coins size={12} /> {formatEth(remaining)} ETH remaining
                                            </span>
                                        )}
                                    </div>

                                    <div className="row small muted mb" style={{ gap: 6 }}>
                                        <Avatar address={d.openedBy} size={18} />
                                        <span>Opened by <span className="mono">{d.openedBy?.slice(0, 10)}...{d.openedBy?.slice(-4)}</span></span>
                                    </div>

                                    <button className="btn-primary btn-full"
                                        onClick={() => setResolving(d)}
                                        disabled={loading || clientPct + freelancerPct !== 100}>
                                        <Gavel size={14} /> Resolve {clientPct}% / {freelancerPct}%
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* admin tools */}
            {isAdmin && (
                <section id="sec-admin">
                    <div className="panel mb-lg card-accent" style={{ borderLeftColor: "var(--violet-500)" }}>
                        <div className="row-between mb">
                            <div className="row" style={{ gap: 10 }}>
                                <div className="feature-icon" style={{ marginBottom: 0, background: "rgba(139,92,246,0.14)", color: "#c4b5fd" }}>
                                    <ShieldCheck size={18} />
                                </div>
                                <div>
                                    <h3>Admin Tools</h3>
                                    <p className="muted small">Only the contract admin sees this section.</p>
                                </div>
                            </div>
                            <span className="badge badge-submitted">ADMIN</span>
                        </div>

                        <div className="card mb">
                            <h4 className="mb-sm">
                                <UserPlus size={15} style={{ display: "inline", verticalAlign: "-3px" }} />
                                &nbsp;Grant Arbiter Role
                            </h4>
                            <p className="muted small mb">
                                Make another wallet an arbiter. This runs 3 transactions, one on each contract.
                            </p>
                            <div className="form-group">
                                <label className="form-label">Wallet Address</label>
                                <input
                                    placeholder="0x..."
                                    value={newArbiterAddr}
                                    onChange={e => setNewArbiterAddr(e.target.value)}
                                />
                            </div>
                            <button className="btn-primary" onClick={handleGrantArbiter} disabled={loading}>
                                {loading
                                    ? <><span className="spinner" /> Processing</>
                                    : <><ShieldCheck size={14} /> Grant Arbiter Role</>}
                            </button>
                        </div>

                        <div className="card">
                            <h4 className="mb-sm">Emergency Controls</h4>
                            <p className="muted small mb">Pause freezes all contract operations. Use only in emergencies.</p>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                <button className="btn-warning" onClick={() => setPauseAll(true)} disabled={loading}>
                                    <Pause size={14} /> Pause All
                                </button>
                                <button className="btn-success" onClick={() => setPauseAll(false)} disabled={loading}>
                                    <Play size={14} /> Unpause All
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* resolved */}
            <section id="sec-resolved">
                <h3 className="mb">
                    <CheckCircle2 size={18} style={{ display: "inline", verticalAlign: "-3px", color: "var(--success-400)" }} />
                    &nbsp;Resolved History ({resolvedDisputes.length})
                </h3>
                {resolvedDisputes.length === 0 ? (
                    <div className="empty">
                        <div className="empty-icon"><Gavel size={22} /></div>
                        <h4>No resolutions yet</h4>
                        <p>Your resolved cases will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-2">
                        {resolvedDisputes.map(d => (
                            <div className="card card-accent-success fade-in" key={d.disputeId?.toString()} style={{ opacity: 0.9 }}>
                                <div className="row-between mb-sm">
                                    <span style={{ fontWeight: 700 }}>
                                        Dispute #{d.disputeId?.toString()} / Job #{d.jobId?.toString()}
                                    </span>
                                    <span className="badge badge-approved">RESOLVED</span>
                                </div>
                                <p className="small muted mb-sm">
                                    Split: <strong>Client {d.clientShare?.toString()}%</strong> / <strong>Freelancer {d.freelancerShare?.toString()}%</strong>
                                </p>
                                <div className="row small subtle" style={{ gap: 6 }}>
                                    <Avatar address={d.resolvedBy} size={16} />
                                    <span>by <span className="mono">{d.resolvedBy?.slice(0, 10)}...{d.resolvedBy?.slice(-4)}</span></span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* modals */}
            <ConfirmModal
                open={Boolean(resolving)}
                title="Resolve dispute?"
                icon={<Gavel size={18} />}
                description={resolving
                    ? `Split for Dispute #${resolving.disputeId?.toString()}: Client ${clientPct}% / Freelancer ${freelancerPct}%. This releases remaining funds and cannot be undone.`
                    : ""}
                confirmLabel="Resolve Now"
                confirmClass="btn-primary"
                loading={loading}
                onConfirm={handleResolve}
                onClose={() => setResolving(null)}
            />

            <ConfirmModal
                open={pauseAll !== null}
                title={pauseAll ? "Pause all contracts?" : "Unpause all contracts?"}
                icon={pauseAll ? <Pause size={18} /> : <Play size={18} />}
                description={pauseAll
                    ? "This freezes every state-changing function on all three contracts."
                    : "This resumes normal operation on all three contracts."}
                confirmLabel={pauseAll ? "Pause All" : "Unpause All"}
                confirmClass={pauseAll ? "btn-warning" : "btn-success"}
                loading={loading}
                onConfirm={handlePauseToggle}
                onClose={() => setPauseAll(null)}
            />
        </div>
        <aside className="layout-aside">
            <RightPanel signer={signer} role="arbiter" isAdmin={isAdmin}
                onNavigate={onNavigate} onSwitchAccount={onSwitchAccount} />
        </aside>
        </div>
        </div>
    );
}

export default ArbiterPanel;
