// file: FreelancerDashboard.js
// description: FREELANCER dashboard. marketplace model: browse all open jobs, apply with a proposal,
// track applications, and for accepted jobs upload deliverables inline on the milestone card.
// stat cards are clickable and jump to the matching section.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Briefcase, Upload, FileText, CheckCircle2, AlertTriangle, Flag, X,
    RefreshCw, Coins, Eye, Search, Send, Clock, Ban, Activity, ArrowRight
} from "lucide-react";
import toast from "react-hot-toast";
import {
    getEscrowCore, getMilestoneManager, getDisputeResolver, formatEth,
    getJobStatusLabel, getApplicationStatusLabel
} from "../utils/ethers";
import { uploadToIPFS } from "../utils/ipfs";
import JobCard       from "../components/JobCard";
import MilestoneCard from "../components/MilestoneCard";
import Avatar        from "../components/Avatar";
import Timeline      from "../components/Timeline";
import RightPanel    from "../components/RightPanel";
import { Modal, PromptModal, ConfirmModal } from "../components/Modal";

const ASSIGNED_FILTERS = [
    { key: "all",       label: "All" },
    { key: "progress",  label: "In Progress", status: 1 },
    { key: "completed", label: "Completed",   status: 2 },
    { key: "disputed",  label: "Disputed",    status: 3 },
];

const APP_STATUS_BADGES = ["badge-pending", "badge-pending", "badge-approved", "badge-cancelled"];

function appStatusBadgeClass(statusNum) {
    return `badge ${APP_STATUS_BADGES[statusNum] || "badge-pending"}`;
}

