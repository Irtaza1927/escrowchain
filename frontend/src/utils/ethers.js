// file: ethers.js
// description: utility functions for connecting to metamask and interacting with
// the deployed smart contracts. every component in the app imports from here.
// handles: wallet connection, contract instantiation, account change detection.

import { ethers }          from "ethers";
import EscrowCoreData      from "../contracts/EscrowCore.json";
import MilestoneManagerData from "../contracts/MilestoneManager.json";
import DisputeResolverData  from "../contracts/DisputeResolver.json";

// ganache network parameters for automatic metamask switching
const GANACHE_CHAIN_ID_HEX = "0x539"; // 1337 in decimal

// prompts metamask to switch to ganache, or adds ganache network if not added yet
export async function switchToGanache() {
    if (!window.ethereum) return;
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: GANACHE_CHAIN_ID_HEX }]
        });
    } catch (switchError) {
        // error code 4902 indicates that the chain has not been added to metamask yet
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                        chainId: GANACHE_CHAIN_ID_HEX,
                        chainName: "Ganache Local",
                        rpcUrls: ["http://127.0.0.1:7545"],
                        nativeCurrency: {
                            name: "Ethereum",
                            symbol: "ETH",
                            decimals: 18
                        }
                    }]
                });
            } catch (addError) {
                console.error("failed to add ganache network to metamask", addError);
            }
        }
    }
}

// connects to metamask and returns the signer (the user's wallet)
// also prompts metamask to switch to or add the ganache network automatically
export async function connectWallet() {
    if (!window.ethereum) {
        throw new Error("metamask is not installed. please install it to use this app.");
    }

    // automatically switch to ganache network before requesting accounts
    await switchToGanache();

    // request access to the user's metamask accounts
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const address  = await signer.getAddress();

    return { provider, signer, address };
}

// returns an instance of the EscrowCore contract connected to the user's wallet
export function getEscrowCore(signer) {
    return new ethers.Contract(EscrowCoreData.address, EscrowCoreData.abi, signer);
}

// returns an instance of the MilestoneManager contract connected to the user's wallet
export function getMilestoneManager(signer) {
    return new ethers.Contract(MilestoneManagerData.address, MilestoneManagerData.abi, signer);
}

// returns an instance of the DisputeResolver contract connected to the user's wallet
export function getDisputeResolver(signer) {
    return new ethers.Contract(DisputeResolverData.address, DisputeResolverData.abi, signer);
}

// converts a wei value (BigInt from contract) to a human-readable ETH string
export function formatEth(wei) {
    return ethers.formatEther(wei);
}

// converts an ETH string (like "1.5") to wei BigInt for sending to contracts
export function parseEth(eth) {
    return ethers.parseEther(eth);
}

// maps a job status number (from enum) to a readable string
export function getJobStatusLabel(statusNum) {
    const labels = ["OPEN", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"];
    return labels[statusNum] || "UNKNOWN";
}

// maps a milestone status number to a readable string
export function getMilestoneStatusLabel(statusNum) {
    const labels = ["PENDING", "SUBMITTED", "APPROVED", "REJECTED"];
    return labels[statusNum] || "UNKNOWN";
}

// maps an application status number to a readable string
export function getApplicationStatusLabel(statusNum) {
    const labels = ["NONE", "PENDING", "ACCEPTED", "WITHDRAWN"];
    return labels[statusNum] || "UNKNOWN";
}
