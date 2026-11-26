// file: jobEvents.js
// description: queries all contract events for a given jobId and returns a
// time-ordered activity log for the Timeline component.

import { getEscrowCore, getMilestoneManager, getDisputeResolver } from "./ethers";

export const EVENT_TYPES = {
    created:       { label: "Job posted",              color: "cyan" },
    applied:       { label: "Freelancer applied",      color: "violet" },
    accepted:      { label: "Application accepted",    color: "green" },
    withdrawn:     { label: "Application withdrawn",   color: "slate" },
    assigned:      { label: "Freelancer assigned",     color: "cyan" },
    ms_added:      { label: "Milestone added",         color: "cyan" },
    ms_submitted:  { label: "Milestone submitted",     color: "violet" },
    ms_approved:   { label: "Milestone approved",      color: "green" },
    ms_rejected:   { label: "Milestone rejected",      color: "red" },
    paid:          { label: "Payment released",        color: "green" },
    completed:     { label: "Job completed",           color: "green" },
    cancelled:     { label: "Job cancelled",           color: "amber" },
    disputed:      { label: "Dispute opened",          color: "red" },
    dispute_resolved: { label: "Dispute resolved",     color: "green" },
};

export async function fetchJobEvents(signer, jobId) {
    if (!signer || !jobId) return [];

    const escrow    = getEscrowCore(signer);
    const milestone = getMilestoneManager(signer);
    const dispute   = getDisputeResolver(signer);
    const provider  = signer.provider;

    const bucket = [];

    async function pull(contract, eventName, type) {
        try {
            const filter = contract.filters[eventName](jobId);
            const logs   = await contract.queryFilter(filter);
            for (const log of logs) {
                bucket.push({
                    type,
                    name:        eventName,
                    blockNumber: log.blockNumber,
                    txHash:      log.transactionHash,
                    args:        log.args
                });
            }
        } catch {}
    }

    await Promise.all([
        pull(escrow,    "JobCreated",          "created"),
        pull(escrow,    "AppliedToJob",        "applied"),
        pull(escrow,    "ApplicationAccepted", "accepted"),
        pull(escrow,    "ApplicationWithdrawn","withdrawn"),
        pull(escrow,    "FreelancerAssigned",  "assigned"),
        pull(escrow,    "PaymentReleased",     "paid"),
        pull(escrow,    "JobCompleted",        "completed"),
        pull(escrow,    "JobCancelled",        "cancelled"),
        pull(escrow,    "JobDisputeOpened",    "disputed"),
        pull(escrow,    "JobDisputeResolved",  "dispute_resolved"),
        pull(milestone, "MilestoneAdded",      "ms_added"),
        pull(milestone, "MilestoneSubmitted",  "ms_submitted"),
        pull(milestone, "MilestoneApproved",   "ms_approved"),
        pull(milestone, "MilestoneRejected",   "ms_rejected"),
    ]);

    // fill in block timestamps once per unique block (cheap cache).
    const uniqueBlocks = [...new Set(bucket.map(e => e.blockNumber))];
    const blockTimes   = {};
    await Promise.all(uniqueBlocks.map(async bn => {
        try {
            const b = await provider.getBlock(bn);
            blockTimes[bn] = b?.timestamp || 0;
        } catch { blockTimes[bn] = 0; }
    }));
    bucket.forEach(e => { e.timestamp = blockTimes[e.blockNumber]; });

    bucket.sort((a, b) => a.blockNumber - b.blockNumber);
    return bucket;
}