function FreelancerDashboard({ signer, account, activeSection, onNavigate, onSwitchAccount }) {
    const [assignedJobs, setAssignedJobs] = useState([]);
    const [selectedJob,  setSelectedJob]  = useState(null);
    const [milestones,   setMilestones]   = useState([]);
    const [openJobs,     setOpenJobs]     = useState([]);
    const [applications, setApplications] = useState([]);

    const [loading,        setLoading]        = useState(false);
    const [fetching,       setFetching]       = useState(true);
    const [uploadingMs,    setUploadingMs]    = useState(null);
    const [assignedFilter, setAssignedFilter] = useState("all");
    const [timelineKey,    setTimelineKey]    = useState(0);

    const [applyingTo,  setApplyingTo]  = useState(null);
    const [withdrawId,  setWithdrawId]  = useState(null);
    const [disputing,   setDisputing]   = useState(false);

    const loadAll = useCallback(async () => {
        setFetching(true);
        try {
            const esc = getEscrowCore(signer);
            const total = Number(await esc.getTotalJobs());

            const assigned = [];
            const open     = [];
            const allJobs  = {};
            for (let i = 1; i <= total; i++) {
                try {
                    const job = await esc.getJob(i);
                    allJobs[job.jobId.toString()] = job;
                    if (job.freelancer.toLowerCase() === account.toLowerCase()) {
                        assigned.push(job);
                    } else if (Number(job.status) === 0) {
                        open.push(job);
                    }
                } catch {}
            }
            setAssignedJobs(assigned);
            setOpenJobs(open);

            const appliedJobIds = await esc.getFreelancerJobsApplied(account);
            const apps = [];
            for (const jidBig of appliedJobIds) {
                const jid = jidBig.toString();
                const job = allJobs[jid] || await esc.getJob(jid);
                const application = await esc.getApplication(jid, account);
                apps.push({ job, application });
            }
            setApplications(apps);
        } catch (err) {
            toast.error("Failed to load data: " + (err.shortMessage || err.message || ""));
        }
        setFetching(false);
    }, [signer, account]);

    const loadMilestones = useCallback(async (jobId) => {
        try {
            const contract = getMilestoneManager(signer);
            const ids      = await contract.getJobMilestones(jobId);
            const loaded   = [];
            for (const id of ids) {
                const ms = await contract.getMilestone(id);
                loaded.push(ms);
            }
            setMilestones(loaded);
        } catch { toast.error("Failed to load milestones"); }
    }, [signer]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => {
        if (selectedJob) loadMilestones(selectedJob.jobId);
    }, [selectedJob, loadMilestones]);

    // marketplace: apply with a proposal
    async function handleApply(proposalText) {
        setLoading(true);
        const tid = toast.loading("Submitting your application...");
        try {
            const esc = getEscrowCore(signer);
            const tx  = await esc.applyToJob(applyingTo.jobId, proposalText);
            await tx.wait();
            toast.success("Application sent to client", { id: tid });
            setApplyingTo(null);
            await loadAll();
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Apply failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleWithdraw() {
        const jobId = withdrawId;
        setLoading(true);
        const tid = toast.loading("Withdrawing application...");
        try {
            const esc = getEscrowCore(signer);
            const tx  = await esc.withdrawApplication(jobId);
            await tx.wait();
            toast.success("Application withdrawn", { id: tid });
            setWithdrawId(null);
            await loadAll();
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Withdraw failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleSubmitMilestone(milestone, file) {
        if (!file) {
            toast.error("Please attach a file first"); return;
        }
        setLoading(true);
        setUploadingMs(milestone.milestoneId?.toString());
        const tid = toast.loading("Uploading file to IPFS...");
        try {
            const cid = await uploadToIPFS(file);
            toast.loading("File pinned. Anchoring on chain...", { id: tid });
            const contract = getMilestoneManager(signer);
            const tx = await contract.submitMilestone(milestone.milestoneId, cid);
            await tx.wait();
            toast.success("Milestone submitted. Client will review.", { id: tid });
            setUploadingMs(null);
            await loadMilestones(selectedJob.jobId);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Submission failed", { id: tid });
            setUploadingMs(null);
        }
        setLoading(false);
    }

    async function handleOpenDispute(reason) {
        setLoading(true);
        const tid = toast.loading("Opening dispute...");
        try {
            const contract = getDisputeResolver(signer);
            const tx = await contract.openDispute(selectedJob.jobId, reason);
            await tx.wait();
            toast.success("Dispute opened. Awaiting arbiter.", { id: tid });
            setDisputing(false);
            await loadAll();
            const esc = getEscrowCore(signer);
            const refreshed = await esc.getJob(selectedJob.jobId);
            setSelectedJob(refreshed);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Dispute failed", { id: tid });
        }
        setLoading(false);
    }

    const stats = useMemo(() => {
        const earned = assignedJobs.reduce((acc, j) => acc + BigInt(j.amountReleased || 0n), 0n);
        const active = assignedJobs.filter(j => Number(j.status) === 1).length;
        const done   = assignedJobs.filter(j => Number(j.status) === 2).length;
        const pendingApps = applications.filter(a => Number(a.application.status) === 1).length;
        return { earned, active, done, pendingApps };
    }, [assignedJobs, applications]);

    const filteredAssigned = useMemo(() => {
        const f = ASSIGNED_FILTERS.find(x => x.key === assignedFilter);
        if (!f || f.key === "all") return assignedJobs;
        return assignedJobs.filter(j => Number(j.status) === f.status);
    }, [assignedJobs, assignedFilter]);

    const alreadyAppliedIds = useMemo(() => {
        const s = new Set();
        for (const a of applications) {
            const st = Number(a.application.status);
            if (st === 1 || st === 2) s.add(a.job.jobId.toString());
        }
        return s;
    }, [applications]);

    const selectedStatus = selectedJob ? Number(selectedJob.status) : -1;

    return (
        <div className="container fade-in">
        <div className="layout-magazine">
        <div className="layout-main">
            {/* overview */}
            <section id="sec-overview">
                <div className="row-between mb-lg">
                    <h2>Overview</h2>
                    <button className="btn-ghost btn-sm" onClick={loadAll} disabled={fetching}>
                        <RefreshCw size={14} className={fetching ? "spin-slow" : ""} /> Refresh
                    </button>
                </div>

                <div className="grid grid-4 mb-lg">
                    <button className="stat stat-clickable" onClick={() => onNavigate("browse")}>
                        <div>
                            <div className="stat-label">Open Jobs Available</div>
                            <div className="stat-value">{openJobs.length}</div>
                        </div>
                        <div className="stat-icon"><Search size={18} /></div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => onNavigate("applications")}>
                        <div>
                            <div className="stat-label">My Applications</div>
                            <div className="stat-value">{stats.pendingApps}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(139,92,246,0.14)", color: "#c4b5fd" }}>
                            <Send size={18} />
                        </div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => { setAssignedFilter("progress"); onNavigate("jobs"); }}>
                        <div>
                            <div className="stat-label">Active Jobs</div>
                            <div className="stat-value">{stats.active}</div>
                        </div>
                        <div className="stat-icon"><Briefcase size={18} /></div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => { setAssignedFilter("completed"); onNavigate("jobs"); }}>
                        <div>
                            <div className="stat-label">ETH Earned</div>
                            <div className="stat-value">{formatEth(stats.earned)}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(16,185,129,0.14)", color: "#6ee7b7" }}>
                            <Coins size={18} />
                        </div>
                    </button>
                </div>
            </section>

            {/* browse open jobs */}
            <section id="sec-browse">
                <div className="row-between mb">
                    <div>
                        <h3>Browse Open Jobs</h3>
                        <p className="muted small">All jobs on the marketplace that are still open for applications.</p>
                    </div>
                </div>

                {fetching ? (
                    <div className="loading"><span className="spinner spinner-lg" /><div className="mt-sm">Loading...</div></div>
                ) : openJobs.length === 0 ? (
                    <div className="empty mb-lg">
                        <div className="empty-icon"><Search size={22} /></div>
                        <h4>No open jobs right now</h4>
                        <p>Check back later. Clients post new jobs here.</p>
                    </div>
                ) : (
                    <div className="grid grid-2 mb-lg">
                        {openJobs.map(job => {
                            const jid = job.jobId.toString();
                            const already = alreadyAppliedIds.has(jid);
                            return (
                                <JobCard
                                    key={jid}
                                    job={job}
                                    onAction={already ? null : () => setApplyingTo(job)}
                                    actionLabel={already ? "Already Applied" : "Apply to this Job"}
                                    actionIcon={already ? <CheckCircle2 size={14} /> : <Send size={14} />}
                                    actionClass={already ? "btn-secondary" : "btn-primary"}
                                />
                            );
                        })}
                    </div>
                )}
            </section>

            {/* my applications */}
            <section id="sec-applications">
                <div className="row-between mb">
                    <h3>My Applications</h3>
                    <span className="pill">{applications.length} total</span>
                </div>

                {applications.length === 0 ? (
                    <div className="empty mb-lg">
                        <div className="empty-icon"><Send size={22} /></div>
                        <h4>You haven't applied to any jobs yet</h4>
                        <p>Browse open jobs above and send your first proposal.</p>
                    </div>
                ) : (
                    <div className="grid grid-2 mb-lg">
                        {applications.map(({ job, application }) => {
                            const appStatus = Number(application.status);
                            const jobStatus = Number(job.status);
                            return (
                                <div key={job.jobId.toString()} className="card card-accent fade-in">
                                    <div className="row-between mb-sm">
                                        <div>
                                            <span className="tiny muted">Application for Job #{job.jobId.toString()}</span>
                                            <h3 style={{ marginTop: 2 }}>{job.title}</h3>
                                        </div>
                                        <span className={appStatusBadgeClass(appStatus)}>
                                            {getApplicationStatusLabel(appStatus)}
                                        </span>
                                    </div>
                                    <p className="muted small mb">
                                        <strong>Your proposal:</strong> {application.proposal}
                                    </p>
                                    <div className="row mb" style={{ gap: 8, flexWrap: "wrap" }}>
                                        <span className="pill pill-brand">
                                            <Coins size={12} /> {formatEth(job.totalAmount)} ETH budget
                                        </span>
                                        <span className="pill">
                                            <Clock size={12} />
                                            {new Date(Number(application.appliedAt) * 1000).toLocaleString()}
                                        </span>
                                        <span className="pill">
                                            Job: {getJobStatusLabel(jobStatus)}
                                        </span>
                                    </div>

                                    {appStatus === 1 && (
                                        <button
                                            className="btn-secondary btn-sm"
                                            onClick={() => setWithdrawId(job.jobId)}
                                            disabled={loading || jobStatus !== 0}
                                            title={jobStatus !== 0 ? "Job is no longer open" : ""}
                                        >
                                            <Ban size={13} /> Withdraw
                                        </button>
                                    )}
                                    {appStatus === 2 && (
                                        <span className="small muted">
                                            <CheckCircle2 size={13} style={{ display: "inline", verticalAlign: "-2px" }} />
                                            &nbsp;You were selected for this job
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* assigned jobs */}
            <section id="sec-jobs">
                <div className="row-between mb">
                    <h3>Assigned Jobs</h3>
                    <div className="tabs">
                        {ASSIGNED_FILTERS.map(f => (
                            <button key={f.key}
                                className={`tab ${assignedFilter === f.key ? "tab-active" : ""}`}
                                onClick={() => setAssignedFilter(f.key)}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {fetching ? (
                    <div className="loading"><span className="spinner spinner-lg" /><div className="mt-sm">Loading...</div></div>
                ) : filteredAssigned.length === 0 ? (
                    <div className="empty">
                        <div className="empty-icon"><Briefcase size={22} /></div>
                        <h4>{assignedJobs.length === 0 ? "No jobs assigned yet" : "No jobs match this filter"}</h4>
                        <p>Apply to open jobs above. Once a client accepts you, the job will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-2">
                        {filteredAssigned.map(job => (
                            <JobCard
                                key={job.jobId?.toString()}
                                job={job}
                                onAction={() => setSelectedJob(job)}
                                actionLabel="Open Job"
                                actionIcon={<Eye size={14} />}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* selected job panel: milestones + inline upload + timeline */}
            {selectedJob && (
                <div className="panel mt-lg slide-in">
                    <div className="row-between mb-lg">
                        <div>
                            <span className="tiny muted">Job #{selectedJob.jobId?.toString()}</span>
                            <h3 style={{ marginTop: 4 }}>{selectedJob.title}</h3>
                        </div>
                        <button className="btn-ghost btn-sm" onClick={() => setSelectedJob(null)}>
                            <X size={14} /> Close
                        </button>
                    </div>

                    {selectedStatus === 1 && (
                        <button className="btn-warning mb" onClick={() => setDisputing(true)} disabled={loading}>
                            <Flag size={14} /> Open Dispute
                        </button>
                    )}

                    <h4 className="mb-sm">Milestones</h4>
                    {milestones.length === 0 ? (
                        <div className="empty">
                            <div className="empty-icon"><FileText size={22} /></div>
                            <h4>No milestones yet</h4>
                            <p>Waiting for the client to add milestones.</p>
                        </div>
                    ) : (
                        milestones.map(ms => (
                            <MilestoneCard
                                key={ms.milestoneId?.toString()}
                                milestone={ms}
                                onSubmit={
                                    uploadingMs === ms.milestoneId?.toString() || loading
                                        ? null
                                        : handleSubmitMilestone
                                }
                                busy={loading}
                            />
                        ))
                    )}

                    <div className="divider" />
                    <h4 className="mb-sm">
                        <Activity size={15} style={{ display: "inline", verticalAlign: "-3px" }} />
                        &nbsp;Activity Timeline
                    </h4>
                    <Timeline signer={signer} jobId={selectedJob.jobId} refreshKey={timelineKey} />
                </div>
            )}

            {/* modals */}
            <PromptModal
                open={Boolean(applyingTo)}
                title={applyingTo ? `Apply to Job #${applyingTo.jobId?.toString()}` : ""}
                icon={<Send size={18} />}
                description={applyingTo
                    ? `Budget: ${formatEth(applyingTo.totalAmount)} ETH. Keep your proposal short and specific.`
                    : ""}
                placeholder="Why are you the right fit? Any portfolio links?"
                label="Your Proposal"
                confirmLabel="Submit Application"
                minLength={5}
                loading={loading}
                onConfirm={handleApply}
                onClose={() => setApplyingTo(null)}
            />

            <ConfirmModal
                open={Boolean(withdrawId)}
                title="Withdraw application"
                icon={<Ban size={18} />}
                description="You can reapply later as long as the job is still open."
                confirmLabel="Yes, Withdraw"
                confirmClass="btn-danger"
                loading={loading}
                onConfirm={handleWithdraw}
                onClose={() => setWithdrawId(null)}
            />

            <PromptModal
                open={disputing}
                title="Open a dispute"
                icon={<Flag size={18} />}
                description="An arbiter will decide how the remaining funds are split. Explain what went wrong."
                placeholder="Describe the issue in detail."
                label="Dispute Reason"
                confirmLabel="Submit Dispute"
                confirmClass="btn-warning"
                minLength={10}
                loading={loading}
                onConfirm={handleOpenDispute}
                onClose={() => setDisputing(false)}
            />
        </div>
        <aside className="layout-aside">
            <RightPanel signer={signer} role="freelancer" isAdmin={false}
                onNavigate={onNavigate} onSwitchAccount={onSwitchAccount}
                refreshKey={timelineKey} />
        </aside>
        </div>
        </div>
    );
}

export default FreelancerDashboard;
