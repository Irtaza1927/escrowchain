// file: SystemStatus.js
// description: compact system widget showing block height, gas price, and contract addresses.

import React, { useEffect, useState, useCallback } from "react";
import { Server, Copy, Check } from "lucide-react";
import toast from "react-hot-toast";
import EscrowCoreData      from "../contracts/EscrowCore.json";
import MilestoneManagerData from "../contracts/MilestoneManager.json";
import DisputeResolverData  from "../contracts/DisputeResolver.json";

function short(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function SystemStatus({ signer }) {
    const [block, setBlock] = useState(null);
    const [gasPrice, setGasPrice] = useState(null);
    const [copied, setCopied] = useState(null);

    const load = useCallback(async () => {
        if (!signer) return;
        try {
            const p = signer.provider;
            const [bn, feeData] = await Promise.all([p.getBlockNumber(), p.getFeeData()]);
            setBlock(bn);
            setGasPrice(feeData.gasPrice);
        } catch {}
    }, [signer]);

    useEffect(() => {
        load();
        // poll block every 5s, cheap on local Ganache
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, [load]);

    async function copyAddr(label, addr) {
        try {
            await navigator.clipboard.writeText(addr);
            setCopied(label);
            toast.success(`${label} address copied`);
            setTimeout(() => setCopied(null), 1500);
        } catch { toast.error("Copy failed"); }
    }

    function gwei(gp) {
        if (gp == null) return "?";
        try { return (Number(gp) / 1e9).toFixed(2); } catch { return "?"; }
    }

    const items = [
        ["EscrowCore", EscrowCoreData.address],
        ["Milestones", MilestoneManagerData.address],
        ["Disputes",   DisputeResolverData.address],
    ];

    return (
        <div className="widget">
            <div className="widget-head">
                <h4><span className="widget-icon" style={{ background: "linear-gradient(135deg, #4dd0e1, #26a9bd)" }}><Server size={15} /></span> System Status</h4>
            </div>

            <div className="status-row">
                <span className="status-key">Chain</span>
                <span className="status-val">Ganache · 1337</span>
            </div>
            <div className="status-row">
                <span className="status-key">Block</span>
                <span className="status-val">#{block ?? "..."}</span>
            </div>
            <div className="status-row">
                <span className="status-key">Gas price</span>
                <span className="status-val">{gwei(gasPrice)} gwei</span>
            </div>

            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />

            {items.map(([label, addr]) => (
                <div className="status-row" key={label}>
                    <span className="status-key">{label}</span>
                    <button className="btn-ghost btn-sm" onClick={() => copyAddr(label, addr)}>
                        <span className="mono" style={{ fontSize: 11 }}>{short(addr)}</span>
                        {copied === label ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                </div>
            ))}
        </div>
    );
}

export default SystemStatus;
