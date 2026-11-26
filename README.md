# EscrowChain — Trustless Freelance Escrow DApp

A decentralized marketplace where clients lock ETH in escrow, freelancers apply with proposals, and milestone payments release automatically on approval. Disputes are settled by a neutral arbiter with a transparent on-chain split.

![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-2.19-yellow?logo=hardhat)
![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)
![ethers.js](https://img.shields.io/badge/ethers.js-6.17-blue)
![Tests](https://img.shields.io/badge/tests-45%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

> Semester project for **Blockchain and Cryptocurrencies (BLC3002)**.
> Built solo by **Irtaza Zahid** (`23i-2096`).

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

- 🪙 **3 smart contracts** with meaningful inheritance (`AccessControlBase` → `EscrowCore`, `MilestoneManager`, `DisputeResolver`)
- 🛡️ **Security first** — `ReentrancyGuard`, Checks-Effects-Interactions, OpenZeppelin AccessControl, 15 negative tests
- ⛽ **Gas optimised** — custom errors + unchecked counters save up to 11.7% on key operations (full report in `docs/`)
- 🗂️ **Hybrid architecture** — IPFS off-chain storage + Node.js event indexer + ethers.js frontend
- 🎨 **Professional UI** — React 18 with role-aware routing, inline uploads, confetti celebrations, live activity feed, system status widget, role switcher
- 🧪 **45 automated tests** covering normal, boundary, and failure cases

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Smart contracts | Solidity 0.8.20, OpenZeppelin, Hardhat |
| Frontend | React 18, ethers.js v6, react-hot-toast, lucide-react, canvas-confetti |
| Off-chain storage | Pinata IPFS (with local demo fallback) |
| Indexer | Node.js + ethers.js event listeners |
| Wallet | MetaMask |
| Local chain | Ganache (chain id 1337) |
| Testing | Hardhat + Chai, hardhat-gas-reporter |

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

Full architecture diagrams are in `docs/Technical_Report.docx`.

---

## Quick Start

### Prerequisites

- **Node.js 18+** — [download](https://nodejs.org)
- **Ganache** (GUI) — [download](https://trufflesuite.com/ganache/) — runs the local blockchain on `http://127.0.0.1:7545`, chain id `1337`
- **MetaMask** browser extension — [download](https://metamask.io)
- Free **[Pinata](https://pinata.cloud)** account for IPFS *(optional — the DApp falls back to local demo storage if Pinata keys are not set)*

### Step 1 — Clone and install

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

### Step 2 — Create your env files

```powershell
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env
```

Then open the two `.env` files in a text editor and fill in:

**`.env`** (root — used by Hardhat / deploy script):
```
DEPLOYER_PRIVATE_KEY=0x...   # private key of the Ganache account that will deploy
```
To get this key, open Ganache GUI → click the key icon 🔑 next to Account 0 → copy private key.

**`frontend/.env`** (frontend — used by the React app for Pinata uploads):
```
REACT_APP_PINATA_API_KEY=...
REACT_APP_PINATA_SECRET_KEY=...
```
Get both from `pinata.cloud` → *API Keys* → *New Key* → toggle *Admin* on → *Create*. **Leave these blank to run the DApp in local demo IPFS mode.**

### Step 3 — Start Ganache

Open the Ganache GUI app and click **Quickstart Ethereum**. Confirm the top bar shows:
- RPC Server: `HTTP://127.0.0.1:7545`
- Network ID: `1337`
- 10 pre-funded accounts with 100 ETH each

### Step 4 — Deploy the smart contracts

In a terminal at the project root:

```powershell
npm run deploy:ganache
```

This deploys all three contracts and writes their addresses + ABIs into `frontend/src/contracts/`. The deployer account becomes the contract admin and the default arbiter.

### Step 5 — Start the event indexer (Terminal 2)

```powershell
cd indexer
node index.js
```

The indexer subscribes to every event emitted by the three contracts and writes a readable `db.json` next to it. Leave this terminal open.

### Step 6 — Start the frontend (Terminal 3)

```powershell
cd frontend
npm start
```

This opens the DApp at `http://localhost:3000`.

### Step 7 — Connect MetaMask to Ganache

In MetaMask:

1. **Add Network** manually:
   - Network name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`

2. **Import 3 accounts** from Ganache (click the 🔑 icon next to each account → copy private key → MetaMask → *Add account or hardware wallet* → *Import account* → paste). Suggested labels: `Deployer (Arbiter)`, `Client`, `Freelancer`.

3. Switch MetaMask to any of the three accounts and click **Connect MetaMask** in the DApp.

### Step 8 — Try the full flow

1. Switch MetaMask to your **Client** account. The DApp will show the "Pick your role" screen. Click **Register as Client**.
2. Post a job (1 ETH budget). The ETH leaves your wallet and locks in the contract.
3. Switch MetaMask to the **Freelancer** account. Register as Freelancer.
4. Browse the open job board, apply with a short proposal.
5. Switch back to the Client. Open the job → **Accept** the freelancer.
6. The Client adds a milestone (0.5 ETH).
7. Switch to the Freelancer. Open the assigned job → attach any file → **Submit Work**. The file goes to IPFS (or local demo store), the CID is anchored on-chain.
8. Switch back to the Client. **Approve** the milestone. 🎉 Confetti and 0.5 ETH released.
9. To test the dispute flow, open a dispute on an in-progress job, switch to the Deployer (Arbiter) account, set a client/freelancer split, and resolve.

---

## Testing

The project ships with **45 automated Hardhat tests** covering normal, boundary, and failure cases across all four contracts. Tests run in isolation on Hardhat's built-in in-memory EVM — no Ganache needed.

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
| **EscrowCore** | Role grants on deploy, job creation + ETH lock, counter increment, assignFreelancer happy path, boundary (zero-ETH revert, non-existent job), security (unauthorized `releasePayment`, unauthorized `markDisputed`, paused state, non-admin pause) |
| **ApplicationFlow** | `applyToJob` happy + emit event + registers applicant, double-apply revert, non-freelancer revert, client-cannot-apply-to-own-job, non-existent job revert, `withdrawApplication` marks and allows reapply, `acceptApplication` transitions job + flags accepted, unauthorized accept revert, withdrawn-cannot-be-accepted revert |
| **MilestoneManager** | `addMilestone` happy + non-client revert + zero amount revert, `submitMilestone` happy + wrong-role revert + empty CID revert, `approveMilestone` releases ETH + wrong state revert, `rejectMilestone` allows resubmission |
| **DisputeResolver** | `openDispute` from client + freelancer, status transition, non-participant revert, duplicate revert, `resolveDispute` splits funds, 100% freelancer path, non-arbiter revert, shares-must-sum-to-100 revert, already-resolved revert |

### Gas report

The `hardhat-gas-reporter` plugin runs automatically with every `npx hardhat test` call and writes a full gas table to `gas-report/gas-report.txt`. A baseline file (`gas-report/baseline.txt`) captures the pre-optimization numbers for the before/after comparison documented in `docs/Technical_Report.docx`.

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
├── docs/
│   └── Technical_Report.docx
├── gas-report/
│   └── baseline.txt
└── hardhat.config.js
```

---

## User Roles

| Role | Can do |
|------|--------|
| **Client** | Post jobs, review applicants, accept one, add milestones, approve/reject work, open disputes, cancel open jobs |
| **Freelancer** | Browse open jobs, apply with a proposal, withdraw applications, upload IPFS deliverables, submit milestones, open disputes |
| **Arbiter** | View open disputes, set resolution split (0–100% client/freelancer), resolve and distribute remaining funds |
| **Admin** (deployer) | Grant arbiter role to any address, pause / unpause all contracts in emergencies |

---

## Security Highlights

- **Reentrancy** — `ReentrancyGuard` on every function that sends ETH, Checks-Effects-Interactions on every path
- **Access control** — OpenZeppelin AccessControl with 4 roles, custom `onlyAuthorizedContract` for inter-contract calls
- **Input validation** — custom errors, 42-char address checks, non-zero amount requires, state-machine guards
- **Emergency pause** — admin can halt every state-changing function
- **Negative tests** — 15+ tests prove unauthorized calls revert with the correct custom error

Full threat model (3 concrete threats + mitigations) lives in `docs/Technical_Report.docx`.

---

## Gas Optimization

| Operation | Baseline | Optimized | Saved |
|-----------|---------:|----------:|------:|
| `createJob` | 199,840 | 190,020 | -4.9% |
| `addMilestone` | 232,110 | 217,784 | -6.2% |
| `approveMilestone` | 118,450 | 104,622 | **-11.7%** |

Two optimizations applied: custom errors replace require strings, and `unchecked` increments on monotonic counters. Trade-offs documented in the technical report.

---

## License

MIT

---

## Author

**Irtaza Zahid** — [@Irtaza1927](https://github.com/Irtaza1927)
Semester 7, FAST-NUCES Islamabad
