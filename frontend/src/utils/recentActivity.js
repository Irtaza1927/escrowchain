// file: recentActivity.js
// description: fetches recent events across all three contracts, newest-first, for the global live feed.

import { getEscrowCore, getMilestoneManager, getDisputeResolver } from "./ethers";

export const ACTIVITY_META = {
    created:       { label: "Job posted",              color: "#4dd0e1" },
    applied:       { label: "Applied to job",          color: "#c97cff" },
    accepted:      { label: "Application accepted",    color: "#4caf50" },
    ms_added:      { label: "Milestone added",         color: "#4dd0e1" },
    ms_submitted:  { label: "Milestone submitted",     color: "#c97cff" },
    ms_approved:   { label: "Milestone approved",      color: "#4caf50" },
    ms_rejected:   { label: "Milestone rejected",      color: "#ef5350" },
    paid:          { label: "Payment released",        color: "#4caf50" },
    completed:     { label: "Job completed",           color: "#4caf50" },
    disputed:      { label: "Dispute opened",          color: "#ef5350" },
    dispute_resolved: { label: "Dispute resolved",     color: "#4caf50" },
};

export async function fetchRecentActivity(signer, limit = 10) {
    if (!signer) return [];

    const esc = getEscrowCore(signer);
    const ms  = getMilestoneManager(signer);
    const dr  = getDisputeResolver(signer);

    const bucket = [];
    const pull = async (contract, name, type) => {
        try {
            const logs = await contract.queryFilter(name);
            for (const log of logs) {
                bucket.push({ type, name, blockNumber: log.blockNumber, txHash: log.transactionHash, args: log.args });
            }
        } catch {}
    };

    await Promise.all([
        pull(esc, "JobCreated",          "created"),
        pull(esc, "AppliedToJob",        "applied"),
        pull(esc, "ApplicationAccepted", "accepted"),
        pull(esc, "PaymentReleased",     "paid"),
        pull(esc, "JobCompleted",        "completed"),
        pull(ms,  "MilestoneAdded",      "ms_added"),
        pull(ms,  "MilestoneSubmitted",  "ms_submitted"),
        pull(ms,  "MilestoneApproved",   "ms_approved"),
        pull(ms,  "MilestoneRejected",   "ms_rejected"),
        pull(dr,  "DisputeOpened",       "disputed"),
        pull(dr,  "DisputeResolved",     "dispute_resolved"),
    ]);

    bucket.sort((a, b) => b.blockNumber - a.blockNumber);
    return bucket.slice(0, limit);
}

export function activityDetail(ev) {
    const a = ev.args || {};
    const short = (x) => x ? `${x.slice(0, 6)}...${x.slice(-4)}` : "";
    switch (ev.type) {
        case "created":          return `Job #${a.jobId?.toString()} by ${short(a.client)}`;
        case "applied":          return `${short(a.freelancer)} to Job #${a.jobId?.toString()}`;
        case "accepted":         return `${short(a.freelancer)} selected for Job #${a.jobId?.toString()}`;
        case "ms_added":         return `Milestone #${a.milestoneId?.toString()} in Job #${a.jobId?.toString()}`;
        case "ms_submitted":     return `Milestone #${a.milestoneId?.toString()} by ${short(a.freelancer)}`;
        case "ms_approved":      return `Milestone #${a.milestoneId?.toString()} approved`;
        case "ms_rejected":      return `Milestone #${a.milestoneId?.toString()} rejected`;
        case "paid":             return `Job #${a.jobId?.toString()} paid ${short(a.to)}`;
        case "completed":        return `Job #${a.jobId?.toString()} fully paid`;
        case "disputed":         return `Dispute opened on Job #${a.jobId?.toString()}`;
        case "dispute_resolved": return `Arbiter settled Dispute #${a.disputeId?.toString()}`;
        default:                 return "";
    }
}
