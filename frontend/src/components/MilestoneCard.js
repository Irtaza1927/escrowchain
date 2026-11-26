// file: MilestoneCard.js
// description: reusable card for a single milestone. in freelancer mode the file picker
// and submit button live inside this card so the whole submission flow happens in one place.

import React, { useState } from "react";
import { Coins, Check, X, Upload, FileText, ExternalLink, Paperclip } from "lucide-react";
import { formatEth, getMilestoneStatusLabel } from "../utils/ethers";
import { getIPFSUrl, isDemoMode } from "../utils/ipfs";

const STATUS_CLASSES = ["badge-pending", "badge-submitted", "badge-approved", "badge-rejected"];
const ACCENTS        = ["card-accent", "card-accent", "card-accent-success", "card-accent-danger"];

function statusBadgeClass(statusNum) {
    return `badge ${STATUS_CLASSES[statusNum] || "badge-pending"}`;
}

function MilestoneCard({ milestone, onApprove, onReject, onSubmit, busy }) {
    const status = Number(milestone.status);
    const label  = getMilestoneStatusLabel(status);
    const [file, setFile] = useState(null);

    const canSubmit = Boolean(onSubmit) && (status === 0 || status === 3);

    function doSubmit() {
        if (!file) return;
        onSubmit?.(milestone, file);
    }

    return (
        <div className={`card card-tight ${ACCENTS[status] || "card-accent"} fade-in`} style={{ marginBottom: 12 }}>
            <div className="row-between mb-sm">
                <div className="row" style={{ gap: 8 }}>
                    <FileText size={15} className="muted" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                        Milestone #{milestone.milestoneId?.toString()}
                    </span>
                </div>
                <span className={statusBadgeClass(status)}>{label}</span>
            </div>

            <p className="small" style={{ color: "var(--text-1)", marginBottom: 6 }}>{milestone.description}</p>
            <p className="small muted mb">
                <Coins size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
                &nbsp;{formatEth(milestone.amount)} ETH on approval
            </p>

            {milestone.ipfsCID && (
                <div className="row mb" style={{ gap: 8, flexWrap: "wrap" }}>
                    <a
                        href={getIPFSUrl(milestone.ipfsCID)}
                        target="_blank"
                        rel="noreferrer"
                        className="pill pill-brand"
                        style={{ textDecoration: "none" }}
                    >
                        <ExternalLink size={12} /> View on {isDemoMode() && milestone.ipfsCID.startsWith("demo-") ? "Local" : "IPFS"}
                    </a>
                    <span className="mono-chip" title={milestone.ipfsCID}>
                        {milestone.ipfsCID.slice(0, 18)}...
                    </span>
                </div>
            )}

            {/* client approve / reject actions */}
            {(onApprove || onReject) && status === 1 && (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {onApprove && (
                        <button className="btn-success btn-sm" onClick={() => onApprove(milestone)} disabled={busy}>
                            <Check size={13} /> Approve &amp; Release
                        </button>
                    )}
                    {onReject && (
                        <button className="btn-danger btn-sm" onClick={() => onReject(milestone)} disabled={busy}>
                            <X size={13} /> Reject
                        </button>
                    )}
                </div>
            )}

            {/* freelancer inline upload + submit */}
            {canSubmit && (
                <div className="mt-sm" style={{
                    padding: 12,
                    background: "rgba(10, 15, 28, 0.5)",
                    border: "1px dashed var(--border-strong)",
                    borderRadius: 10
                }}>
                    <div className="form-label mb-sm">
                        <Paperclip size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
                        &nbsp;{status === 3 ? "Attach a new file and resubmit" : "Attach your deliverable"}
                    </div>
                    <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} disabled={busy} />
                    {file && (
                        <div className="pill pill-brand" style={{ marginTop: 8 }}>
                            <FileText size={12} /> {file.name}
                            <span className="subtle small">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                    )}
                    <div className="mt-sm">
                        <button className="btn-primary btn-sm" onClick={doSubmit} disabled={busy || !file}>
                            <Upload size={13} /> {busy ? "Submitting..." : "Submit Work"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MilestoneCard;
