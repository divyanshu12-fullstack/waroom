import { AnimatePresence, motion } from "framer-motion";
import { getAgentMeta } from "../../lib/agents";
import { timeAgo } from "../../lib/time";
import { GlassCard } from "../shared/GlassCard";

function Entry({ item, index }) {
    const meta = getAgentMeta(item.agentId);

    return (
        <motion.article
            layout
            initial={{ opacity: 0, x: 30, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(index * 0.04, 0.2) }}
            className="group rounded-2xl border border-white/8 bg-[var(--panel-2)]/70 p-4"
            style={{ borderLeft: `3px solid ${meta.color}` }}
        >
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                    className="rounded-full px-2 py-1 text-[0.58rem] uppercase tracking-[0.16em]"
                    style={{ color: meta.color, background: `${meta.color}1d` }}
                >
                    {meta.label}
                </span>
                <span className="text-[0.55rem] uppercase tracking-[0.16em] text-slate-500">{timeAgo(item.timestamp)}</span>
                {item.hasConflict ? (
                    <span className="rounded-full border border-rose-300/40 bg-rose-950/40 px-2 py-1 text-[0.55rem] uppercase tracking-[0.16em] text-rose-200">
                        Conflict
                    </span>
                ) : null}
            </div>

            <p className="mb-3 text-[0.8rem] leading-relaxed text-slate-200/90">{item.reasoning || "Reasoning unavailable"}</p>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
                <p className="mb-1 text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">Decision</p>
                <p className="text-[0.78rem] leading-relaxed text-slate-100">{item.decision || "No decision recorded."}</p>
                <div className="mt-3 h-1.5 rounded-full bg-slate-800">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, Math.min(100, (item.confidence || 0) * 100))}%` }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full"
                        style={{ background: meta.color }}
                    />
                </div>
            </div>
        </motion.article>
    );
}

export function ReasoningTimeline({ reasoningLog, finalBrief, isPaused }) {
    return (
        <GlassCard className="flex h-[34rem] flex-col p-5 lg:p-6" delay={0.12} hover={false}>
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">Live Feed</p>
                    <h2 className="font-heading text-xl text-slate-100">Reasoning Timeline</h2>
                </div>
                {isPaused ? (
                    <span className="rounded-full border border-amber-300/40 bg-amber-900/30 px-3 py-1 text-[0.58rem] uppercase tracking-[0.16em] text-amber-100">
                        Swarm Paused
                    </span>
                ) : null}
            </div>

            <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
                {finalBrief ? (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-emerald-300/30 bg-emerald-950/30 p-4"
                    >
                        <p className="mb-2 text-[0.58rem] uppercase tracking-[0.16em] text-emerald-200">Executive Brief</p>
                        <p className="text-[0.82rem] leading-relaxed text-emerald-50">{finalBrief}</p>
                    </motion.div>
                ) : null}

                <AnimatePresence initial={false}>
                    {reasoningLog.map((item, index) => (
                        <Entry key={item.logId || `${item.agentId}-${item.timestamp}-${index}`} item={item} index={index} />
                    ))}
                </AnimatePresence>

                {reasoningLog.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 p-8 text-center text-slate-400">
                        Launch a scenario to begin streaming multi-agent reasoning.
                    </div>
                ) : null}
            </div>
        </GlassCard>
    );
}
