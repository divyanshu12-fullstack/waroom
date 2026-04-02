import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENT_IDS, getAgentMeta } from "../../lib/agents";
import { timeAgo } from "../../lib/time";
import { GlassCard } from "../shared/GlassCard";

function MemoryCard({ item, index }) {
    const meta = getAgentMeta(item.sourceAgent || item.agentId);
    const confidence = Math.max(0, Math.min(1, Number(item.confidence || 0)));
    const highlighted = confidence >= 0.85;

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, delay: Math.min(index * 0.02, 0.16) }}
            className="rounded-2xl border border-white/10 bg-[var(--panel-2)]/75 p-4"
            style={{ borderLeft: `3px solid ${meta.color}` }}
        >
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2 py-1 text-[0.56rem] uppercase tracking-[0.15em]" style={{ background: `${meta.color}23`, color: meta.color }}>
                    {meta.label}
                </span>
                <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1 text-[0.54rem] uppercase tracking-[0.16em] text-slate-400">
                    {item.source === "mem0" ? "Long-term" : "Session"}
                </span>
                <span className="rounded-full border border-emerald-300/25 bg-emerald-950/25 px-2 py-1 text-[0.54rem] uppercase tracking-[0.16em] text-emerald-100">
                    {Math.round(confidence * 100)}%
                </span>
                <span className="ml-auto text-[0.55rem] uppercase tracking-[0.16em] text-slate-500">{timeAgo(item.timestamp)}</span>
            </div>

            <p className="mb-2 text-[0.74rem] uppercase tracking-[0.16em] text-slate-500">{item.pattern || "Unlabeled pattern"}</p>
            <p className="text-[0.79rem] leading-relaxed text-slate-100/95">{item.insight || item.decision || "No memory content"}</p>
            {item.predictedOutcome ? (
                <p className="mt-2 rounded-lg border border-slate-700/65 bg-slate-950/65 px-3 py-2 text-[0.72rem] text-slate-300">
                    Predicted outcome: {item.predictedOutcome}
                </p>
            ) : null}
            {highlighted ? (
                <p className="mt-2 text-[0.58rem] uppercase tracking-[0.16em] text-emerald-200">Active Recall Candidate</p>
            ) : null}
        </motion.article>
    );
}

export function MemoryStudio({ structuredMemories, mem0Memories, memoriesLoading, refreshMem0Memories }) {
    const [sourceFilter, setSourceFilter] = useState("all");
    const [agentFilter, setAgentFilter] = useState("all");

    const unified = useMemo(() => {
        const records = [...structuredMemories, ...mem0Memories].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        return records;
    }, [structuredMemories, mem0Memories]);

    const filtered = useMemo(() => {
        return unified.filter((entry) => {
            const sourceMatch = sourceFilter === "all" || entry.source === sourceFilter;
            const agentMatch = agentFilter === "all" || (entry.sourceAgent || entry.agentId) === agentFilter;
            return sourceMatch && agentMatch;
        });
    }, [agentFilter, sourceFilter, unified]);

    const activeRecall = filtered.filter((entry) => Number(entry.confidence || 0) >= 0.85).length;

    const perAgentCount = useMemo(
        () =>
            Object.fromEntries(
                AGENT_IDS.map((agentId) => [
                    agentId,
                    unified.filter((entry) => (entry.sourceAgent || entry.agentId) === agentId).length,
                ]),
            ),
        [unified],
    );

    const maxCount = Math.max(1, ...Object.values(perAgentCount));

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
                <GlassCard className="p-4" delay={0.05}>
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Total Memories</p>
                    <p className="font-heading text-2xl text-slate-100">{unified.length}</p>
                </GlassCard>
                <GlassCard className="p-4" delay={0.09}>
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Session</p>
                    <p className="font-heading text-2xl text-sky-200">{structuredMemories.length}</p>
                </GlassCard>
                <GlassCard className="p-4" delay={0.13}>
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Long-term</p>
                    <p className="font-heading text-2xl text-amber-200">{mem0Memories.length}</p>
                </GlassCard>
                <GlassCard className="p-4" delay={0.17}>
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Active Recall</p>
                    <p className="font-heading text-2xl text-emerald-200">{activeRecall}</p>
                </GlassCard>
            </div>

            <GlassCard className="p-5" delay={0.2}>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                    <div>
                        <p className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Memory Studio</p>
                        <h2 className="font-heading text-xl text-slate-100">Swarm Brain</h2>
                    </div>
                    <select
                        value={sourceFilter}
                        onChange={(event) => setSourceFilter(event.target.value)}
                        className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-[0.72rem] text-slate-100"
                    >
                        <option value="all">All Sources</option>
                        <option value="session">Session Only</option>
                        <option value="mem0">Long-term Only</option>
                    </select>
                    <select
                        value={agentFilter}
                        onChange={(event) => setAgentFilter(event.target.value)}
                        className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-[0.72rem] text-slate-100"
                    >
                        <option value="all">All Agents</option>
                        {AGENT_IDS.map((agentId) => (
                            <option key={agentId} value={agentId}>
                                {getAgentMeta(agentId).label}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={refreshMem0Memories}
                        className="ml-auto rounded-xl border border-sky-300/45 bg-sky-900/35 px-3 py-2 text-[0.67rem] uppercase tracking-[0.16em] text-sky-100"
                    >
                        {memoriesLoading ? "Refreshing..." : "Refresh Mem0"}
                    </button>
                </div>

                <div className="mb-4 grid gap-2 md:grid-cols-3">
                    {AGENT_IDS.map((agentId) => {
                        const meta = getAgentMeta(agentId);
                        const width = `${Math.round((perAgentCount[agentId] / maxCount) * 100)}%`;
                        return (
                            <div key={agentId} className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                                <p className="mb-2 text-[0.56rem] uppercase tracking-[0.16em] text-slate-400">{meta.label}</p>
                                <div className="h-2 rounded-full bg-slate-800">
                                    <div className="h-2 rounded-full" style={{ width, background: meta.color }} />
                                </div>
                                <p className="mt-1 text-[0.64rem] text-slate-500">{perAgentCount[agentId]} memories</p>
                            </div>
                        );
                    })}
                </div>

                <div className="max-h-[40rem] space-y-3 overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                        {filtered.map((item, index) => (
                            <MemoryCard key={`${item.source}-${item.id || item.timestamp}-${index}`} item={item} index={index} />
                        ))}
                    </AnimatePresence>
                </div>
            </GlassCard>
        </div>
    );
}
