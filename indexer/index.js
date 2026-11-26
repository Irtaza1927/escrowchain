// file: index.js
// description: this is the off-chain event indexer — the backend component of our hybrid architecture.
// it connects to ganache and listens for events emitted by all three smart contracts.
// when an event is detected (e.g., JobCreated, MilestoneSubmitted, DisputeOpened),
// it saves the data to db.json — a local database file.
// the frontend's dashboard reads from this database to display job history and status.
//
// why we need this: blockchain has no "get all jobs" query — events are the only way
// to build a history. this indexer catches every event and stores it in a queryable format.
//
// how to run: node indexer/index.js  (keep running while using the app)

const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");

// load contract ABIs and addresses saved by the deploy script
const EscrowCoreData       = require("../frontend/src/contracts/EscrowCore.json");
const MilestoneManagerData = require("../frontend/src/contracts/MilestoneManager.json");
const DisputeResolverData  = require("../frontend/src/contracts/DisputeResolver.json");

// path to the local json database
const DB_PATH = path.join(__dirname, "db.json");

// loads existing database or creates a fresh one
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        return { jobs: {}, milestones: {}, disputes: {}, payments: [] };
    }
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

// writes the in-memory database to disk
function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// main function: connects to ganache and sets up all event listeners
async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
    console.log("[indexer] connected to ganache at http://127.0.0.1:7545");

    // create contract instances for event subscription
    const escrowCore       = new ethers.Contract(EscrowCoreData.address,       EscrowCoreData.abi,       provider);
    const milestoneManager = new ethers.Contract(MilestoneManagerData.address, MilestoneManagerData.abi, provider);
    const disputeResolver  = new ethers.Contract(DisputeResolverData.address,  DisputeResolverData.abi,  provider);

    let db = loadDB();
    console.log("[indexer] database loaded. listening for events...");

    // listens: new job created by a client
    escrowCore.on("JobCreated", (jobId, client, amount, title, event) => {
        const id = jobId.toString();
        console.log(`[event] JobCreated | id: ${id} | client: ${client} | title: ${title}`);
        db.jobs[id] = {
            jobId: id, client, amount: amount.toString(),
            title, status: "OPEN",
            createdAt: new Date().toISOString(),
            txHash: event.log.transactionHash
        };
        saveDB(db);
    });

    // listens: freelancer assigned to a job (direct assign OR via acceptApplication)
    escrowCore.on("FreelancerAssigned", (jobId, freelancer, event) => {
        const id = jobId.toString();
        console.log(`[event] FreelancerAssigned | jobId: ${id} | freelancer: ${freelancer}`);
        if (db.jobs[id]) {
            db.jobs[id].freelancer = freelancer;
            db.jobs[id].status    = "IN_PROGRESS";
        }
        saveDB(db);
    });

    // listens: freelancer applied to a public open job
    escrowCore.on("AppliedToJob", (jobId, freelancer, proposal, event) => {
        const id = jobId.toString();
        console.log(`[event] AppliedToJob | jobId: ${id} | freelancer: ${freelancer}`);
        if (!db.applications) db.applications = {};
        const key = `${id}-${freelancer.toLowerCase()}`;
        db.applications[key] = {
            jobId: id, freelancer, proposal,
            status: "PENDING",
            appliedAt: new Date().toISOString(),
            txHash: event.log.transactionHash
        };
        saveDB(db);
    });

    // listens: freelancer withdrew an application
    escrowCore.on("ApplicationWithdrawn", (jobId, freelancer, event) => {
        const id = jobId.toString();
        console.log(`[event] ApplicationWithdrawn | jobId: ${id} | freelancer: ${freelancer}`);
        if (!db.applications) db.applications = {};
        const key = `${id}-${freelancer.toLowerCase()}`;
        if (db.applications[key]) db.applications[key].status = "WITHDRAWN";
        saveDB(db);
    });

    // listens: client accepted an application
    escrowCore.on("ApplicationAccepted", (jobId, freelancer, event) => {
        const id = jobId.toString();
        console.log(`[event] ApplicationAccepted | jobId: ${id} | freelancer: ${freelancer}`);
        if (!db.applications) db.applications = {};
        const key = `${id}-${freelancer.toLowerCase()}`;
        if (db.applications[key]) db.applications[key].status = "ACCEPTED";
        saveDB(db);
    });

    // listens: payment released to any address
    escrowCore.on("PaymentReleased", (jobId, to, amount, event) => {
        const id = jobId.toString();
        console.log(`[event] PaymentReleased | jobId: ${id} | to: ${to} | amount: ${ethers.formatEther(amount)} ETH`);
        db.payments.push({
            jobId: id, to, amount: amount.toString(),
            timestamp: new Date().toISOString(),
            txHash: event.log.transactionHash
        });
        saveDB(db);
    });

    // listens: job completed (all payment released)
    escrowCore.on("JobCompleted", (jobId, event) => {
        const id = jobId.toString();
        console.log(`[event] JobCompleted | jobId: ${id}`);
        if (db.jobs[id]) db.jobs[id].status = "COMPLETED";
        saveDB(db);
    });

    // listens: job cancelled and refunded
    escrowCore.on("JobCancelled", (jobId, client, refundAmount, event) => {
        const id = jobId.toString();
        console.log(`[event] JobCancelled | jobId: ${id}`);
        if (db.jobs[id]) db.jobs[id].status = "CANCELLED";
        saveDB(db);
    });

    // listens: freelancer submitted a milestone with ipfs proof
    milestoneManager.on("MilestoneSubmitted", (milestoneId, jobId, ipfsCID, freelancer, event) => {
        const id = milestoneId.toString();
        console.log(`[event] MilestoneSubmitted | id: ${id} | cid: ${ipfsCID}`);
        db.milestones[id] = {
            ...db.milestones[id],
            milestoneId: id, jobId: jobId.toString(),
            ipfsCID, freelancer, status: "SUBMITTED",
            submittedAt: new Date().toISOString()
        };
        saveDB(db);
    });

    // listens: client approved a milestone
    milestoneManager.on("MilestoneApproved", (milestoneId, jobId, amountReleased, event) => {
        const id = milestoneId.toString();
        console.log(`[event] MilestoneApproved | id: ${id} | amount: ${ethers.formatEther(amountReleased)} ETH`);
        if (db.milestones[id]) {
            db.milestones[id].status         = "APPROVED";
            db.milestones[id].amountReleased = amountReleased.toString();
        }
        saveDB(db);
    });

    // listens: client rejected a milestone submission
    milestoneManager.on("MilestoneRejected", (milestoneId, jobId, reason, event) => {
        const id = milestoneId.toString();
        console.log(`[event] MilestoneRejected | id: ${id} | reason: ${reason}`);
        if (db.milestones[id]) {
            db.milestones[id].status          = "REJECTED";
            db.milestones[id].rejectionReason = reason;
        }
        saveDB(db);
    });

    // listens: dispute opened on a job
    disputeResolver.on("DisputeOpened", (disputeId, jobId, openedBy, reason, event) => {
        const id = disputeId.toString();
        console.log(`[event] DisputeOpened | id: ${id} | jobId: ${jobId} | by: ${openedBy}`);
        db.disputes[id] = {
            disputeId: id, jobId: jobId.toString(),
            openedBy, reason, status: "OPEN",
            openedAt: new Date().toISOString()
        };
        if (db.jobs[jobId.toString()]) db.jobs[jobId.toString()].status = "DISPUTED";
        saveDB(db);
    });

    // listens: arbiter resolved a dispute
    disputeResolver.on("DisputeResolved", (disputeId, jobId, arbiter, clientShare, freelancerShare, event) => {
        const id = disputeId.toString();
        console.log(`[event] DisputeResolved | id: ${id} | split: ${clientShare}/${freelancerShare}`);
        if (db.disputes[id]) {
            db.disputes[id].status          = "RESOLVED";
            db.disputes[id].arbiter         = arbiter;
            db.disputes[id].clientShare     = clientShare.toString();
            db.disputes[id].freelancerShare = freelancerShare.toString();
            db.disputes[id].resolvedAt      = new Date().toISOString();
        }
        if (db.jobs[jobId.toString()]) db.jobs[jobId.toString()].status = "COMPLETED";
        saveDB(db);
    });

    console.log("[indexer] all listeners active. press ctrl+c to stop.");
}

main().catch(console.error);
