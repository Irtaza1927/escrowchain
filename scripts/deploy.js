// file: deploy.js
// description: deployment script for all three smart contracts.
// deploys EscrowCore, MilestoneManager, and DisputeResolver in order,
// then links them together by setting each other's addresses.
// finally saves the deployed contract addresses and abis to frontend/src/contracts/
// so the frontend can automatically find the right contract addresses.
//
// usage:
//   deploy to ganache:  npx hardhat run scripts/deploy.js --network ganache
//   deploy to hardhat:  npx hardhat run scripts/deploy.js --network hardhat

const hre    = require("hardhat");
const fs     = require("fs");
const path   = require("path");

// saves contract address and abi to frontend/src/contracts/<Name>.json
// the frontend reads this file to know where each contract is deployed
async function saveContractData(contractName, deployedContract) {
    const artifactPath = path.join(
        __dirname,
        `../artifacts/contracts/${contractName}.sol/${contractName}.json`
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const output = {
        address: await deployedContract.getAddress(),
        abi:     artifact.abi
    };

    const outDir  = path.join(__dirname, "../frontend/src/contracts");
    const outFile = path.join(outDir, `${contractName}.json`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`  saved ${contractName}.json -> ${outFile}`);
}

// main deployment sequence
async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const balance    = await deployer.provider.getBalance(deployer.address);

    console.log("=== escrow dapp deployment ===");
    console.log(`deployer: ${deployer.address}`);
    console.log(`balance:  ${hre.ethers.formatEther(balance)} ETH`);
    console.log("");

    // step 1: deploy EscrowCore (inherits AccessControlBase)
    console.log("1. deploying EscrowCore...");
    const EscrowCore = await hre.ethers.getContractFactory("EscrowCore");
    const escrowCore = await EscrowCore.deploy();
    await escrowCore.waitForDeployment();
    console.log(`   EscrowCore deployed: ${await escrowCore.getAddress()}`);

    // step 2: deploy MilestoneManager (inherits AccessControlBase)
    console.log("2. deploying MilestoneManager...");
    const MilestoneManager = await hre.ethers.getContractFactory("MilestoneManager");
    const milestoneManager = await MilestoneManager.deploy();
    await milestoneManager.waitForDeployment();
    console.log(`   MilestoneManager deployed: ${await milestoneManager.getAddress()}`);

    // step 3: deploy DisputeResolver (inherits AccessControlBase)
    console.log("3. deploying DisputeResolver...");
    const DisputeResolver = await hre.ethers.getContractFactory("DisputeResolver");
    const disputeResolver = await DisputeResolver.deploy();
    await disputeResolver.waitForDeployment();
    console.log(`   DisputeResolver deployed: ${await disputeResolver.getAddress()}`);

    // step 4: link contracts — tell each contract about its siblings
    console.log("4. linking contracts together...");
    await escrowCore.setMilestoneManager(await milestoneManager.getAddress());
    await escrowCore.setDisputeResolver(await disputeResolver.getAddress());
    await milestoneManager.setEscrowCore(await escrowCore.getAddress());
    await disputeResolver.setEscrowCore(await escrowCore.getAddress());
    console.log("   all contracts linked successfully");

    // step 5: save contract data for frontend
    console.log("5. saving contract data for frontend...");
    await saveContractData("EscrowCore",       escrowCore);
    await saveContractData("MilestoneManager", milestoneManager);
    await saveContractData("DisputeResolver",  disputeResolver);

    console.log("");
    console.log("=== deployment complete ===");
    console.log("addresses summary:");
    console.log(`  EscrowCore:        ${await escrowCore.getAddress()}`);
    console.log(`  MilestoneManager:  ${await milestoneManager.getAddress()}`);
    console.log(`  DisputeResolver:   ${await disputeResolver.getAddress()}`);
    console.log("");
    console.log("next steps:");
    console.log("  1. start the indexer:  cd indexer && node index.js");
    console.log("  2. start the frontend: cd frontend && npm start");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
