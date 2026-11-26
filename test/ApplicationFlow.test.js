// file: ApplicationFlow.test.js
// description: tests for the marketplace application flow added to EscrowCore.
// covers apply, withdraw, accept, and failure scenarios.

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ApplicationFlow", function () {

    async function deployFixture() {
        const [deployer, client, freelancer1, freelancer2, attacker] = await ethers.getSigners();

        const EscrowCore = await ethers.getContractFactory("EscrowCore");
        const escrowCore = await EscrowCore.deploy();

        await escrowCore.connect(client).registerAsClient();
        await escrowCore.connect(freelancer1).registerAsFreelancer();
        await escrowCore.connect(freelancer2).registerAsFreelancer();

        await escrowCore.connect(client).createJob("Design logo", "simple logo", { value: ethers.parseEther("1") });

        return { escrowCore, deployer, client, freelancer1, freelancer2, attacker };
    }

    describe("applyToJob", function () {

        it("lets a registered freelancer apply with a proposal", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "I can do this");

            const app = await escrowCore.getApplication(1, freelancer1.address);
            expect(app.proposal).to.equal("I can do this");
            expect(app.status).to.equal(1); // PENDING
        });

        it("emits AppliedToJob event", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(freelancer1).applyToJob(1, "pick me")
            ).to.emit(escrowCore, "AppliedToJob").withArgs(1, freelancer1.address, "pick me");
        });

        it("records the freelancer in getJobApplicants", async function () {
            const { escrowCore, freelancer1, freelancer2 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "a");
            await escrowCore.connect(freelancer2).applyToJob(1, "b");

            const list = await escrowCore.getJobApplicants(1);
            expect(list).to.include(freelancer1.address);
            expect(list).to.include(freelancer2.address);
        });

        it("reverts if freelancer applies twice to the same job", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "first");
            await expect(
                escrowCore.connect(freelancer1).applyToJob(1, "second")
            ).to.be.revertedWithCustomError(escrowCore, "AlreadyApplied");
        });

        it("reverts if non-freelancer tries to apply", async function () {
            const { escrowCore, attacker } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(attacker).applyToJob(1, "sneaky")
            ).to.be.revertedWithCustomError(escrowCore, "FreelancerNotRegistered");
        });

        it("reverts if the client tries to apply to their own job", async function () {
            const { escrowCore, client } = await loadFixture(deployFixture);
            await escrowCore.connect(client).registerAsFreelancer();
            await expect(
                escrowCore.connect(client).applyToJob(1, "self apply")
            ).to.be.revertedWithCustomError(escrowCore, "ClientCannotApplyToOwnJob");
        });

        it("reverts if job does not exist", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(freelancer1).applyToJob(999, "ghost")
            ).to.be.revertedWithCustomError(escrowCore, "JobDoesNotExist");
        });
    });

    describe("withdrawApplication", function () {

        it("marks application as WITHDRAWN", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "p");
            await escrowCore.connect(freelancer1).withdrawApplication(1);

            const app = await escrowCore.getApplication(1, freelancer1.address);
            expect(app.status).to.equal(3); // WITHDRAWN
        });

        it("allows reapplying after withdrawal", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "first");
            await escrowCore.connect(freelancer1).withdrawApplication(1);
            await escrowCore.connect(freelancer1).applyToJob(1, "second try");

            const app = await escrowCore.getApplication(1, freelancer1.address);
            expect(app.status).to.equal(1); // PENDING
            expect(app.proposal).to.equal("second try");
        });

        it("reverts withdraw if there is no pending application", async function () {
            const { escrowCore, freelancer1 } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(freelancer1).withdrawApplication(1)
            ).to.be.revertedWithCustomError(escrowCore, "InvalidApplicationStatus");
        });
    });

    describe("acceptApplication", function () {

        it("transitions job to IN_PROGRESS and sets freelancer", async function () {
            const { escrowCore, client, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "p");
            await escrowCore.connect(client).acceptApplication(1, freelancer1.address);

            const job = await escrowCore.getJob(1);
            expect(job.freelancer).to.equal(freelancer1.address);
            expect(job.status).to.equal(1); // IN_PROGRESS
        });

        it("marks the accepted application as ACCEPTED", async function () {
            const { escrowCore, client, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "p");
            await escrowCore.connect(client).acceptApplication(1, freelancer1.address);

            const app = await escrowCore.getApplication(1, freelancer1.address);
            expect(app.status).to.equal(2); // ACCEPTED
        });

        it("reverts if non-client tries to accept", async function () {
            const { escrowCore, freelancer1, attacker } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "p");
            await expect(
                escrowCore.connect(attacker).acceptApplication(1, freelancer1.address)
            ).to.be.revertedWithCustomError(escrowCore, "OnlyClient");
        });

        it("reverts if freelancer never applied", async function () {
            const { escrowCore, client, freelancer1 } = await loadFixture(deployFixture);
            await expect(
                escrowCore.connect(client).acceptApplication(1, freelancer1.address)
            ).to.be.revertedWithCustomError(escrowCore, "InvalidApplicationStatus");
        });

        it("reverts if trying to accept a withdrawn application", async function () {
            const { escrowCore, client, freelancer1 } = await loadFixture(deployFixture);
            await escrowCore.connect(freelancer1).applyToJob(1, "p");
            await escrowCore.connect(freelancer1).withdrawApplication(1);
            await expect(
                escrowCore.connect(client).acceptApplication(1, freelancer1.address)
            ).to.be.revertedWithCustomError(escrowCore, "InvalidApplicationStatus");
        });
    });
});
