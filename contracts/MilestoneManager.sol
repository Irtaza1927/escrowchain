// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  file: MilestoneManager.sol
  description: manages milestones within a job. the client adds milestones
  with an ETH amount and description. the freelancer submits a milestone by
  uploading their deliverable to IPFS (via pinata) and storing the resulting
  IPFS CID (content hash) on-chain as proof of delivery. the client then
  approves or rejects the submission.
  
  key point: the IPFS CID stored on-chain is an immutable proof.
  if the file is changed, the CID changes — tamper-proof by design.
  
  inherits: AccessControlBase (roles + pause)
  calls: EscrowCore.releasePayment() on milestone approval
*/

import "./AccessControlBase.sol";
import "./EscrowCore.sol";

contract MilestoneManager is AccessControlBase {

    // ===== custom errors =====
    error MilestoneDoesNotExist();
    error InvalidMilestoneStatus();
    error NotJobClient();
    error NotJobFreelancer();
    error InvalidAmount();
    error EmptyCID();
    error EscrowCoreNotSet();

    // ===== enums =====

    // lifecycle of a single milestone
    enum MilestoneStatus {
        PENDING,   // milestone created by client, freelancer hasn't submitted yet
        SUBMITTED, // freelancer submitted with IPFS CID, waiting for client review
        APPROVED,  // client approved, payment has been released
        REJECTED   // client rejected, freelancer can fix and resubmit
    }

    // ===== structs =====

    // milestone data — ipfsCID stored as string (ipfs cids are ~59 chars, too long for bytes32)
    struct Milestone {
        uint256 milestoneId;
        uint256 jobId;
        uint256 amount;             // ETH to release when this milestone is approved (in wei)
        MilestoneStatus status;
        address submittedBy;        // freelancer address who submitted
        string description;         // what the freelancer needs to deliver
        string ipfsCID;             // ipfs content id of the uploaded deliverable file
        uint256 submittedAt;        // timestamp when freelancer submitted
    }

    // ===== state variables =====
    uint256 private milestoneCounter;
    mapping(uint256 => Milestone) public milestones;      // milestoneId => milestone
    mapping(uint256 => uint256[]) public jobMilestones;   // jobId => list of milestoneIds

    EscrowCore public escrowCore; // reference to the main escrow contract

    // ===== events =====
    event MilestoneAdded(uint256 indexed milestoneId, uint256 indexed jobId, uint256 amount, string description);
    event MilestoneSubmitted(uint256 indexed milestoneId, uint256 indexed jobId, string ipfsCID, address indexed freelancer);
    event MilestoneApproved(uint256 indexed milestoneId, uint256 indexed jobId, uint256 amountReleased);
    event MilestoneRejected(uint256 indexed milestoneId, uint256 indexed jobId, string reason);

    // ===== setup =====

    // links EscrowCore after deployment — must be called before using this contract
    function setEscrowCore(address _escrowCore) external onlyRole(DEFAULT_ADMIN_ROLE) {
        escrowCore = EscrowCore(payable(_escrowCore));
    }

    // ===== main functions =====

    // client adds a milestone to their job with a budget and description
    function addMilestone(
        uint256 jobId,
        string calldata description,
        uint256 amount
    ) external whenNotPaused returns (uint256) {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();
        if (amount == 0) revert InvalidAmount();

        // verify caller is the job's client
        EscrowCore.Job memory job = escrowCore.getJob(jobId);
        if (job.client != msg.sender) revert NotJobClient();

        // effects
        unchecked { milestoneCounter++; }
        uint256 newId = milestoneCounter;

        milestones[newId] = Milestone({
            milestoneId: newId,
            jobId:       jobId,
            amount:      amount,
            status:      MilestoneStatus.PENDING,
            submittedBy: address(0),
            description: description,
            ipfsCID:     "",
            submittedAt: 0
        });

        jobMilestones[jobId].push(newId);
        emit MilestoneAdded(newId, jobId, amount, description);
        return newId;
    }

    // freelancer submits a milestone with the IPFS CID of their deliverable
    // ipfsCID is the hash returned by pinata after the file is uploaded off-chain
    // storing this hash on-chain proves the file existed at this point in time
    function submitMilestone(
        uint256 milestoneId,
        string calldata ipfsCID
    ) external whenNotPaused {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();
        if (bytes(ipfsCID).length == 0) revert EmptyCID();

        Milestone storage m = milestones[milestoneId];
        if (m.milestoneId == 0) revert MilestoneDoesNotExist();
        // freelancer can submit when pending or after a rejection
        if (m.status != MilestoneStatus.PENDING && m.status != MilestoneStatus.REJECTED) {
            revert InvalidMilestoneStatus();
        }

        // verify caller is the job's assigned freelancer
        EscrowCore.Job memory job = escrowCore.getJob(m.jobId);
        if (job.freelancer != msg.sender) revert NotJobFreelancer();

        // effects
        m.status      = MilestoneStatus.SUBMITTED;
        m.ipfsCID     = ipfsCID;
        m.submittedBy = msg.sender;
        m.submittedAt = block.timestamp;

        emit MilestoneSubmitted(milestoneId, m.jobId, ipfsCID, msg.sender);
    }

    // client approves a submitted milestone — triggers ETH payment to freelancer
    function approveMilestone(uint256 milestoneId) external whenNotPaused {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();

        Milestone storage m = milestones[milestoneId];
        if (m.milestoneId == 0) revert MilestoneDoesNotExist();
        if (m.status != MilestoneStatus.SUBMITTED) revert InvalidMilestoneStatus();

        // verify caller is the job's client
        EscrowCore.Job memory job = escrowCore.getJob(m.jobId);
        if (job.client != msg.sender) revert NotJobClient();

        uint256 amountToRelease = m.amount;
        address freelancer      = job.freelancer;

        // effects before interactions (CEI pattern)
        m.status = MilestoneStatus.APPROVED;

        // interaction: call escrowCore to transfer ETH to freelancer
        escrowCore.releasePayment(m.jobId, freelancer, amountToRelease);

        emit MilestoneApproved(milestoneId, m.jobId, amountToRelease);
    }

    // client rejects a submission — resets status so freelancer can fix and resubmit
    function rejectMilestone(uint256 milestoneId, string calldata reason) external whenNotPaused {
        // checks
        if (address(escrowCore) == address(0)) revert EscrowCoreNotSet();

        Milestone storage m = milestones[milestoneId];
        if (m.milestoneId == 0) revert MilestoneDoesNotExist();
        if (m.status != MilestoneStatus.SUBMITTED) revert InvalidMilestoneStatus();

        // verify caller is the job's client
        EscrowCore.Job memory job = escrowCore.getJob(m.jobId);
        if (job.client != msg.sender) revert NotJobClient();

        // effects: clear the cid so freelancer must upload a new file
        m.status  = MilestoneStatus.REJECTED;
        m.ipfsCID = "";

        emit MilestoneRejected(milestoneId, m.jobId, reason);
    }

    // ===== view functions =====

    // returns all milestone IDs for a given job
    function getJobMilestones(uint256 jobId) external view returns (uint256[] memory) {
        return jobMilestones[jobId];
    }

    // returns full details of a single milestone
    function getMilestone(uint256 milestoneId) external view returns (Milestone memory) {
        if (milestones[milestoneId].milestoneId == 0) revert MilestoneDoesNotExist();
        return milestones[milestoneId];
    }

    // returns total milestone count
    function getTotalMilestones() external view returns (uint256) {
        return milestoneCounter;
    }
}
