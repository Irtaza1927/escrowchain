// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  file: DisputeResolver.sol
  description: handles disputes between clients and freelancers. either party
  can open a dispute on a job that is in progress. a trusted arbiter then reviews
  the situation and decides how to split the remaining escrowed ETH between the
  two parties (e.g., 70% freelancer, 30% client).
  
  inherits: AccessControlBase (roles — specifically ARBITER_ROLE)
  calls: EscrowCore.markDisputed() when dispute is opened
         EscrowCore.resolveAndPay() when arbiter resolves with a split decision
  
  security: only job participants can open disputes, only arbiter can resolve
*/

import "./AccessControlBase.sol";
import "./EscrowCore.sol";

contract DisputeResolver is AccessControlBase {

    // ===== custom errors =====
    error DisputeDoesNotExist();
    error DisputeAlreadyExists();
    error InvalidDisputeStatus();
    error NotJobParticipant();
    error SharesMustAdd100();
    error EscrowCoreNotSet();

    // ===== enums =====

    // lifecycle of a dispute
    enum DisputeStatus {
        OPEN,     // dispute opened, waiting for arbiter decision
        RESOLVED  // arbiter has decided, funds split and released
    }

    // ===== structs =====
    struct Dispute {
        uint256 disputeId;
        uint256 jobId;
        address openedBy;           // client or freelancer who raised the dispute
        string  reason;             // description of why the dispute was opened
        DisputeStatus status;
        uint256 clientShare;        // percentage of remaining funds going to client (0-100)
        uint256 freelancerShare;    // percentage of remaining funds going to freelancer (0-100)
        address resolvedBy;         // arbiter address who made the decision
        uint256 openedAt;
        uint256 resolvedAt;
    }

    // ===== state variables =====
    uint256 private disputeCounter;
    mapping(uint256 => Dispute) public disputes;     // disputeId => dispute
    mapping(uint256 => uint256) public jobDispute;   // jobId => disputeId (max 1 per job)

    EscrowCore public escrowCore;

    // ===== events =====
    event DisputeOpened(uint256 indexed disputeId, uint256 indexed jobId, address indexed openedBy, string reason);
    event DisputeResolved(uint256 indexed disputeId, uint256 indexed jobId, address indexed arbiter, uint256 clientShare, uint256 freelancerShare);

    // ===== setup =====

    // links EscrowCore after deployment — must be called before using this contract
    function setEscrowCore(address _escrowCore) external onlyRole(DEFAULT_ADMIN_ROLE) {
        escrowCore = EscrowCore(payable(_escrowCore));
    }

    // ===== main functions =====

    // opens a dispute on an in-progress job — only the client or freelancer of that job can call
    function openDispute(uint256 jobId, string calldata reason) external whenNotPaused returns (uint256) {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();
        if (jobDispute[jobId] != 0) revert DisputeAlreadyExists();

        // verify caller is a participant in this job (client or freelancer)
        EscrowCore.Job memory job = escrowCore.getJob(jobId);
        if (msg.sender != job.client && msg.sender != job.freelancer) revert NotJobParticipant();

        // effects
        unchecked { disputeCounter++; }
        uint256 newId = disputeCounter;

        disputes[newId] = Dispute({
            disputeId:      newId,
            jobId:          jobId,
            openedBy:       msg.sender,
            reason:         reason,
            status:         DisputeStatus.OPEN,
            clientShare:    0,
            freelancerShare:0,
            resolvedBy:     address(0),
            openedAt:       block.timestamp,
            resolvedAt:     0
        });

        jobDispute[jobId] = newId;

        // tell EscrowCore to freeze the job as disputed
        escrowCore.markDisputed(jobId);

        emit DisputeOpened(newId, jobId, msg.sender, reason);
        return newId;
    }

    // arbiter resolves a dispute by deciding how to split remaining funds
    // clientSharePercent + freelancerSharePercent must equal exactly 100
    function resolveDispute(
        uint256 disputeId,
        uint256 clientSharePercent,
        uint256 freelancerSharePercent
    ) external whenNotPaused onlyRole(ARBITER_ROLE) {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();
        if (clientSharePercent + freelancerSharePercent != 100) revert SharesMustAdd100();

        Dispute storage d = disputes[disputeId];
        if (d.disputeId == 0) revert DisputeDoesNotExist();
        if (d.status != DisputeStatus.OPEN) revert InvalidDisputeStatus();

        // calculate actual ETH amounts from percentages
        EscrowCore.Job memory job = escrowCore.getJob(d.jobId);
        uint256 remaining       = job.totalAmount - job.amountReleased;
        uint256 clientAmount    = (remaining * clientSharePercent) / 100;
        uint256 freelancerAmount = remaining - clientAmount; // subtraction avoids rounding dust

        // effects before interactions (CEI pattern)
        d.status          = DisputeStatus.RESOLVED;
        d.clientShare     = clientSharePercent;
        d.freelancerShare = freelancerSharePercent;
        d.resolvedBy      = msg.sender;
        d.resolvedAt      = block.timestamp;

        // interaction: trigger split payment in EscrowCore
        escrowCore.resolveAndPay(
            d.jobId,
            job.client,
            job.freelancer,
            clientAmount,
            freelancerAmount
        );

        emit DisputeResolved(disputeId, d.jobId, msg.sender, clientSharePercent, freelancerSharePercent);
    }

    // ===== view functions =====

    // returns full details of a single dispute
    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        if (disputes[disputeId].disputeId == 0) revert DisputeDoesNotExist();
        return disputes[disputeId];
    }

    // returns the dispute ID for a job (returns 0 if no dispute exists)
    function getJobDisputeId(uint256 jobId) external view returns (uint256) {
        return jobDispute[jobId];
    }

    // returns total number of disputes ever opened
    function getTotalDisputes() external view returns (uint256) {
        return disputeCounter;
    }
}
