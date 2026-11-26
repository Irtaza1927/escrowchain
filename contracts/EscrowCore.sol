// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  file: EscrowCore.sol
  description: the main escrow contract. clients create jobs and lock ETH here.
  when milestones are approved (via MilestoneManager) or disputes are resolved
  (via DisputeResolver), those contracts call back into this one to release payment.
  
  inherits: AccessControlBase (roles + pause), ReentrancyGuard (security)
  called by: MilestoneManager (releasePayment), DisputeResolver (markDisputed, resolveAndPay)
  
  security features applied:
  - reentrancyguard on all functions that transfer ETH
  - checks-effects-interactions (CEI) pattern throughout
  - custom errors instead of strings (gas efficient)
  - role-based access: only registered clients can create jobs
  - only authorized sibling contracts can call payment functions
  - pausable for emergency stop
*/

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AccessControlBase.sol";

contract EscrowCore is AccessControlBase, ReentrancyGuard {

    // ===== custom errors (gas efficient vs require + string) =====
    error OnlyClient();
    error OnlyAuthorizedContract();
    error InvalidAmount();
    error JobDoesNotExist();
    error InvalidJobStatus();
    error FreelancerNotRegistered();
    error FreelancerAlreadyAssigned();
    error TransferFailed();
    error AlreadyApplied();
    error InvalidApplicationStatus();
    error ClientCannotApplyToOwnJob();

    // ===== enums =====

    // lifecycle stages a job passes through
    enum JobStatus {
        OPEN,         // job created, visible to freelancers on the public board
        IN_PROGRESS,  // client accepted one applicant, work is happening
        COMPLETED,    // all payment released, job done
        DISPUTED,     // dispute opened, waiting for arbiter
        CANCELLED     // cancelled by client before any applicant was accepted
    }

    // application lifecycle: freelancer applies, client accepts one, others stay pending.
    enum ApplicationStatus {
        NONE,        // default. no application has been made.
        PENDING,     // freelancer has applied. awaiting client decision.
        ACCEPTED,    // client chose this freelancer. job transitioned to IN_PROGRESS.
        WITHDRAWN    // freelancer pulled their application before being accepted.
    }

    // ===== structs =====

    // job struct. fields ordered to minimize storage slots (gas optimization).
    struct Job {
        uint256 jobId;
        address client;
        JobStatus status;
        address freelancer;
        uint256 totalAmount;
        uint256 amountReleased;
        uint256 createdAt;
        string title;
        string description;
    }

    // application a freelancer sends against an open job.
    struct Application {
        address freelancer;
        string proposal;
        uint64 appliedAt;
        ApplicationStatus status;
    }

    // ===== state variables =====
    uint256 private jobCounter;                   // auto-incrementing job ID
    mapping(uint256 => Job) public jobs;          // jobId => job data

    // application storage. _applications[jobId][freelancer] is the application.
    mapping(uint256 => mapping(address => Application)) private _applications;
    // list of every freelancer who ever applied to this job (for client-side listing).
    mapping(uint256 => address[]) private _jobApplicants;
    // reverse index: every job a freelancer has an application against.
    mapping(address => uint256[]) private _freelancerJobsApplied;

    // addresses of sibling contracts allowed to trigger payments
    address public milestoneManager;
    address public disputeResolver;

    // ===== events (listened to by the off-chain node.js indexer) =====
    event JobCreated(uint256 indexed jobId, address indexed client, uint256 amount, string title);
    event FreelancerAssigned(uint256 indexed jobId, address indexed freelancer);
    event PaymentReleased(uint256 indexed jobId, address indexed to, uint256 amount);
    event JobCompleted(uint256 indexed jobId);
    event JobCancelled(uint256 indexed jobId, address indexed client, uint256 refundAmount);
    event JobDisputeOpened(uint256 indexed jobId);
    event JobDisputeResolved(uint256 indexed jobId);
    event AppliedToJob(uint256 indexed jobId, address indexed freelancer, string proposal);
    event ApplicationWithdrawn(uint256 indexed jobId, address indexed freelancer);
    event ApplicationAccepted(uint256 indexed jobId, address indexed freelancer);

    // ===== modifiers =====

    // only the specific job's client can proceed
    modifier onlyJobClient(uint256 jobId) {
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].client != msg.sender) revert OnlyClient();
        _;
    }

    // only MilestoneManager or DisputeResolver can call protected payment functions
    modifier onlyAuthorizedContract() {
        if (msg.sender != milestoneManager && msg.sender != disputeResolver) {
            revert OnlyAuthorizedContract();
        }
        _;
    }

    // ===== admin setup functions =====

    // links the MilestoneManager contract address — called once after deployment
    function setMilestoneManager(address _milestoneManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        milestoneManager = _milestoneManager;
    }

    // links the DisputeResolver contract address — called once after deployment
    function setDisputeResolver(address _disputeResolver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        disputeResolver = _disputeResolver;
    }

    // ===== main functions =====

    // client creates a new job and locks ETH in escrow
    // msg.value is the total job budget locked immediately
    function createJob(
        string calldata title,
        string calldata description
    ) external payable whenNotPaused returns (uint256) {
        // checks
        if (!hasRole(CLIENT_ROLE, msg.sender)) revert OnlyClient();
        if (msg.value == 0) revert InvalidAmount();

        // effects: increment counter using unchecked for gas savings (overflow impossible)
        unchecked { jobCounter++; }
        uint256 newJobId = jobCounter;

        // store new job in state before any external calls (CEI pattern)
        jobs[newJobId] = Job({
            jobId:          newJobId,
            client:         msg.sender,
            status:         JobStatus.OPEN,
            freelancer:     address(0),
            totalAmount:    msg.value,
            amountReleased: 0,
            createdAt:      block.timestamp,
            title:          title,
            description:    description
        });

        emit JobCreated(newJobId, msg.sender, msg.value, title);
        return newJobId;
    }

    // client assigns a registered freelancer directly to their open job.
    // kept as a backup path; the preferred flow is apply + accept via the application system.
    function assignFreelancer(uint256 jobId, address freelancer)
        external
        whenNotPaused
        onlyJobClient(jobId)
    {
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].status != JobStatus.OPEN) revert InvalidJobStatus();
        if (!hasRole(FREELANCER_ROLE, freelancer)) revert FreelancerNotRegistered();
        if (jobs[jobId].freelancer != address(0)) revert FreelancerAlreadyAssigned();

        jobs[jobId].freelancer = freelancer;
        jobs[jobId].status     = JobStatus.IN_PROGRESS;

        emit FreelancerAssigned(jobId, freelancer);
    }

    // ===== application flow (marketplace model) =====

    // freelancer applies to an open job with a short proposal message.
    // a freelancer may reapply after a withdrawal by overwriting their previous application.
    function applyToJob(uint256 jobId, string calldata proposal) external whenNotPaused {
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].status != JobStatus.OPEN) revert InvalidJobStatus();
        if (!hasRole(FREELANCER_ROLE, msg.sender)) revert FreelancerNotRegistered();
        if (jobs[jobId].client == msg.sender) revert ClientCannotApplyToOwnJob();

        Application storage app = _applications[jobId][msg.sender];
        if (app.status == ApplicationStatus.PENDING || app.status == ApplicationStatus.ACCEPTED) {
            revert AlreadyApplied();
        }

        // first-ever application against this job gets indexed in both lookup arrays.
        if (app.status == ApplicationStatus.NONE) {
            _jobApplicants[jobId].push(msg.sender);
            _freelancerJobsApplied[msg.sender].push(jobId);
        }

        app.freelancer = msg.sender;
        app.proposal   = proposal;
        app.appliedAt  = uint64(block.timestamp);
        app.status     = ApplicationStatus.PENDING;

        emit AppliedToJob(jobId, msg.sender, proposal);
    }

    // freelancer withdraws their own pending application.
    function withdrawApplication(uint256 jobId) external whenNotPaused {
        Application storage app = _applications[jobId][msg.sender];
        if (app.status != ApplicationStatus.PENDING) revert InvalidApplicationStatus();

        app.status = ApplicationStatus.WITHDRAWN;
        emit ApplicationWithdrawn(jobId, msg.sender);
    }

    // client accepts one applicant. job transitions to IN_PROGRESS.
    // other applications stay as PENDING (no bulk-close, to save gas on jobs with many applicants).
    function acceptApplication(uint256 jobId, address freelancer)
        external
        whenNotPaused
        onlyJobClient(jobId)
    {
        if (jobs[jobId].status != JobStatus.OPEN) revert InvalidJobStatus();

        Application storage app = _applications[jobId][freelancer];
        if (app.status != ApplicationStatus.PENDING) revert InvalidApplicationStatus();

        app.status = ApplicationStatus.ACCEPTED;

        jobs[jobId].freelancer = freelancer;
        jobs[jobId].status     = JobStatus.IN_PROGRESS;

        emit ApplicationAccepted(jobId, freelancer);
        emit FreelancerAssigned(jobId, freelancer);
    }

    // releases ETH to the freelancer — called by MilestoneManager on milestone approval
    // nonReentrant prevents the classic reentrancy attack on payment logic
    function releasePayment(uint256 jobId, address freelancer, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyAuthorizedContract
    {
        // checks
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        uint256 remaining = jobs[jobId].totalAmount - jobs[jobId].amountReleased;
        if (amount > remaining) revert InvalidAmount();

        // effects before interactions (CEI pattern)
        jobs[jobId].amountReleased += amount;
        if (jobs[jobId].amountReleased >= jobs[jobId].totalAmount) {
            jobs[jobId].status = JobStatus.COMPLETED;
            emit JobCompleted(jobId);
        }

        // interactions last: external ETH transfer
        (bool success, ) = payable(freelancer).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit PaymentReleased(jobId, freelancer, amount);
    }

    // releases split payment to both parties — called by DisputeResolver on resolution
    // nonReentrant prevents reentrancy attack during the two sequential transfers
    function resolveAndPay(
        uint256 jobId,
        address client,
        address freelancer,
        uint256 clientAmount,
        uint256 freelancerAmount
    ) external nonReentrant whenNotPaused onlyAuthorizedContract {
        // checks
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].status != JobStatus.DISPUTED) revert InvalidJobStatus();

        // effects before interactions
        jobs[jobId].status         = JobStatus.COMPLETED;
        jobs[jobId].amountReleased = jobs[jobId].totalAmount;

        // interactions: two separate transfers — freelancer first, then client
        if (freelancerAmount > 0) {
            (bool ok1, ) = payable(freelancer).call{value: freelancerAmount}("");
            if (!ok1) revert TransferFailed();
            emit PaymentReleased(jobId, freelancer, freelancerAmount);
        }
        if (clientAmount > 0) {
            (bool ok2, ) = payable(client).call{value: clientAmount}("");
            if (!ok2) revert TransferFailed();
            emit PaymentReleased(jobId, client, clientAmount);
        }

        emit JobDisputeResolved(jobId);
    }

    // marks a job as disputed — called by DisputeResolver when a dispute is opened
    function markDisputed(uint256 jobId) external whenNotPaused onlyAuthorizedContract {
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].status != JobStatus.IN_PROGRESS) revert InvalidJobStatus();

        jobs[jobId].status = JobStatus.DISPUTED;
        emit JobDisputeOpened(jobId);
    }

    // client cancels their open job and gets a full refund
    // only possible before a freelancer is assigned
    function cancelJob(uint256 jobId)
        external
        nonReentrant
        whenNotPaused
        onlyJobClient(jobId)
    {
        // checks
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        if (jobs[jobId].status != JobStatus.OPEN) revert InvalidJobStatus();

        uint256 refund = jobs[jobId].totalAmount - jobs[jobId].amountReleased;

        // effects before interactions
        jobs[jobId].status         = JobStatus.CANCELLED;
        jobs[jobId].amountReleased = jobs[jobId].totalAmount;

        // interaction last
        (bool success, ) = payable(jobs[jobId].client).call{value: refund}("");
        if (!success) revert TransferFailed();

        emit JobCancelled(jobId, jobs[jobId].client, refund);
    }

    // ===== view functions (read-only, no gas cost when called off-chain) =====

    // returns full details of a single job
    function getJob(uint256 jobId) external view returns (Job memory) {
        if (jobs[jobId].jobId == 0) revert JobDoesNotExist();
        return jobs[jobId];
    }

    // returns total number of jobs ever created
    function getTotalJobs() external view returns (uint256) {
        return jobCounter;
    }

    // returns how much ETH is still locked for a job
    function getRemainingAmount(uint256 jobId) external view returns (uint256) {
        return jobs[jobId].totalAmount - jobs[jobId].amountReleased;
    }

    // ===== application view helpers =====

    // list of every address that has ever applied to this job.
    function getJobApplicants(uint256 jobId) external view returns (address[] memory) {
        return _jobApplicants[jobId];
    }

    // detail of a specific application. status == NONE (0) means no application exists.
    function getApplication(uint256 jobId, address freelancer) external view returns (Application memory) {
        return _applications[jobId][freelancer];
    }

    // every job this freelancer has applied to (any status).
    function getFreelancerJobsApplied(address freelancer) external view returns (uint256[] memory) {
        return _freelancerJobsApplied[freelancer];
    }

    // allows contract to receive ETH directly (needed for escrow funding)
    receive() external payable {}
}
