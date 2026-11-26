// file: ipfs.js
// description: upload a file off chain and return a CID that gets anchored on chain.
//
// two modes:
//   1) real Pinata mode (preferred). if REACT_APP_PINATA_API_KEY and REACT_APP_PINATA_SECRET_KEY
//      are set in frontend/.env, the file is pinned to the real IPFS network via Pinata.
//   2) local demo mode (fallback). if no Pinata keys are set, the file is kept in the browser's
//      localStorage under a demo CID. this lets the DApp run end to end on a single machine
//      for the semester project demo without any external service dependency.
//
// the CID is what gets written to the smart contract. we store the whole CID string there,
// so a demo CID (prefix "demo-") and a real CID (prefix "Qm" or "bafy") both round trip fine.
//
// to upgrade to real IPFS later, create a free Pinata account at https://pinata.cloud,
// generate an Admin API key, and put the two values in frontend/.env (see .env.example).

import axios from "axios";

const PINATA_API_KEY    = process.env.REACT_APP_PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.REACT_APP_PINATA_SECRET_KEY;
const PINATA_PIN_URL    = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const IPFS_GATEWAY      = "https://gateway.pinata.cloud/ipfs/";

const DEMO_PREFIX    = "demo-";
const DEMO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap for localStorage safety
const LS_PREFIX      = "ipfs:";

// true when Pinata env vars are not set. in that case uploads fall back to local demo mode.
export function isDemoMode() {
    return !PINATA_API_KEY || !PINATA_SECRET_KEY;
}

// uploads a file and returns a CID string that can be stored on chain.
// transparently chooses Pinata or local demo mode.
export async function uploadToIPFS(file) {
    if (!file) throw new Error("No file selected");
    if (isDemoMode()) return uploadToLocalDemo(file);
    return uploadToPinata(file);
}

// resolves a CID back to a URL the browser can open.
// demo CIDs resolve to a data URL kept in localStorage, real CIDs resolve to the Pinata gateway.
export function getIPFSUrl(cid) {
    if (!cid) return "#";
    if (cid.startsWith(DEMO_PREFIX)) {
        try {
            const raw = localStorage.getItem(LS_PREFIX + cid);
            if (!raw) return "#";
            const parsed = JSON.parse(raw);
            return parsed.dataUrl || "#";
        } catch { return "#"; }
    }
    return `${IPFS_GATEWAY}${cid}`;
}

// ===== pinata path =====
async function uploadToPinata(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("pinataMetadata", JSON.stringify({ name: file.name }));

    const response = await axios.post(PINATA_PIN_URL, formData, {
        headers: {
            "Content-Type":          "multipart/form-data",
            "pinata_api_key":        PINATA_API_KEY,
            "pinata_secret_api_key": PINATA_SECRET_KEY
        }
    });
    return response.data.IpfsHash;
}

// ===== local demo path =====
async function uploadToLocalDemo(file) {
    if (file.size > DEMO_MAX_BYTES) {
        throw new Error(
            `Demo mode file limit is 2 MB. This file is ${(file.size / 1024 / 1024).toFixed(2)} MB. ` +
            `Set up Pinata (see .env.example) to upload larger files.`
        );
    }

    // read file as base64 data URL so we can round trip it through localStorage.
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
    });

    // generate a deterministic, CID-looking identifier from the file bytes.
    const bytes   = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
    const hashHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    const cid = `${DEMO_PREFIX}${hashHex.slice(0, 46)}`;

    try {
        const payload = JSON.stringify({
            name:    file.name,
            type:    file.type || "application/octet-stream",
            size:    file.size,
            savedAt: Date.now(),
            dataUrl
        });
        localStorage.setItem(LS_PREFIX + cid, payload);
    } catch {
        throw new Error("Browser storage is full. Clear old demo uploads or switch to Pinata.");
    }

    return cid;
}
