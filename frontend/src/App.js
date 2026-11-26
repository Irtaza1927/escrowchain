// file: App.js
// description: root react component. handles wallet connection, role detection, network check,
// sidebar navigation state, and routing to the correct dashboard based on user role.

import React, { useState, useEffect, useCallback } from "react";
import {
    Shield, Lock, FileCheck2, Scale, Users, Rocket, ArrowRight, UserPlus, Hammer, Wallet
} from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { connectWallet, getEscrowCore } from "./utils/ethers";
import { registerAccount } from "./utils/accountRegistry";
import ClientDashboard     from "./pages/ClientDashboard";
import FreelancerDashboard from "./pages/FreelancerDashboard";
import ArbiterPanel        from "./pages/ArbiterPanel";
import Navbar              from "./components/Navbar";
import InfoBanner          from "./components/InfoBanner";

// nav items per role for the top pill bar (keys match section ids in the pages)
function navForRole(role, isAdmin) {
    if (role === "client") return [
        { key: "overview", label: "Overview" },
        { key: "create",   label: "Post Job" },
        { key: "jobs",     label: "My Jobs" },
    ];
    if (role === "freelancer") return [
        { key: "overview",     label: "Overview" },
        { key: "browse",       label: "Browse Jobs" },
        { key: "applications", label: "Applications" },
        { key: "jobs",         label: "My Work" },
    ];
    if (role === "arbiter") {
        const items = [
            { key: "overview", label: "Overview" },
            { key: "split",    label: "Split" },
            { key: "open",     label: "Disputes" },
            { key: "resolved", label: "History" },
        ];
        if (isAdmin) items.push({ key: "admin", label: "Admin" });
        return items;
    }
    return [];
}

const GANACHE_CHAIN_ID = "0x539"; // 1337

const TITLES = {
    client:     { title: "Client Dashboard",     subtitle: "Create jobs, manage milestones, approve work." },
    freelancer: { title: "Freelancer Dashboard", subtitle: "Submit deliverables, earn on milestone approval." },
    arbiter:    { title: "Arbiter Panel",        subtitle: "Resolve disputes by setting a transparent fund split." },
};

// DEFAULT_ADMIN_ROLE in OpenZeppelin AccessControl is bytes32(0)
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

