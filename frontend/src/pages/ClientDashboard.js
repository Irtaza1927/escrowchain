// file: ClientDashboard.js
// description: CLIENT dashboard. post jobs publicly, review applicants and accept one,
// manage milestones with modal confirmations, approve or reject submissions,
// cancel jobs, open disputes. stat cards are clickable and jump to the matching section.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Plus, Briefcase, Coins, CheckCircle2, AlertTriangle, XCircle, ListChecks,
    Users, Ban, Flag, X, RefreshCw, Settings, Clock, Check, Activity
} from "lucide-react";
import toast from "react-hot-toast";
import {
    getEscrowCore, getMilestoneManager, getDisputeResolver,
    parseEth, formatEth
} from "../utils/ethers";
import { celebrate } from "../utils/celebrate";
import JobCard       from "../components/JobCard";
import MilestoneCard from "../components/MilestoneCard";
import Avatar        from "../components/Avatar";
import Timeline      from "../components/Timeline";
import RightPanel    from "../components/RightPanel";
import { ConfirmModal, PromptModal } from "../components/Modal";

const FILTERS = [
    { key: "all",       label: "All" },
    { key: "open",      label: "Open",        status: 0 },
    { key: "progress",  label: "In Progress", status: 1 },
    { key: "completed", label: "Completed",   status: 2 },
    { key: "disputed",  label: "Disputed",    status: 3 },
    { key: "cancelled", label: "Cancelled",   status: 4 },
];

