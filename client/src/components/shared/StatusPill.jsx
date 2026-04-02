import { getAgentMeta } from "../../lib/agents";

export function StatusPill({ agentId, status }) {
    const meta = getAgentMeta(agentId);
    const active = status === "thinking";

    return (
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                    background: active ? meta.color : "#65748b",
                    boxShadow: active ? `0 0 0.8rem ${meta.color}` : "none",
                }}
            />
            <span className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-200">{meta.label}</span>
            <span className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-400">{status}</span>
        </div>
    );
}
