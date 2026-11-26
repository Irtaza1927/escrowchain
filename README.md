# EscrowChain, Trustless Freelance Escrow DApp

A decentralized marketplace where clients lock ETH in escrow, freelancers apply with proposals, and milestone payments release automatically on approval. Disputes are settled by a neutral arbiter with a transparent on-chain split.

![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-2.19-yellow?logo=hardhat)
![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)
![ethers.js](https://img.shields.io/badge/ethers.js-6.17-blue)
![Tests](https://img.shields.io/badge/tests-45%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

> Built by **Irtaza Zahid** (`23i-2096`), FAST-NUCES Islamabad.

---

## What this project does

Freelancers and clients do not trust each other. Platforms in the middle charge huge fees and still hold the money opaquely. EscrowChain removes the middleman:

- **Client** posts a job and ETH is locked by the smart contract. No one can touch it until the rules say so.
- **Freelancers** browse the public job board and apply with a proposal.
- **Client** picks one applicant, defines milestones, approves work. Payments release automatically on approval.
- **Arbiter** settles disputes with a transparent percentage split. Every decision is anchored on-chain.
- **IPFS** stores the deliverable files. Only the content hash goes on-chain, so files are tamper-proof.

---

## Highlights

- 🪙 **3 smart contracts** with meaningful inheritance (`AccessControlBase` extended by `EscrowCore`, `MilestoneManager`, `DisputeResolver`)
- 🛡️ **Security first**, ReentrancyGuard, Checks-Effects-Interactions, OpenZeppelin AccessControl, 15 negative tests
- ⛽ **Gas optimised**, custom errors plus unchecked counters save up to 11.7% on key operations
- 🗂️ **Hybrid architecture**, IPFS off-chain storage plus Node.js event indexer plus ethers.js frontend
- 🎨 **Professional UI**, React 18 with role-aware routing, inline uploads, confetti celebrations, live activity feed, system status widget, role switcher
- 🧪 **45 automated tests** covering normal, boundary, and failure cases

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Smart contracts | Solidity 0.8.20, OpenZeppelin, Hardhat |
| Frontend | React 18, ethers.js v6, react-hot-toast, lucide-react, canvas-confetti |
| Off-chain storage | Pinata IPFS, with local demo fallback |
| Indexer | Node.js plus ethers.js event listeners |
| Wallet | MetaMask |
| Local chain | Ganache or Hardhat Network, chain id 1337 |
| Testing | Hardhat plus Chai, hardhat-gas-reporter |

---

## Architecture

```
┌──────────┐    ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│  User +  │ -> │   React DApp │ -> │   EscrowCore     │ <- │  Node.js    │
│ MetaMask │    │  (ethers.js) │    │ ┌──────────────┐ │    │  Indexer    │
└──────────┘    └──────────────┘    │ │MilestoneMgr  │ │    └─────────────┘
       │                │           │ └──────────────┘ │           │
       │                │           │ ┌──────────────┐ │           │
       │                └──────────>│ │DisputeResolvr│ │ -> events │
       │                            │ └──────────────┘ │           │
       └─────────────> Pinata IPFS  │ AccessControlBase│           │
                        (files)     └──────────────────┘           │
                             │                                      │
                             └──> CID anchored on-chain             │
                                                                   V
                                                              db.json
```

All three contracts inherit `AccessControlBase` for roles (`CLIENT`, `FREELANCER`, `ARBITER`) and `Pausable` emergency control. The marketplace flow lives in `EscrowCore`; milestones live in `MilestoneManager`; disputes live in `DisputeResolver`.

---

## Quick Start

### Prerequisites

- **Node.js 18+**, [download](https://nodejs.org)
- **MetaMask** browser extension, [download](https://metamask.io)
- A local blockchain, pick one:
  - **Ganache GUI**, [download](https://trufflesuite.com/ganache/), easy visual interface
  - **Hardhat Network**, ships with this project, no install needed
- Free **[Pinata](https://pinata.cloud)** account for IPFS, *optional*, the DApp falls back to local demo storage if Pinata keys are not set

### Step 1. Clone and install

```powershell
git clone https://github.com/Irtaza1927/escrowchain.git
cd escrowchain

# install root (hardhat) deps
npm install

# install frontend deps
cd frontend
npm install
cd ..

# install indexer deps
cd indexer
npm install
cd ..
```

### Step 2. Create your env files

```powershell
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env
```

Then open the two `.env` files in a text editor and fill in:

**`.env`** (root, used by Hardhat and the deploy script):
```
DEPLOYER_PRIVATE_KEY=0x...   # private key of the account that will deploy
```

**`frontend/.env`** (used by the React app for Pinata uploads):
```
REACT_APP_PINATA_API_KEY=...
REACT_APP_PINATA_SECRET_KEY=...
```
Get both from `pinata.cloud`, API Keys, New Key, toggle Admin on, Create. **Leave these blank to run the DApp in local demo IPFS mode.**

### Step 3. Start your local blockchain

**Option A, Ganache GUI (recommended for a visual experience)**

1. Open the Ganache GUI app and click **Quickstart Ethereum**.
2. Confirm the top bar shows RPC `HTTP://127.0.0.1:7545`, Network ID `1337`, 10 pre-funded accounts with 100 ETH each.
3. Click the key icon next to Account 0 and paste its private key into the root `.env` as `DEPLOYER_PRIVATE_KEY`.

**Option B, Hardhat Network (zero install, comes with the project)**

Open a dedicated terminal and run:
```powershell
npx hardhat node
```
This starts a local chain at `http://127.0.0.1:8545`, chain id `1337`, with 20 pre-funded accounts. The first account's private key appears in the output. Copy it into the root `.env` as `DEPLOYER_PRIVATE_KEY`. Leave this terminal running.

### Step 4. Deploy the smart contracts

In a new terminal at the project root:

**For Ganache:**
```powershell
npm run deploy:ganache
```

**For Hardhat Network:**
```powershell
npx hardhat run scripts/deploy.js --network localhost
```

Either command deploys all three contracts and writes their addresses plus ABIs into `frontend/src/contracts/`. The deployer account becomes the contract admin and the default arbiter.

### Step 5. Start the event indexer (Terminal 2)

```powershell
cd indexer
node index.js
```

The indexer subscribes to every event emitted by the three contracts and writes a readable `db.json` next to it. Leave this terminal open.

> If you are using Hardhat Network (port 8545) instead of Ganache (port 7545), edit `indexer/index.js` and change the RPC URL constant to `http://127.0.0.1:8545` before starting.

### Step 6. Start the frontend (Terminal 3)

```powershell
cd frontend
npm start
```

This opens the DApp at `http://localhost:3000`.

### Step 7. Connect MetaMask

Add your local network to MetaMask manually:

**For Ganache:** RPC `http://127.0.0.1:7545`, Chain ID `1337`, Currency `ETH`.

**For Hardhat Network:** RPC `http://127.0.0.1:8545`, Chain ID `1337`, Currency `ETH`.

Then import 3 accounts from the chosen network (copy their private keys from Ganache GUI or the `hardhat node` output). Suggested MetaMask labels: `Deployer (Arbiter)`, `Client`, `Freelancer`. Switch between them to test the three roles.

### Step 8. Try the full flow

1. Switch MetaMask to your **Client** account. The DApp will show the "Pick your role" screen. Click **Register as Client**.
2. Post a job (for example, 1 ETH budget). The ETH leaves your wallet and locks in the contract.
3. Switch MetaMask to the **Freelancer** account. Register as Freelancer.
4. Browse the open job board, apply with a short proposal.
5. Switch back to the Client. Open the job, click **Accept** on the freelancer.
6. The Client adds a milestone (for example, 0.5 ETH).
7. Switch to the Freelancer. Open the assigned job, attach any file, click **Submit Work**. The file goes to IPFS (or local demo store), the CID is anchored on-chain.
8. Switch back to the Client. Click **Approve** on the milestone. 🎉 Confetti and 0.5 ETH released to the freelancer.
9. To test the dispute flow, open a dispute on an in-progress job, switch to the Deployer (Arbiter) account, set a client/freelancer split, and resolve.

---

## Testing

The project ships with **45 automated Hardhat tests** covering normal, boundary, and failure cases across all four contracts. Tests run in isolation on Hardhat's built-in in-memory EVM, no local chain needed.

### Run all tests

```powershell
npx hardhat test
```

Expected output:

```
  ApplicationFlow      15 passing
  DisputeResolver      10 passing
  EscrowCore           15 passing
  MilestoneManager     11 passing

  45 passing
```

### Run a single test file

```powershell
npx hardhat test test/EscrowCore.test.js
npx hardhat test test/ApplicationFlow.test.js
npx hardhat test test/MilestoneManager.test.js
npx hardhat test test/DisputeResolver.test.js
```

### What is covered

| Suite | Cases |
|-------|-------|
| **EscrowCore** | Role grants on deploy, job creation plus ETH lock, counter increment, assignFreelancer happy path, boundary (zero-ETH revert, non-existent job), security (unauthorized `releasePayment`, unauthorized `markDisputed`, paused state, non-admin pause) |
| **ApplicationFlow** | `applyToJob` happy plus emit event plus registers applicant, double-apply revert, non-freelancer revert, client-cannot-apply-to-own-job, non-existent job revert, `withdrawApplication` marks and allows reapply, `acceptApplication` transitions job plus flags accepted, unauthorized accept revert, withdrawn-cannot-be-accepted revert |
| **MilestoneManager** | `addMilestone` happy plus non-client revert plus zero amount revert, `submitMilestone` happy plus wrong-role revert plus empty CID revert, `approveMilestone` releases ETH plus wrong state revert, `rejectMilestone` allows resubmission |
| **DisputeResolver** | `openDispute` from client plus freelancer, status transition, non-participant revert, duplicate revert, `resolveDispute` splits funds, 100% freelancer path, non-arbiter revert, shares-must-sum-to-100 revert, already-resolved revert |

### Gas report

The `hardhat-gas-reporter` plugin runs automatically with every `npx hardhat test` call and writes a full gas table to `gas-report/gas-report.txt`. A baseline file (`gas-report/baseline.txt`) captures the pre-optimization numbers.

---

## Project Structure

```
escrowchain/
├── contracts/              # Solidity smart contracts
│   ├── AccessControlBase.sol
│   ├── EscrowCore.sol
│   ├── MilestoneManager.sol
│   └── DisputeResolver.sol
├── scripts/
│   └── deploy.js           # Hardhat deploy script
├── test/                   # 45 automated tests
│   ├── EscrowCore.test.js
│   ├── ApplicationFlow.test.js
│   ├── MilestoneManager.test.js
│   └── DisputeResolver.test.js
├── frontend/               # React DApp
│   └── src/
│       ├── pages/          # ClientDashboard, FreelancerDashboard, ArbiterPanel
│       ├── components/     # Navbar, Modal, Timeline, Avatar, RightPanel, ...
│       └── utils/          # ethers, ipfs, celebrate, recentActivity, ...
├── indexer/
│   └── index.js            # Node.js event listener -> db.json
├── gas-report/
│   └── baseline.txt
└── hardhat.config.js
```

---

## User Roles

| Role | Can do |
|------|--------|
| **Client** | Post jobs, review applicants, accept one, add milestones, approve or reject work, open disputes, cancel open jobs |
| **Freelancer** | Browse open jobs, apply with a proposal, withdraw applications, upload IPFS deliverables, submit milestones, open disputes |
| **Arbiter** | View open disputes, set resolution split (0 to 100% client/freelancer), resolve and distribute remaining funds |
| **Admin** (deployer) | Grant arbiter role to any address, pause or unpause all contracts in emergencies |

---

## Security Highlights

- **Reentrancy**, `ReentrancyGuard` on every function that sends ETH, Checks-Effects-Interactions on every path
- **Access control**, OpenZeppelin AccessControl with 4 roles, custom `onlyAuthorizedContract` for inter-contract calls
- **Input validation**, custom errors, 42-char address checks, non-zero amount requires, state-machine guards
- **Emergency pause**, admin can halt every state-changing function
- **Negative tests**, 15 plus tests prove unauthorized calls revert with the correct custom error

---

## Gas Optimization

| Operation | Baseline | Optimized | Saved |
|-----------|---------:|----------:|------:|
| `createJob` | 199,840 | 190,020 | -4.9% |
| `addMilestone` | 232,110 | 217,784 | -6.2% |
| `approveMilestone` | 118,450 | 104,622 | **-11.7%** |

Two optimizations applied: custom errors replace require strings, and `unchecked` increments on monotonic counters.

---

## License

MIT

---

## Author

**Irtaza Zahid**, [@Irtaza1927](https://github.com/Irtaza1927)