function ClientDashboard({ signer, account, activeSection, onNavigate, onSwitchAccount }) {
    const [jobs,        setJobs]        = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [milestones,  setMilestones]  = useState([]);
    const [applicants,  setApplicants]  = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [fetching,    setFetching]    = useState(true);
    const [filter,      setFilter]      = useState("all");
    const [timelineKey, setTimelineKey] = useState(0);

    const [jobTitle,  setJobTitle]  = useState("");
    const [jobDesc,   setJobDesc]   = useState("");
    const [jobAmount, setJobAmount] = useState("");

    const [msDesc,   setMsDesc]   = useState("");
    const [msAmount, setMsAmount] = useState("");

    // modal state
    const [accepting,  setAccepting]  = useState(null); // freelancer address being accepted
    const [cancelling, setCancelling] = useState(false);
    const [disputing,  setDisputing]  = useState(false);
    const [rejectingMs, setRejectingMs] = useState(null); // milestone object being rejected

    const loadJobs = useCallback(async () => {
        setFetching(true);
        try {
            const contract = getEscrowCore(signer);
            const total    = await contract.getTotalJobs();
            const loaded   = [];
            for (let i = 1; i <= Number(total); i++) {
                try {
                    const job = await contract.getJob(i);
                    if (job.client.toLowerCase() === account.toLowerCase()) loaded.push(job);
                } catch {}
            }
            setJobs(loaded);
        } catch (err) {
            toast.error("Failed to load jobs: " + (err.shortMessage || err.message || ""));
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

    const loadApplicants = useCallback(async (jobId) => {
        try {
            const esc = getEscrowCore(signer);
            const addrs = await esc.getJobApplicants(jobId);
            const loaded = [];
            for (const addr of addrs) {
                const app = await esc.getApplication(jobId, addr);
                loaded.push({ freelancer: addr, application: app });
            }
            setApplicants(loaded);
        } catch { toast.error("Failed to load applicants"); }
    }, [signer]);

    useEffect(() => { loadJobs(); }, [loadJobs]);
    useEffect(() => {
        if (selectedJob) {
            loadMilestones(selectedJob.jobId);
            loadApplicants(selectedJob.jobId);
        }
    }, [selectedJob, loadMilestones, loadApplicants]);

    async function handleCreateJob(e) {
        e.preventDefault();
        if (!jobTitle.trim() || !jobDesc.trim() || !jobAmount) {
            toast.error("Please fill in all fields"); return;
        }
        if (parseFloat(jobAmount) <= 0) {
            toast.error("Budget must be greater than 0"); return;
        }
        setLoading(true);
        const tid = toast.loading("Creating job. Approve in MetaMask...");
        try {
            const contract = getEscrowCore(signer);
            const tx = await contract.createJob(jobTitle, jobDesc, { value: parseEth(jobAmount) });
            toast.loading("Mining transaction...", { id: tid });
            await tx.wait();
            toast.success(`Job posted. ${jobAmount} ETH locked in escrow.`, { id: tid });
            setJobTitle(""); setJobDesc(""); setJobAmount("");
            await loadJobs();
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Transaction failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleAcceptApplicant() {
        const freelancerAddr = accepting;
        setLoading(true);
        const tid = toast.loading("Accepting applicant...");
        try {
            const contract = getEscrowCore(signer);
            const tx = await contract.acceptApplication(selectedJob.jobId, freelancerAddr);
            await tx.wait();
            toast.success("Freelancer accepted. Job is now in progress.", { id: tid });
            setAccepting(null);
            await loadJobs();
            await loadApplicants(selectedJob.jobId);
            const refreshed = await contract.getJob(selectedJob.jobId);
            setSelectedJob(refreshed);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Accept failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleAddMilestone(e) {
        e.preventDefault();
        if (!msDesc.trim() || !msAmount || parseFloat(msAmount) <= 0) {
            toast.error("Please fill in milestone details"); return;
        }
        setLoading(true);
        const tid = toast.loading("Adding milestone...");
        try {
            const contract = getMilestoneManager(signer);
            const tx = await contract.addMilestone(selectedJob.jobId, msDesc, parseEth(msAmount));
            await tx.wait();
            toast.success("Milestone added", { id: tid });
            setMsDesc(""); setMsAmount("");
            await loadMilestones(selectedJob.jobId);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Failed to add milestone", { id: tid });
        }
        setLoading(false);
    }

    async function handleApprove(milestone) {
        setLoading(true);
        const tid = toast.loading("Approving milestone and releasing payment...");
        try {
            const contract = getMilestoneManager(signer);
            const tx = await contract.approveMilestone(milestone.milestoneId);
            await tx.wait();
            toast.success("Milestone approved. Payment released.", { id: tid });
            await loadMilestones(selectedJob.jobId);
            await loadJobs();
            setTimelineKey(k => k + 1);
            // celebrate: bigger burst if this milestone closes the job
            const esc = getEscrowCore(signer);
            const refreshed = await esc.getJob(selectedJob.jobId);
            celebrate(Number(refreshed.status) === 2 ? "job-complete" : "milestone");
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Approval failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleReject(reason) {
        const milestone = rejectingMs;
        setLoading(true);
        const tid = toast.loading("Rejecting milestone...");
        try {
            const contract = getMilestoneManager(signer);
            const tx = await contract.rejectMilestone(milestone.milestoneId, reason);
            await tx.wait();
            toast.success("Milestone rejected. Freelancer will resubmit.", { id: tid });
            setRejectingMs(null);
            await loadMilestones(selectedJob.jobId);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Rejection failed", { id: tid });
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
            await loadJobs();
            const escrow = getEscrowCore(signer);
            const refreshed = await escrow.getJob(selectedJob.jobId);
            setSelectedJob(refreshed);
            setTimelineKey(k => k + 1);
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Dispute failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleCancelJob() {
        setLoading(true);
        const tid = toast.loading("Cancelling job...");
        try {
            const contract = getEscrowCore(signer);
            const tx = await contract.cancelJob(selectedJob.jobId);
            await tx.wait();
            toast.success("Job cancelled and ETH refunded", { id: tid });
            setCancelling(false);
            setSelectedJob(null);
            await loadJobs();
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Cancel failed", { id: tid });
        }
        setLoading(false);
    }

    const stats = useMemo(() => {
        const totalLocked = jobs.reduce((acc, j) => acc + BigInt(j.totalAmount), 0n);
        const open        = jobs.filter(j => Number(j.status) === 0).length;
        const completed   = jobs.filter(j => Number(j.status) === 2).length;
        const disputed    = jobs.filter(j => Number(j.status) === 3).length;
        return { totalLocked, open, completed, disputed };
    }, [jobs]);

    const filteredJobs = useMemo(() => {
        const f = FILTERS.find(x => x.key === filter);
        if (!f || f.key === "all") return jobs;
        return jobs.filter(j => Number(j.status) === f.status);
    }, [jobs, filter]);

    const selectedStatus = selectedJob ? Number(selectedJob.status) : -1;

    const pendingApplicants = applicants.filter(a => Number(a.application.status) === 1);
    const acceptedApplicant = applicants.find(a => Number(a.application.status) === 2);

    return (
        <div className="container fade-in">
        <div className="layout-magazine">
        <div className="layout-main">
            {/* overview */}
            <section id="sec-overview">
                <div className="row-between mb-lg">
                    <h2>Overview</h2>
                    <button className="btn-ghost btn-sm" onClick={loadJobs} disabled={fetching}>
                        <RefreshCw size={14} className={fetching ? "spin-slow" : ""} /> Refresh
                    </button>
                </div>

                <div className="grid grid-4 mb-lg">
                    <button className="stat stat-clickable" onClick={() => onNavigate("jobs")}>
                        <div>
                            <div className="stat-label">Total Jobs</div>
                            <div className="stat-value">{jobs.length}</div>
                        </div>
                        <div className="stat-icon"><Briefcase size={18} /></div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => onNavigate("overview")}>
                        <div>
                            <div className="stat-label">ETH Locked</div>
                            <div className="stat-value">{formatEth(stats.totalLocked)}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(16,185,129,0.14)", color: "#6ee7b7" }}>
                            <Coins size={18} />
                        </div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => { setFilter("open"); onNavigate("jobs"); }}>
                        <div>
                            <div className="stat-label">Open for Apps</div>
                            <div className="stat-value">{stats.open}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(139,92,246,0.14)", color: "#c4b5fd" }}>
                            <Users size={18} />
                        </div>
                    </button>
                    <button className="stat stat-clickable" onClick={() => { setFilter("completed"); onNavigate("jobs"); }}>
                        <div>
                            <div className="stat-label">Completed</div>
                            <div className="stat-value">{stats.completed}</div>
                        </div>
                        <div className="stat-icon" style={{ background: "rgba(16,185,129,0.14)", color: "#6ee7b7" }}>
                            <CheckCircle2 size={18} />
                        </div>
                    </button>
                </div>
            </section>

            {/* create job */}
            <section id="sec-create">
                <div className="panel mb-lg">
                    <div className="row-between mb">
                        <div className="row" style={{ gap: 10 }}>
                            <div className="feature-icon" style={{ marginBottom: 0 }}><Plus size={18} /></div>
                            <div>
                                <h3>Post a New Job</h3>
                                <p className="muted small">ETH is locked immediately. Freelancers will apply with proposals.</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleCreateJob}>
                        <div className="form-group">
                            <label className="form-label">Job Title</label>
                            <input placeholder="e.g. Landing page redesign" value={jobTitle} onChange={e => setJobTitle(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea placeholder="What should the freelancer deliver?" value={jobDesc} onChange={e => setJobDesc(e.target.value)} rows={3} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Total Budget (ETH)</label>
                            <input placeholder="1.5" type="number" step="0.001" min="0" value={jobAmount} onChange={e => setJobAmount(e.target.value)} required />
                            <span className="form-hint">Locked in escrow until milestones are approved.</span>
                        </div>
                        <button type="submit" className="btn-primary btn-lg" disabled={loading}>
                            {loading
                                ? <><span className="spinner" /> Processing</>
                                : <><Plus size={16} /> Post Job and Lock ETH</>}
                        </button>
                    </form>
                </div>
            </section>

            {/* jobs */}
            <section id="sec-jobs">
                <div className="row-between mb">
                    <h3>My Jobs</h3>
                    <div className="tabs">
                        {FILTERS.map(f => (
                            <button key={f.key}
                                className={`tab ${filter === f.key ? "tab-active" : ""}`}
                                onClick={() => setFilter(f.key)}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {fetching ? (
                    <div className="loading"><span className="spinner spinner-lg" /><div className="mt-sm">Loading jobs...</div></div>
                ) : filteredJobs.length === 0 ? (
                    <div className="empty">
                        <div className="empty-icon"><Briefcase size={22} /></div>
                        <h4>{jobs.length === 0 ? "No jobs yet" : "No jobs match this filter"}</h4>
                        <p>{jobs.length === 0 ? "Post your first job above to get started." : "Try a different filter above."}</p>
                    </div>
                ) : (
                    <div className="grid grid-2">
                        {filteredJobs.map(job => (
                            <JobCard
                                key={job.jobId?.toString()}
                                job={job}
                                onAction={() => setSelectedJob(job)}
                                actionLabel="Manage Job"
                                actionIcon={<Settings size={14} />}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* selected job management panel */}
            {selectedJob && (
                <div className="panel mt-lg slide-in">
                    <div className="row-between mb-lg">
                        <div>
                            <span className="tiny muted">Managing Job #{selectedJob.jobId?.toString()}</span>
                            <h3 style={{ marginTop: 4 }}>{selectedJob.title}</h3>
                        </div>
                        <button className="btn-ghost btn-sm" onClick={() => setSelectedJob(null)}>
                            <X size={14} /> Close
                        </button>
                    </div>

                    {selectedStatus === 0 && (
                        <div className="card mb">
                            <div className="row-between mb-sm">
                                <h4>
                                    <Users size={15} style={{ display: "inline", verticalAlign: "-3px" }} />
                                    &nbsp;Applicants ({pendingApplicants.length})
                                </h4>
                                <button className="btn-danger btn-sm" onClick={() => setCancelling(true)} disabled={loading}>
                                    <Ban size={13} /> Cancel and Refund
                                </button>
                            </div>

                            {pendingApplicants.length === 0 ? (
                                <div className="empty">
                                    <div className="empty-icon"><Users size={22} /></div>
                                    <h4>No applicants yet</h4>
                                    <p>Share your job around. Freelancers will see it on the open board.</p>
                                </div>
                            ) : (
                                <div className="col" style={{ gap: 10 }}>
                                    {pendingApplicants.map(({ freelancer, application }) => (
                                        <div key={freelancer} className="card card-tight card-accent fade-in">
                                            <div className="row-between mb-sm">
                                                <div className="row" style={{ gap: 8 }}>
                                                    <Avatar address={freelancer} size={24} />
                                                    <span className="mono-chip">{freelancer.slice(0, 10)}...{freelancer.slice(-6)}</span>
                                                </div>
                                                <span className="pill">
                                                    <Clock size={12} />
                                                    {new Date(Number(application.appliedAt) * 1000).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="small mb">{application.proposal}</p>
                                            <button className="btn-success btn-sm"
                                                onClick={() => setAccepting(freelancer)}
                                                disabled={loading}>
                                                <Check size={13} /> Accept this Freelancer
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {selectedStatus >= 1 && selectedStatus <= 3 && acceptedApplicant && (
                        <div className="card card-accent-success mb">
                            <div className="row" style={{ gap: 10 }}>
                                <Avatar address={acceptedApplicant.freelancer} size={22} />
                                <span className="small">
                                    Working with <span className="mono">
                                        {acceptedApplicant.freelancer.slice(0, 10)}...{acceptedApplicant.freelancer.slice(-6)}
                                    </span>
                                </span>
                            </div>
                        </div>
                    )}

                    {(selectedStatus === 0 || selectedStatus === 1) && (
                        <div className="card mb">
                            <h4 className="mb-sm">
                                <ListChecks size={15} style={{ display: "inline", verticalAlign: "-3px" }} />
                                &nbsp;Add Milestone
                            </h4>
                            <form onSubmit={handleAddMilestone}>
                                <div className="form-group">
                                    <label className="form-label">Deliverable Description</label>
                                    <input placeholder="e.g. Homepage mockup in Figma" value={msDesc} onChange={e => setMsDesc(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Payment (ETH)</label>
                                    <input placeholder="0.5" type="number" step="0.001" min="0" value={msAmount} onChange={e => setMsAmount(e.target.value)} required />
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    <Plus size={14} /> Add Milestone
                                </button>
                            </form>
                        </div>
                    )}

                    {selectedStatus === 1 && (
                        <button className="btn-warning mb" onClick={() => setDisputing(true)} disabled={loading}>
                            <Flag size={14} /> Open Dispute
                        </button>
                    )}

                    {selectedStatus === 4 && (
                        <div className="card card-accent-warning mb">
                            <div className="row" style={{ gap: 10 }}>
                                <XCircle size={20} className="muted" />
                                <span>This job was cancelled. Funds have been refunded.</span>
                            </div>
                        </div>
                    )}

                    <h4 className="mb-sm">Milestones</h4>
                    {milestones.length === 0 ? (
                        <div className="empty">
                            <div className="empty-icon"><ListChecks size={22} /></div>
                            <h4>No milestones yet</h4>
                            <p>Add milestones above to break the job into deliverables.</p>
                        </div>
                    ) : (
                        milestones.map(ms => (
                            <MilestoneCard
                                key={ms.milestoneId?.toString()}
                                milestone={ms}
                                onApprove={handleApprove}
                                onReject={(m) => setRejectingMs(m)}
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
            <ConfirmModal
                open={Boolean(accepting)}
                title="Accept this freelancer?"
                icon={<Check size={18} />}
                description="The job will start right away and all other pending applications become inactive."
                confirmLabel="Yes, Accept"
                confirmClass="btn-success"
                loading={loading}
                onConfirm={handleAcceptApplicant}
                onClose={() => setAccepting(null)}
            />

            <ConfirmModal
                open={cancelling}
                title="Cancel this job?"
                icon={<Ban size={18} />}
                description="Your locked ETH will be refunded in full. This cannot be undone."
                confirmLabel="Yes, Cancel"
                confirmClass="btn-danger"
                loading={loading}
                onConfirm={handleCancelJob}
                onClose={() => setCancelling(false)}
            />

            <PromptModal
                open={Boolean(rejectingMs)}
                title={rejectingMs ? `Reject Milestone #${rejectingMs.milestoneId?.toString()}` : ""}
                icon={<X size={18} />}
                description="Give the freelancer a reason so they can fix the submission."
                placeholder="What was wrong with the delivery?"
                label="Rejection Reason"
                confirmLabel="Reject Milestone"
                confirmClass="btn-danger"
                minLength={5}
                loading={loading}
                onConfirm={handleReject}
                onClose={() => setRejectingMs(null)}
            />

            <PromptModal
                open={disputing}
                title="Open a dispute"
                icon={<Flag size={18} />}
                description="An arbiter will decide how the remaining funds are split."
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
            <RightPanel signer={signer} role="client" isAdmin={false}
                onNavigate={onNavigate} onSwitchAccount={onSwitchAccount}
                refreshKey={timelineKey} />
        </aside>
        </div>
        </div>
    );
}

export default ClientDashboard;
