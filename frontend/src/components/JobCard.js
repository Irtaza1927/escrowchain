// file: JobCard.js
// description: reusable card component for displaying a single job summary.

import React from "react";
import { Coins, Briefcase, ArrowRight } from "lucide-react";
import { ethers } from "ethers";
import { formatEth, getJobStatusLabel } from "../utils/ethers";
import Avatar from "./Avatar";

const STATUS_CLASSES = ["badge-open", "badge-progress", "badge-completed", "badge-disputed", "badge-cancelled"];
const ACCENT_CLASSES = ["card-accent", "card-accent", "card-accent-success", "card-accent-danger", "card-accent-warning"];

function statusBadgeClass(statusNum) {
    return `badge ${STATUS_CLASSES[statusNum] || "badge-pending"}`;
}
function accentClass(statusNum) {
    return ACCENT_CLASSES[statusNum] || "";
}

function JobCard({ job, onAction, actionLabel = "Manage", actionIcon, actionClass = "btn-primary", children }) {
    const status = Number(job.status);
    // show a progress bar once the job has started moving money or is in progress
    const released = BigInt(job.amountReleased || 0n);
    const total    = BigInt(job.totalAmount   || 0n);
    const pct      = total > 0n ? Number((released * 10000n) / total) / 100 : 0;
    const showProgress = status === 1 || status === 2 || status === 3;

    return (
        <div className={`card card-hover ${accentClass(status)} fade-in`}>
            <div className="row-between mb-sm">
                <div className="row" style={{ gap: 10 }}>
                    <div className="feature-icon" style={{ width: 36, height: 36, marginBottom: 0 }}>
                        <Briefcase size={16} />
                    </div>
                    <div>
                        <span className="tiny muted">Job #{job.jobId?.toString()}</span>
                        <h3 style={{ marginTop: 2 }}>{job.title}</h3>
                    </div>
                </div>
                <span className={statusBadgeClass(status)}>{getJobStatusLabel(status)}</span>
            </div>

            <p className="muted small mb" style={{ minHeight: 18 }}>
                {job.description || <span className="subtle">No description</span>}
            </p>

            <div className="row mb-sm" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="pill pill-brand">
                    <Coins size={13} />
                    <strong>{formatEth(job.totalAmount)}</strong> ETH locked
                </span>
                <span className="pill">
                    <Avatar address={job.client} size={16} />
                    <span className="mono">{job.client?.slice(0, 6)}...{job.client?.slice(-4)}</span>
                </span>
            </div>

            {showProgress && (
                <div className="jobcard-progress-wrap">
                    <div className="jobcard-progress-label">
                        <span>Paid progress</span>
                        <span>{formatEth(released)} / {formatEth(total)} ETH ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="progress">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            {children}

            {onAction && (
                <button className={`${actionClass} btn-full`} onClick={() => onAction(job)}>
                    {actionIcon} {actionLabel} <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
}

export default JobCard;
