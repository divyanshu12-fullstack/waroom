import { motion } from "framer-motion";
import { AGENT_IDS, getAgentMeta } from "../../lib/agents";
import { GlassCard } from "../shared/GlassCard";

function DecisionSnippet({ agentId, item }) {
    const meta = getAgentMeta(agentId);
    return (
        <div className="rounded-xl border border-white/8 bg-slate-950/35 p-3" style={{ borderLeft: `3px solid ${meta.color}` }}>
            <p className="mb-1 text-[0.56rem] uppercase tracking-[0.16em]" style={{ color: meta.color }}>
                {meta.label}
            </p>
            <p className="line-clamp-3 text-[0.74rem] leading-relaxed text-slate-200/95">{item?.decision || "No decision yet."}</p>
        </div>
    );
}

export function InsightsRail({ latestByAgent, crisis, totalConflicts, avgConfidence, structuredMemories }) {
    return (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <GlassCard className="p-5" delay={0.16}>
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-heading text-lg text-slate-100">Session Intelligence Brief</h3>
                    <span className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-400">Realtime Summary</span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <p className="text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Findings</p>
                        <p className="font-heading text-xl text-slate-100">{structuredMemories.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <p className="text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Conflicts</p>
                        <p className="font-heading text-xl text-rose-200">{totalConflicts}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <p className="text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Avg Confidence</p>
                        <p className="font-heading text-xl text-sky-200">{Math.round(avgConfidence * 100)}%</p>
                    </div>
                </div>

                <p className="mb-3 text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Current Crisis</p>
                <p className="rounded-xl border border-slate-700/70 bg-slate-950/65 px-3 py-2 text-[0.76rem] leading-relaxed text-slate-200">
                    {crisis}
                </p>
            </GlassCard>

            <GlassCard className="p-5" delay={0.2}>
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-heading text-lg text-slate-100">Latest Agent Decisions</h3>
                </div>
                <div className="space-y-2.5">
                    {AGENT_IDS.map((agentId) => (
                        <motion.div key={agentId} layout>
                            <DecisionSnippet agentId={agentId} item={latestByAgent[agentId]} />
                        </motion.div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
}
