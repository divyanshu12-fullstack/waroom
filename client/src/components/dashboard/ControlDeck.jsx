import { motion } from "framer-motion";
import { AGENT_IDS } from "../../lib/agents";
import { formatDuration } from "../../lib/time";
import { ModeBanner } from "../shared/ModeBanner";
import { StatusPill } from "../shared/StatusPill";

export function ControlDeck({
    mode,
    capabilities,
    agents,
    crisis,
    launchDraft,
    setLaunchDraft,
    sessionSeconds,
    isSwarmActive,
    isPaused,
    onLaunch,
    onReset,
    onTogglePause,
}) {
    const canResetSession = capabilities?.canResetSession ?? true;
    const canPause = capabilities?.canPause ?? true;
    const canLaunch = capabilities?.canLaunch ?? true;

    return (
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-5 backdrop-blur-xl lg:p-6">
            <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.23),rgba(56,189,248,0))]" />
            <div className="pointer-events-none absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.2),rgba(245,158,11,0))]" />

            <div className="relative grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <div>
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <p className="font-heading text-2xl leading-none text-slate-100 lg:text-3xl">WARROOM</p>
                        <span className="rounded-full border border-slate-700/60 bg-slate-900/65 px-3 py-1 text-[0.58rem] uppercase tracking-[0.18em] text-slate-300">
                            Session {formatDuration(sessionSeconds)}
                        </span>
                        <ModeBanner mode={mode} />
                    </div>

                    <p className="mb-3 text-[0.62rem] uppercase tracking-[0.18em] text-slate-400">Crisis Prompt</p>
                    <textarea
                        value={launchDraft}
                        onChange={(event) => setLaunchDraft(event.target.value)}
                        className="h-28 w-full resize-none rounded-2xl border border-slate-700/70 bg-slate-950/70 px-4 py-3 text-[0.88rem] leading-relaxed text-slate-100 outline-none transition focus:border-sky-400/60"
                        placeholder="Describe the crisis to launch a new swarm analysis cycle."
                    />
                    <p className="mt-2 line-clamp-1 text-[0.68rem] text-slate-500">Active context: {crisis}</p>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2.5">
                        {AGENT_IDS.map((agentId) => (
                            <StatusPill
                                key={agentId}
                                agentId={agentId}
                                status={agents.find((row) => row.agentId === agentId)?.status || "idle"}
                            />
                        ))}
                    </div>

                    <div className="mt-auto grid gap-2 sm:grid-cols-3">
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={onReset}
                            disabled={!canResetSession}
                            className="rounded-xl border border-rose-300/40 bg-rose-950/40 px-3 py-2 text-[0.67rem] font-semibold uppercase tracking-[0.16em] text-rose-100"
                        >
                            Reset Session
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={onTogglePause}
                            disabled={!canPause}
                            className="rounded-xl border border-amber-300/40 bg-amber-950/35 px-3 py-2 text-[0.67rem] font-semibold uppercase tracking-[0.16em] text-amber-100"
                        >
                            {isPaused ? "Resume" : "Pause"}
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={onLaunch}
                            disabled={!canLaunch}
                            className="rounded-xl border border-sky-300/50 bg-sky-900/40 px-3 py-2 text-[0.67rem] font-semibold uppercase tracking-[0.16em] text-sky-100"
                        >
                            {isSwarmActive ? "Relaunch" : "Launch Swarm"}
                        </motion.button>
                    </div>

                    {(!canResetSession || !canPause || !canLaunch) ? (
                        <p className="mt-2 text-[0.6rem] uppercase tracking-[0.14em] text-amber-300/90">
                            Some controls are unavailable because the current backend module does not expose those reducers.
                        </p>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
