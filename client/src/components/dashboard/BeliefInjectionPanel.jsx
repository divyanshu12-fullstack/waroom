import { motion } from "framer-motion";
import { AGENT_IDS, getAgentMeta } from "../../lib/agents";
import { timeAgo } from "../../lib/time";
import { GlassCard } from "../shared/GlassCard";

export function BeliefInjectionPanel({
    isPaused,
    canInject = true,
    injectionAgent,
    setInjectionAgent,
    injectionInput,
    setInjectionInput,
    submitInjection,
    injections,
}) {
    const injectionEnabled = isPaused && canInject;

    return (
        <GlassCard className="p-5" delay={0.24}>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <p className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">Human Override</p>
                    <h3 className="font-heading text-lg text-slate-100">Inject Belief</h3>
                </div>
                <span
                    className="rounded-full border px-3 py-1 text-[0.56rem] uppercase tracking-[0.16em]"
                    style={{
                        borderColor: injectionEnabled ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 191, 36, 0.35)",
                        color: injectionEnabled ? "#6ee7b7" : "#fcd34d",
                        background: injectionEnabled ? "rgba(6, 78, 59, 0.35)" : "rgba(120, 53, 15, 0.3)",
                    }}
                >
                    {canInject ? (isPaused ? "Injection Enabled" : "Pause to Unlock") : "Unavailable in Backend"}
                </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <select
                    value={injectionAgent}
                    onChange={(event) => setInjectionAgent(event.target.value)}
                    className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-[0.78rem] text-slate-100 outline-none focus:border-sky-400/60"
                >
                    {AGENT_IDS.map((agentId) => {
                        const meta = getAgentMeta(agentId);
                        return (
                            <option key={agentId} value={agentId}>
                                {meta.label}
                            </option>
                        );
                    })}
                </select>

                <input
                    value={injectionInput}
                    onChange={(event) => setInjectionInput(event.target.value)}
                    disabled={!injectionEnabled}
                    className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-[0.78rem] text-slate-100 outline-none focus:border-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Inject guidance, constraints, or a strategic hint..."
                />

                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={submitInjection}
                    disabled={!injectionEnabled || !injectionInput.trim()}
                    className="rounded-xl border border-sky-300/45 bg-sky-900/35 px-4 py-2 text-[0.67rem] font-semibold uppercase tracking-[0.16em] text-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Inject
                </motion.button>
            </div>

            {!canInject ? (
                <p className="mt-3 text-[0.6rem] uppercase tracking-[0.14em] text-amber-300/90">
                    Backend reducer inject_belief is not available in the currently published module.
                </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
                {injections.map((entry) => {
                    const meta = getAgentMeta(entry.agentId);
                    return (
                        <div
                            key={`${entry.timestamp}-${entry.agentId}`}
                            className="rounded-full border px-3 py-1.5 text-[0.6rem]"
                            style={{
                                borderColor: `${meta.color}66`,
                                background: `${meta.color}1f`,
                                color: "#e2e8f0",
                            }}
                            title={entry.text}
                        >
                            {meta.label}: {entry.text.slice(0, 44)} {entry.text.length > 44 ? "..." : ""} ({timeAgo(entry.timestamp)})
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
