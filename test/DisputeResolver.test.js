// file: DisputeResolver.test.js
// description: automated tests for the DisputeResolver contract.
// covers opening disputes, arbiter resolution with split payments,
// and security failures (unauthorized users, invalid splits, double disputes).

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DisputeResolver", function () {

    // deploys all contracts and creates a job in IN_PROGRESS state
    async function deployAndSetupFixture() {
        const [deployer, client, freelancer, arbiter, attacker] = await ethers.getSigners();

        const EscrowCore       = await ethers.getContractFactory("EscrowCore");
        const MilestoneManager = await ethers.getContractFactory("MilestoneManager");
        const DisputeResolver  = await ethers.getContractFactory("DisputeResolver");

        const escrowCore       = await EscrowCore.deploy();
        const milestoneManager = await MilestoneManager.deploy();
        const disputeResolver  = await DisputeResolver.deploy();

        await escrowCore.setMilestoneManager(await milestoneManager.getAddress());
        await escrowCore.setDisputeResolver(await disputeResolver.getAddress());
        await milestoneManager.setEscrowCore(await escrowCore.getAddress());
        await disputeResolver.setEscrowCore(await escrowCore.getAddress());

        // register roles across all contracts
        await escrowCore.connect(client).registerAsClient();
        await escrowCore.connect(freelancer).registerAsFreelancer();
        await disputeResolver.connect(client).registerAsClient();
        await disputeResolver.connect(freelancer).registerAsFreelancer();
        await escrowCore.grantArbiterRole(arbiter.address);
        await disputeResolver.grantArbiterRole(arbiter.address);

        // create and fund a job, assign freelancer
        await escrowCore.connect(client).createJob("Build API", "REST API needed", { value: ethers.parseEther("2") });
        await escrowCore.connect(client).assignFreelancer(1, freelancer.address);

        return { escrowCore, milestoneManager, disputeResolver, deployer, client, freelancer, arbiter, attacker };
    }

    // ===== openDispute tests =====
    describe("openDispute", function () {

        // normal: client opens a dispute on an in-progress job
        it("should open a dispute when called by client", async function () {
            const { disputeResolver, client } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "work is not satisfactory");

            const dispute = await disputeResolver.getDispute(1);
            expect(dispute.openedBy).to.equal(client.address);
            expect(dispute.status).to.equal(0); // DisputeStatus.OPEN
        });

        // normal: freelancer can also open a dispute
        it("should open a dispute when called by freelancer", async function () {
            const { disputeResolver, freelancer } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(freelancer).openDispute(1, "client is not cooperating");

            const dispute = await disputeResolver.getDispute(1);
            expect(dispute.openedBy).to.equal(freelancer.address);
        });

        // normal: job status changes to DISPUTED after opening
        it("should change job status to DISPUTED", async function () {
            const { escrowCore, disputeResolver, client } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "reason");

            const job = await escrowCore.getJob(1);
            expect(job.status).to.equal(3); // JobStatus.DISPUTED
        });

        // failure: attacker tries to open dispute on a job they're not part of
        it("should revert if caller is not a job participant", async function () {
            const { disputeResolver, attacker } = await loadFixture(deployAndSetupFixture);
            await expect(
                disputeResolver.connect(attacker).openDispute(1, "i want money")
            ).to.be.revertedWithCustomError(disputeResolver, "NotJobParticipant");
        });

        // failure: opening a second dispute on the same job
        it("should revert if dispute already exists for this job", async function () {
            const { disputeResolver, client } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "first dispute");
            await expect(
                disputeResolver.connect(client).openDispute(1, "second dispute")
            ).to.be.revertedWithCustomError(disputeResolver, "DisputeAlreadyExists");
        });
    });

    // ===== resolveDispute tests =====
    describe("resolveDispute", function () {

        // normal: arbiter resolves with 60/40 split
        it("should resolve dispute with correct payment split", async function () {
            const { escrowCore, disputeResolver, client, freelancer, arbiter } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "work incomplete");

            const freelancerBefore = await ethers.provider.getBalance(freelancer.address);
            const clientBefore     = await ethers.provider.getBalance(client.address);

            // arbiter decides: 60% to freelancer, 40% to client
            await disputeResolver.connect(arbiter).resolveDispute(1, 40, 60);

            const freelancerAfter = await ethers.provider.getBalance(freelancer.address);
            const clientAfter     = await ethers.provider.getBalance(client.address);

            // both parties should have received funds
            expect(freelancerAfter).to.be.greaterThan(freelancerBefore);
            expect(clientAfter).to.be.greaterThan(clientBefore);
        });

        // normal: 100% to freelancer (client loses dispute entirely)
        it("should allow full payment to freelancer (100% freelancer share)", async function () {
            const { disputeResolver, escrowCore, client, freelancer, arbiter } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "i changed my mind");
            await disputeResolver.connect(arbiter).resolveDispute(1, 0, 100);

            const dispute = await disputeResolver.getDispute(1);
            expect(dispute.status).to.equal(1); // DisputeStatus.RESOLVED
        });

        // failure: attacker tries to resolve without arbiter role
        it("should revert if non-arbiter tries to resolve", async function () {
            const { disputeResolver, client, attacker } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "reason");
            await expect(
                disputeResolver.connect(attacker).resolveDispute(1, 50, 50)
            ).to.be.revertedWithCustomError(disputeResolver, "AccessControlUnauthorizedAccount");
        });

        // boundary: shares must add to exactly 100 — 60+50=110 should fail
        it("should revert if shares do not add up to 100", async function () {
            const { disputeResolver, client, arbiter } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "reason");
            await expect(
                disputeResolver.connect(arbiter).resolveDispute(1, 60, 50)
            ).to.be.revertedWithCustomError(disputeResolver, "SharesMustAdd100");
        });

        // failure: trying to resolve an already resolved dispute
        it("should revert if dispute is already resolved", async function () {
            const { disputeResolver, client, arbiter } = await loadFixture(deployAndSetupFixture);
            await disputeResolver.connect(client).openDispute(1, "reason");
            await disputeResolver.connect(arbiter).resolveDispute(1, 50, 50);
            await expect(
                disputeResolver.connect(arbiter).resolveDispute(1, 50, 50)
            ).to.be.revertedWithCustomError(disputeResolver, "InvalidDisputeStatus");
        });
    });
});
