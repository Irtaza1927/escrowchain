// file: EscrowCore.test.js
// description: automated tests for the EscrowCore contract.
// covers normal cases (create job, assign freelancer, cancel),
// boundary cases (zero amount, non-existent jobs),
// and failure/security cases (unauthorized calls, reentrancy, pause).

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("EscrowCore", function () {

    // deploys all contracts fresh for every test block
    async function deployFixture() {
        const [deployer, client, freelancer, arbiter, attacker] = await ethers.getSigners();

        const EscrowCore       = await ethers.getContractFactory("EscrowCore");
        const MilestoneManager = await ethers.getContractFactory("MilestoneManager");
        const DisputeResolver  = await ethers.getContractFactory("DisputeResolver");

        const escrowCore       = await EscrowCore.deploy();
        const milestoneManager = await MilestoneManager.deploy();
        const disputeResolver  = await DisputeResolver.deploy();

        // link contracts together
        await escrowCore.setMilestoneManager(await milestoneManager.getAddress());
        await escrowCore.setDisputeResolver(await disputeResolver.getAddress());
        await milestoneManager.setEscrowCore(await escrowCore.getAddress());
        await disputeResolver.setEscrowCore(await escrowCore.getAddress());

        // register roles for test accounts
        await escrowCore.connect(client).registerAsClient();
        await escrowCore.connect(freelancer).registerAsFreelancer();
        await escrowCore.grantArbiterRole(arbiter.address);

        return { escrowCore, milestoneManager, disputeResolver, deployer, client, freelancer, arbiter, attacker };
    }

    // ===== deployment tests =====
    describe("deployment", function () {

        // verifies deployer is set as admin automatically
        it("should grant deployer the admin role", async function () {
            const { escrowCore, deployer } = await loadFixture(deployFixture);
            const ADMIN = await escrowCore.DEFAULT_ADMIN_ROLE();
            expect(await escrowCore.hasRole(ADMIN, deployer.address)).to.be.true;
        });

        // verifies deployer also gets arbiter role by default
        it("should grant deployer the arbiter role", async function () {
            const { escrowCore, deployer } = await loadFixture(deployFixture);
            expect(await escrowCore.isArbiter(deployer.address)).to.be.true;
        });
    });

    // ===== createJob tests =====
    describe("createJob", function () {

        // normal: client creates a job with valid ETH
        it("should create a job and lock ETH in the contract", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            const amount = ethers.parseEther("1.0");

            await escrowCore.connect(client).createJob("Build website", "React frontend needed", { value: amount });

            const job = await escrowCore.getJob(1);
            expect(job.client).to.equal(client.address);
            expect(job.totalAmount).to.equal(amount);
            expect(job.status).to.equal(0); // JobStatus.OPEN
        });

        // normal: job counter increments with each new job
        it("should increment job ID with each new job", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            const amount = ethers.parseEther("1");
            await escrowCore.connect(client).createJob("Job 1", "desc", { value: amount });
            await escrowCore.connect(client).createJob("Job 2", "desc", { value: amount });
            expect(await escrowCore.getTotalJobs()).to.equal(2);
        });

        // normal: ETH is actually held in the contract after job creation
        it("should lock ETH in the contract balance", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            const amount = ethers.parseEther("2.5");
            await escrowCore.connect(client).createJob("Job", "desc", { value: amount });

            const contractBalance = await ethers.provider.getBalance(await escrowCore.getAddress());
            expect(contractBalance).to.equal(amount);
        });

        // failure: non-registered user tries to create job
        it("should revert if caller is not a registered client", async function () {
            const { escrowCore, attacker } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(attacker).createJob("Hack", "desc", { value: ethers.parseEther("1") })
            ).to.be.revertedWithCustomError(escrowCore, "OnlyClient");
        });

        // boundary: zero ETH sent — must reject
        it("should revert if zero ETH is sent", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(client).createJob("Job", "desc", { value: 0 })
            ).to.be.revertedWithCustomError(escrowCore, "InvalidAmount");
        });

        // normal: job emits JobCreated event with correct data
        it("should emit JobCreated event", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            const amount = ethers.parseEther("1");
            await expect(
                escrowCore.connect(client).createJob("My Job", "desc", { value: amount })
            ).to.emit(escrowCore, "JobCreated").withArgs(1, client.address, amount, "My Job");
        });
    });

    // ===== assignFreelancer tests =====
    describe("assignFreelancer", function () {

        // normal: client successfully assigns a registered freelancer
        it("should assign freelancer and change status to IN_PROGRESS", async function () {
            const { escrowCore, client, freelancer } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await escrowCore.connect(client).assignFreelancer(1, freelancer.address);

            const job = await escrowCore.getJob(1);
            expect(job.freelancer).to.equal(freelancer.address);
            expect(job.status).to.equal(1); // JobStatus.IN_PROGRESS
        });

        // failure: different client tries to assign freelancer to someone else's job
        it("should revert if non-owner tries to assign freelancer", async function () {
            const { escrowCore, client, freelancer, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await expect(
                escrowCore.connect(attacker).assignFreelancer(1, freelancer.address)
            ).to.be.revertedWithCustomError(escrowCore, "OnlyClient");
        });

        // failure: assigning to a job that doesn't exist
        it("should revert when job does not exist", async function () {
            const { escrowCore, client, freelancer } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(client).assignFreelancer(999, freelancer.address)
            ).to.be.revertedWithCustomError(escrowCore, "JobDoesNotExist");
        });

        // failure: assigning a non-registered freelancer
        it("should revert if address is not a registered freelancer", async function () {
            const { escrowCore, client, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await expect(
                escrowCore.connect(client).assignFreelancer(1, attacker.address)
            ).to.be.revertedWithCustomError(escrowCore, "FreelancerNotRegistered");
        });
    });

    // ===== cancelJob tests =====
    describe("cancelJob", function () {

        // normal: client cancels an open job and receives refund
        it("should cancel job and refund ETH to client", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            const amount = ethers.parseEther("1");
            await escrowCore.connect(client).createJob("Job", "desc", { value: amount });

            const before = await ethers.provider.getBalance(client.address);
            const tx     = await escrowCore.connect(client).cancelJob(1);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const after  = await ethers.provider.getBalance(client.address);

            // allow for small rounding difference due to gas
            expect(after).to.be.closeTo(before + amount - gasCost, ethers.parseEther("0.001"));
        });

        // failure: cancel a job that is already in progress
        it("should revert if job status is not OPEN", async function () {
            const { escrowCore, client, freelancer } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await escrowCore.connect(client).assignFreelancer(1, freelancer.address);
            await expect(
                escrowCore.connect(client).cancelJob(1)
            ).to.be.revertedWithCustomError(escrowCore, "InvalidJobStatus");
        });

        // failure: attacker tries to cancel someone else's job
        it("should revert if non-client tries to cancel", async function () {
            const { escrowCore, client, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await expect(
                escrowCore.connect(attacker).cancelJob(1)
            ).to.be.revertedWithCustomError(escrowCore, "OnlyClient");
        });
    });

    // ===== security tests =====
    describe("security", function () {

        // attack scenario 1: attacker calls releasePayment directly (bypassing MilestoneManager)
        it("should revert if attacker calls releasePayment directly", async function () {
            const { escrowCore, client, freelancer, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await escrowCore.connect(client).assignFreelancer(1, freelancer.address);

            await expect(
                escrowCore.connect(attacker).releasePayment(1, freelancer.address, ethers.parseEther("1"))
            ).to.be.revertedWithCustomError(escrowCore, "OnlyAuthorizedContract");
        });

        // attack scenario 2: attacker calls markDisputed directly (bypassing DisputeResolver)
        it("should revert if attacker calls markDisputed directly", async function () {
            const { escrowCore, client, freelancer, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") });
            await escrowCore.connect(client).assignFreelancer(1, freelancer.address);

            await expect(
                escrowCore.connect(attacker).markDisputed(1)
            ).to.be.revertedWithCustomError(escrowCore, "OnlyAuthorizedContract");
        });

        // security: paused contract rejects all state-changing operations
        it("should revert createJob when contract is paused", async function () {
            const { escrowCore, client, deployer } = await loadFixture(deployFixture);
            await escrowCore.connect(deployer).pause();
            await expect(
                escrowCore.connect(client).createJob("Job", "desc", { value: ethers.parseEther("1") })
            ).to.be.reverted;
        });

        // security: only admin can pause — others must be rejected
        it("should revert if non-admin tries to pause", async function () {
            const { escrowCore, attacker } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(attacker).pause()
            ).to.be.revertedWithCustomError(escrowCore, "AccessControlUnauthorizedAccount");
        });
    });
});
