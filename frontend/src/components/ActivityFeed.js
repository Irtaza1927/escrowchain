// file: ActivityFeed.js
// description: live feed widget that shows the newest events across all contracts.

import React, { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { fetchRecentActivity, ACTIVITY_META, activityDetail } from "../utils/recentActivity";

function ActivityFeed({ signer, refreshKey = 0 }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const evs = await fetchRecentActivity(signer, 10);
        setEvents(evs);
        setLoading(false);
    }, [signer]);

    useEffect(() => { load(); }, [load, refreshKey]);

    return (
        <div className="widget">
            <div className="widget-head">
                <h4><span className="widget-icon"><Activity size={15} /></span> Live Activity</h4>
                <button className="btn-ghost btn-icon" onClick={load} title="Refresh" disabled={loading}>
                    <RefreshCw size={13} className={loading ? "spin-slow" : ""} />
                </button>
            </div>

            {loading && events.length === 0 && (
                <div className="muted small" style={{ padding: "12px 0" }}>Loading recent events...</div>
            )}

            {!loading && events.length === 0 && (
                <div className="muted small" style={{ padding: "12px 0" }}>No activity yet. Actions will appear here as they happen.</div>
            )}

            {events.map((ev, i) => {
                const meta = ACTIVITY_META[ev.type] || { label: ev.name, color: "#7d7465" };
                return (
                    <div key={`${ev.txHash}-${i}`} className="feed-item fade-in">
                        <span className="feed-dot" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                        <div className="feed-body">
                            <div className="feed-label">{meta.label}</div>
                            <div className="feed-meta">{activityDetail(ev)}</div>
                            <div className="feed-meta mono" style={{ fontSize: 10.5 }}>block {ev.blockNumber}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default ActivityFeed;