function App() {
    const [account,       setAccount]       = useState(null);
    const [signer,        setSigner]        = useState(null);
    const [role,          setRole]          = useState(null);
    const [isAdmin,       setIsAdmin]       = useState(false);
    const [loading,       setLoading]       = useState(false);
    const [networkOk,     setNetworkOk]     = useState(true);
    const [activeSection, setActiveSection] = useState("overview");
    const [sidebarOpen,   setSidebarOpen]   = useState(true);
    const [ethBalance,    setEthBalance]    = useState(null);
    const [roleScore,     setRoleScore]     = useState(null);

    const detectRole = useCallback(async (addr, sign) => {
        const contract = getEscrowCore(sign);
        // detect admin separately so admin can see Admin Tools even if only arbiter role.
        try {
            const adminFlag = await contract.hasRole(DEFAULT_ADMIN_ROLE, addr);
            setIsAdmin(Boolean(adminFlag));
        } catch { setIsAdmin(false); }
        if (await contract.isArbiter(addr))    return "arbiter";
        if (await contract.isClient(addr))     return "client";
        if (await contract.isFreelancer(addr)) return "freelancer";
        return null;
    }, []);

    const checkNetwork = useCallback(async () => {
        if (!window.ethereum) return false;
        try {
            const chainId = await window.ethereum.request({ method: "eth_chainId" });
            const ok = chainId?.toLowerCase() === GANACHE_CHAIN_ID;
            setNetworkOk(ok);
            return ok;
        } catch { setNetworkOk(false); return false; }
    }, []);

    // reads wallet ETH balance and a simple role-activity count for the HUD counters.
    const refreshCounters = useCallback(async (addr, sign, roleName) => {
        try {
            const bal = await sign.provider.getBalance(addr);
            setEthBalance(ethers.formatEther(bal));
        } catch { setEthBalance(null); }
        try {
            const esc = getEscrowCore(sign);
            if (roleName === "arbiter") {
                const dispRes = await import("./utils/ethers");
                const dr = dispRes.getDisputeResolver(sign);
                setRoleScore(Number(await dr.getTotalDisputes()));
            } else if (roleName === "freelancer") {
                const list = await esc.getFreelancerJobsApplied(addr);
                setRoleScore(list.length);
            } else if (roleName === "client") {
                const total = Number(await esc.getTotalJobs());
                let mine = 0;
                for (let i = 1; i <= total; i++) {
                    try {
                        const j = await esc.getJob(i);
                        if (j.client.toLowerCase() === addr.toLowerCase()) mine++;
                    } catch {}
                }
                setRoleScore(mine);
            } else {
                setRoleScore(0);
            }
        } catch { setRoleScore(null); }
    }, []);

    async function handleConnect() {
        setLoading(true);
        try {
            const { signer: s, address } = await connectWallet();
            setSigner(s);
            setAccount(address);
            await checkNetwork();
            toast.success("Wallet connected");
            const detectedRole = await detectRole(address, s);
            setRole(detectedRole);
            setActiveSection("overview");
            registerAccount(address, detectedRole);
            await refreshCounters(address, s, detectedRole);
            if (detectedRole) toast.success(`Signed in as ${detectedRole}`);
        } catch (err) {
            toast.error(err.message || "Failed to connect wallet");
        }
        setLoading(false);
    }

    // triggers MetaMask's account chooser without leaving the app.
    async function handleSwitchAccount() {
        if (!window.ethereum) return;
        try {
            await window.ethereum.request({
                method: "wallet_requestPermissions",
                params: [{ eth_accounts: {} }],
            });
            // after a new account is selected, re-run the full connect flow
            // so signer, role, and section state refresh together.
            await handleConnect();
        } catch (err) {
            if (err?.code === 4001) toast("Account switch cancelled", { icon: "ℹ️" });
            else toast.error(err.message || "Could not switch account");
        }
    }

    function handleDisconnect() {
        setAccount(null);
        setSigner(null);
        setRole(null);
        setIsAdmin(false);
        setActiveSection("overview");
        setEthBalance(null);
        setRoleScore(null);
        toast("Disconnected", { icon: "🔌" });
    }

    async function handleRegisterClient() {
        if (!signer) return;
        setLoading(true);
        const tid = toast.loading("Registering as client...");
        try {
            const contract = getEscrowCore(signer);
            const tx = await contract.registerAsClient();
            await tx.wait();
            setRole("client");
            setActiveSection("overview");
            registerAccount(account, "client");
            toast.success("Registered as client", { id: tid });
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Registration failed", { id: tid });
        }
        setLoading(false);
    }

    async function handleRegisterFreelancer() {
        if (!signer) return;
        setLoading(true);
        const tid = toast.loading("Registering as freelancer...");
        try {
            const contract = getEscrowCore(signer);
            const tx = await contract.registerAsFreelancer();
            await tx.wait();
            setRole("freelancer");
            setActiveSection("overview");
            registerAccount(account, "freelancer");
            toast.success("Registered as freelancer", { id: tid });
        } catch (err) {
            toast.error(err.reason || err.shortMessage || err.message || "Registration failed", { id: tid });
        }
        setLoading(false);
    }

    useEffect(() => {
        if (!window.ethereum) return;
        const onAccountsChanged = (accs) => {
            if (!accs || accs.length === 0) { handleDisconnect(); return; }
            setAccount(null); setSigner(null); setRole(null);
            toast("Account changed, reconnecting", { icon: "🔄" });
        };
        const onChainChanged = () => {
            checkNetwork();
            toast("Network changed", { icon: "🔗" });
        };
        window.ethereum.on("accountsChanged", onAccountsChanged);
        window.ethereum.on("chainChanged", onChainChanged);
        return () => {
            window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
            window.ethereum.removeListener?.("chainChanged", onChainChanged);
        };
    }, [checkNetwork]);

    function navigateTo(section) {
        setActiveSection(section);
        // scroll to section after a tick to let re-renders settle.
        setTimeout(() => {
            const el = document.getElementById(`sec-${section}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            else window.scrollTo({ top: 0, behavior: "smooth" });
        }, 60);
    }

    function goHome() {
        navigateTo("overview");
    }

    function renderLanding() {
        return (
            <div className="fade-in">
                <section className="hero">
                    <span className="hero-eyebrow"><Shield size={13} /> Trustless on-chain escrow</span>
                    <h1>Freelance payments, settled by smart contracts.</h1>
                    <p>
                        Clients lock ETH in escrow. Freelancers deliver work to IPFS. Payments release
                        automatically on approval. If there is a dispute, a neutral arbiter decides the split.
                    </p>
                    <button className="btn-primary btn-xl" onClick={handleConnect} disabled={loading}>
                        {loading
                            ? <><span className="spinner" /> Connecting MetaMask</>
                            : <>Connect MetaMask <ArrowRight size={17} /></>}
                    </button>
                </section>

                <section className="features">
                    <div className="feature">
                        <div className="feature-icon"><Lock size={18} /></div>
                        <h4>Funds locked in escrow</h4>
                        <p>ETH is held by the smart contract. Neither party can touch it until a milestone is approved.</p>
                    </div>
                    <div className="feature">
                        <div className="feature-icon"><FileCheck2 size={18} /></div>
                        <h4>IPFS backed deliverables</h4>
                        <p>Every submission is pinned to IPFS and anchored by hash on chain, so proof of delivery is tamper proof.</p>
                    </div>
                    <div className="feature">
                        <div className="feature-icon"><Scale size={18} /></div>
                        <h4>Neutral dispute resolution</h4>
                        <p>Stuck on a milestone? An arbiter resolves with a transparent on-chain percentage split.</p>
                    </div>
                    <div className="feature">
                        <div className="feature-icon"><Users size={18} /></div>
                        <h4>Role based access</h4>
                        <p>Client, Freelancer and Arbiter actions are gated by on-chain roles. No admin backdoors.</p>
                    </div>
                </section>
            </div>
        );
    }

    function renderRegister() {
        return (
            <div className="container-sm fade-in">
                <div className="panel" style={{ textAlign: "center" }}>
                    <div className="feature-icon" style={{ margin: "0 auto 16px" }}>
                        <Rocket size={22} />
                    </div>
                    <h2 style={{ marginBottom: 8 }}>Pick your role</h2>
                    <p className="muted mb-lg">
                        Your wallet is connected, but not yet registered. Choose how you want to use EscrowChain.
                    </p>
                    <button className="btn-primary btn-full btn-lg" onClick={handleRegisterClient} disabled={loading}>
                        {loading ? <span className="spinner" /> : <UserPlus size={16} />} Register as Client
                    </button>
                    <div className="spacer-sm" />
                    <button className="btn-secondary btn-full btn-lg" onClick={handleRegisterFreelancer} disabled={loading}>
                        {loading ? <span className="spinner" /> : <UserPlus size={16} />} Register as Freelancer
                    </button>
                    <p className="small muted" style={{ marginTop: 18 }}>
                        Arbiters are set by contract admin. They do not self register.
                    </p>
                </div>
            </div>
        );
    }

    function renderNetworkMismatch() {
        return (
            <div className="container-sm fade-in">
                <div className="panel" style={{ textAlign: "center" }}>
                    <div className="feature-icon" style={{ margin: "0 auto 16px", background: "rgba(244,63,94,0.12)", color: "#fda4af" }}>
                        <Shield size={22} />
                    </div>
                    <h2>Wrong Network</h2>
                    <p className="muted mt-sm mb">Please switch MetaMask to <strong>Ganache Local</strong> (chain id 1337).</p>
                    <button className="btn-primary" onClick={handleConnect}>Switch Network</button>
                </div>
            </div>
        );
    }

    function renderMain() {
        if (!account)      return renderLanding();
        if (!networkOk)    return renderNetworkMismatch();
        if (!role)         return renderRegister();
        if (role === "client")
            return <ClientDashboard     signer={signer} account={account}
                       activeSection={activeSection} onNavigate={navigateTo}
                       onSwitchAccount={handleSwitchAccount} />;
        if (role === "freelancer")
            return <FreelancerDashboard signer={signer} account={account}
                       activeSection={activeSection} onNavigate={navigateTo}
                       onSwitchAccount={handleSwitchAccount} />;
        if (role === "arbiter")
            return <ArbiterPanel        signer={signer} account={account} isAdmin={isAdmin}
                       activeSection={activeSection} onNavigate={navigateTo}
                       onSwitchAccount={handleSwitchAccount} />;
    }

    const headerInfo = account && role ? TITLES[role] : {};

    const navItems = account && role ? navForRole(role, isAdmin) : [];

    return (
        <div className="app-shell">
            <div className="app-main">
                <Navbar
                    account={account}
                    role={role}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onSwitchAccount={account ? handleSwitchAccount : null}
                    onHome={account && role ? goHome : null}
                    loading={loading}
                    networkOk={networkOk}
                    title={headerInfo.title}
                    subtitle={headerInfo.subtitle}
                    ethBalance={ethBalance}
                    roleScore={roleScore}
                    navItems={navItems}
                    activeSection={activeSection}
                    onNavigate={navigateTo}
                />
                {account && role && <div className="container" style={{ paddingTop: 20, paddingBottom: 0 }}><InfoBanner /></div>}
                {renderMain()}
            </div>
        </div>
    );
}

export default App;
