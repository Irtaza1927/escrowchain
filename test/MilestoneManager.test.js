// file: MilestoneManager.test.js
// description: automated tests for the MilestoneManager contract.
// covers adding milestones, freelancer submissions with IPFS CIDs,
// client approvals (which trigger ETH payment), rejections, and
// security failures (wrong role calling functions).

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MilestoneManager", function () {

    // deploys and links all contracts, creates a funded job with freelancer assigned
    async function deployAndSetupFixture() {
        const [deployer, client, freelancer, attacker] = await ethers.getSigners();

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

        // set up roles
        await escrowCore.connect(client).registerAsClient();
        await milestoneManager.connect(client).registerAsClient();
        await escrowCore.connect(freelancer).registerAsFreelancer();
        await milestoneManager.connect(freelancer).registerAsFreelancer();

        // create a job with 2 ETH and assign the freelancer
        const jobAmount = ethers.parseEther("2");
        await escrowCore.connect(client).createJob("Design app", "UI/UX needed", { value: jobAmount });
        await escrowCore.connect(client).assignFreelancer(1, freelancer.address);

        return { escrowCore, milestoneManager, disputeResolver, deployer, client, freelancer, attacker };
    }

    // ===== addMilestone tests =====
    describe("addMilestone", function () {

        // normal: client adds a milestone to their job
        it("should add a milestone to the job", async function () {
            const { milestoneManager, client } = await loadFixture(deployAndSetupFixture);
            const milestoneAmount = ethers.parseEther("1");

            await milestoneManager.connect(client).addMilestone(1, "Create wireframes", milestoneAmount);

            const ms = await milestoneManager.getMilestone(1);
            expect(ms.jobId).to.equal(1);
            expect(ms.amount).to.equal(milestoneAmount);
            expect(ms.status).to.equal(0); // MilestoneStatus.PENDING
        });

        // failure: non-client tries to add milestone
        it("should revert if non-client adds milestone", async function () {
            const { milestoneManager, attacker } = await loadFixture(deployAndSetupFixture);
            await expect(
                milestoneManager.connect(attacker).addMilestone(1, "desc", ethers.parseEther("1"))
            ).to.be.revertedWithCustomError(milestoneManager, "NotJobClient");
        });

        // boundary: zero amount milestone should fail
        it("should revert if milestone amount is zero", async function () {
            const { milestoneManager, client } = await loadFixture(deployAndSetupFixture);
            await expect(
                milestoneManager.connect(client).addMilestone(1, "desc", 0)
            ).to.be.revertedWithCustomError(milestoneManager, "InvalidAmount");
        });
    });

    // ===== submitMilestone tests =====
    describe("submitMilestone", function () {

        // normal: freelancer submits with a valid IPFS CID
        it("should submit milestone with IPFS CID", async function () {
            const { milestoneManager, client, freelancer } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "Create wireframes", ethers.parseEther("1"));

            const fakeCID = "QmXyz1234567890abcdef";
            await milestoneManager.connect(freelancer).submitMilestone(1, fakeCID);

            const ms = await milestoneManager.getMilestone(1);
            expect(ms.status).to.equal(1); // MilestoneStatus.SUBMITTED
            expect(ms.ipfsCID).to.equal(fakeCID);
            expect(ms.submittedBy).to.equal(freelancer.address);
        });

        // failure: attacker (not the job's freelancer) tries to submit
        it("should revert if non-freelancer tries to submit", async function () {
            const { milestoneManager, client, attacker } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await expect(
                milestoneManager.connect(attacker).submitMilestone(1, "QmFakeCID")
            ).to.be.revertedWithCustomError(milestoneManager, "NotJobFreelancer");
        });

        // failure: submitting with an empty IPFS CID
        it("should revert if IPFS CID is empty", async function () {
            const { milestoneManager, client, freelancer } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await expect(
                milestoneManager.connect(freelancer).submitMilestone(1, "")
            ).to.be.revertedWithCustomError(milestoneManager, "EmptyCID");
        });
    });

    // ===== approveMilestone tests =====
    describe("approveMilestone", function () {

        // normal: client approves and freelancer receives ETH
        it("should approve milestone and release ETH to freelancer", async function () {
            const { milestoneManager, client, freelancer } = await loadFixture(deployAndSetupFixture);
            const amount = ethers.parseEther("1");
            await milestoneManager.connect(client).addMilestone(1, "desc", amount);
            await milestoneManager.connect(freelancer).submitMilestone(1, "QmCID123");

            const before = await ethers.provider.getBalance(freelancer.address);
            await milestoneManager.connect(client).approveMilestone(1);
            const after = await ethers.provider.getBalance(freelancer.address);

            expect(after).to.be.greaterThan(before);
        });

        // failure: attacker tries to approve a milestone
        it("should revert if non-client tries to approve", async function () {
            const { milestoneManager, client, freelancer, attacker } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await milestoneManager.connect(freelancer).submitMilestone(1, "QmCID123");
            await expect(
                milestoneManager.connect(attacker).approveMilestone(1)
            ).to.be.revertedWithCustomError(milestoneManager, "NotJobClient");
        });

        // failure: trying to approve a milestone that hasn't been submitted yet
        it("should revert if milestone is still in PENDING status", async function () {
            const { milestoneManager, client } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await expect(
                milestoneManager.connect(client).approveMilestone(1)
            ).to.be.revertedWithCustomError(milestoneManager, "InvalidMilestoneStatus");
        });
    });

    // ===== rejectMilestone tests =====
    describe("rejectMilestone", function () {

        // normal: client rejects, milestone goes back to allow resubmission
        it("should reject milestone and allow freelancer to resubmit", async function () {
            const { milestoneManager, client, freelancer } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await milestoneManager.connect(freelancer).submitMilestone(1, "QmCID123");
            await milestoneManager.connect(client).rejectMilestone(1, "not what i asked for");

            const ms = await milestoneManager.getMilestone(1);
            expect(ms.status).to.equal(3); // MilestoneStatus.REJECTED
            expect(ms.ipfsCID).to.equal(""); // CID cleared on rejection
        });

        // normal: freelancer can resubmit after rejection
        it("should allow freelancer to resubmit after rejection", async function () {
            const { milestoneManager, client, freelancer } = await loadFixture(deployAndSetupFixture);
            await milestoneManager.connect(client).addMilestone(1, "desc", ethers.parseEther("1"));
            await milestoneManager.connect(freelancer).submitMilestone(1, "QmOldCID");
            await milestoneManager.connect(client).rejectMilestone(1, "try again");
            await milestoneManager.connect(freelancer).submitMilestone(1, "QmNewCID");

            const ms = await milestoneManager.getMilestone(1);
            expect(ms.status).to.equal(1); // MilestoneStatus.SUBMITTED
            expect(ms.ipfsCID).to.equal("QmNewCID");
        });
    });
});
