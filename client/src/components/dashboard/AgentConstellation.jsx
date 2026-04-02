import { useMemo } from "react";
import { motion } from "framer-motion";
import { AGENT_IDS, getAgentMeta } from "../../lib/agents";
import { GlassCard } from "../shared/GlassCard";

const CENTER = { x: 210, y: 176 };

const POSITIONS = {
    scout: { x: 210, y: 78 },
    strategist: { x: 92, y: 276 },
    devils_advocate: { x: 328, y: 276 },
};

const LINKS = [
    { id: "scout-strategist", from: "scout", to: "strategist", bend: 28 },
    { id: "scout-devils", from: "scout", to: "devils_advocate", bend: -28 },
    { id: "strategist-devils", from: "strategist", to: "devils_advocate", bend: -22 },
];

function curvedPath(from, to, bend) {
    const start = POSITIONS[from];
    const end = POSITIONS[to];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const cx = (start.x + end.x) / 2 + nx * bend;
    const cy = (start.y + end.y) / 2 + ny * bend;
    return `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
}

function Metric({ label, value, accent }) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-[0.54rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="font-heading text-lg" style={{ color: accent }}>
                {value}
            </p>
        </div>
    );
}

export function AgentConstellation({ agents, reasoningLog, agentMessages }) {
    const now = Date.now() / 1000;
    const latestDevils = reasoningLog.find((entry) => entry.agentId === "devils_advocate");
    const hasConflict = Boolean(latestDevils?.hasConflict);

    const recentMessages = agentMessages.filter((msg) => {
        const age = now - Number(msg.sentAt || 0);
        return age <= 22;
    });

    const byId = Object.fromEntries(agents.map((agent) => [agent.agentId, agent]));

    const flows = useMemo(() => {
        const map = {};
        for (const msg of recentMessages) {
            const from = String(msg.fromAgent || "");
            const to = String(msg.toAgent || "");
            if (!POSITIONS[from] || !POSITIONS[to]) {
                continue;
            }
            const key = `${from}->${to}`;
            map[key] = (map[key] || 0) + 1;
        }
        return map;
    }, [recentMessages]);

    const linkStats = LINKS.map((link) => {
        const forward = flows[`${link.from}->${link.to}`] || 0;
        const reverse = flows[`${link.to}->${link.from}`] || 0;
        const total = forward + reverse;
        return {
            ...link,
            forward,
            reverse,
            total,
            pathForward: curvedPath(link.from, link.to, link.bend),
            pathReverse: curvedPath(link.to, link.from, -link.bend),
        };
    });

    const activeAgents = agents.filter((agent) => agent.status === "thinking" || agent.status === "waiting").length;
    const recentReasoning = reasoningLog.slice(0, 12);
    const disagreement = recentReasoning.length
        ? Math.round((recentReasoning.filter((entry) => entry.hasConflict).length / recentReasoning.length) * 100)
        : 0;

    return (
        <GlassCard className="relative overflow-hidden p-5 lg:p-6" delay={0.08}>
            <div className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.22),rgba(56,189,248,0))]" />
            <div className="pointer-events-none absolute -left-16 bottom-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.18),rgba(245,158,11,0))]" />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">Agent Constellation</p>
                    <h2 className="font-heading text-xl text-slate-100">Signal Topology Matrix</h2>
                </div>
                <div
                    className="rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em]"
                    style={{
                        borderColor: hasConflict ? "rgba(248, 113, 113, 0.45)" : "rgba(125, 211, 252, 0.42)",
                        color: hasConflict ? "#fca5a5" : "#bae6fd",
                        background: hasConflict ? "rgba(127, 29, 29, 0.3)" : "rgba(7, 89, 133, 0.26)",
                    }}
                >
                    {hasConflict ? "Adversarial State" : "Consensus Stable"}
                </div>
            </div>

            <svg viewBox="0 0 420 360" className="h-[340px] w-full">
                <defs>
                    <radialGradient id="grid-fade" cx="50%" cy="46%" r="56%">
                        <stop offset="0%" stopColor="rgba(96,165,250,0.14)" />
                        <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                    </radialGradient>

                    <linearGradient id="link-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7dd3fc" />
                        <stop offset="100%" stopColor="#fda4af" />
                    </linearGradient>

                    <marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse">
                        <path d="M 0 0 L 9 4.5 L 0 9 z" fill="rgba(186,230,253,0.85)" />
                    </marker>

                    {AGENT_IDS.map((agentId) => {
                        const meta = getAgentMeta(agentId);
                        return (
                            <filter key={agentId} id={`node-glow-${agentId}`} x="-60%" y="-60%" width="220%" height="220%">
                                <feGaussianBlur stdDeviation="6" result="blur" />
                                <feFlood floodColor={meta.color} floodOpacity="0.42" result="flood" />
                                <feComposite in="flood" in2="blur" operator="in" result="shadow" />
                                <feMerge>
                                    <feMergeNode in="shadow" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        );
                    })}

                    {linkStats.map((link) => (
                        <g key={link.id}>
                            <path id={`flow-${link.id}-f`} d={link.pathForward} fill="none" />
                            <path id={`flow-${link.id}-r`} d={link.pathReverse} fill="none" />
                        </g>
                    ))}
                </defs>

                <rect x="0" y="0" width="420" height="360" fill="url(#grid-fade)" />

                <circle cx={CENTER.x} cy={CENTER.y} r="132" fill="none" stroke="rgba(148,163,184,0.16)" strokeDasharray="3 8" />
                <circle cx={CENTER.x} cy={CENTER.y} r="94" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="2 10" />

                {linkStats.map((link) => {
                    const conflictLink = hasConflict && link.id === "strategist-devils";
                    return (
                        <g key={`lane-${link.id}`}>
                            <path
                                d={link.pathForward}
                                fill="none"
                                stroke={conflictLink ? "rgba(251,113,133,0.65)" : "rgba(71,85,105,0.72)"}
                                strokeWidth={1.6}
                            />

                            {link.total > 0 ? (
                                <path
                                    d={link.pathForward}
                                    fill="none"
                                    stroke={conflictLink ? "rgba(251,113,133,0.92)" : "url(#link-gradient)"}
                                    strokeWidth={2.8}
                                    strokeDasharray="6 7"
                                    markerEnd="url(#flow-arrow)"
                                    opacity={0.95}
                                >
                                    <animate
                                        attributeName="stroke-dashoffset"
                                        from="26"
                                        to="0"
                                        dur="1.2s"
                                        repeatCount="indefinite"
                                    />
                                </path>
                            ) : null}

                            {link.forward > 0 ? (
                                <circle r="3.2" fill="rgba(186,230,253,0.96)">
                                    <animateMotion
                                        dur={`${Math.max(1.2, 2.8 - Math.min(link.forward, 4) * 0.25)}s`}
                                        repeatCount="indefinite"
                                    >
                                        <mpath href={`#flow-${link.id}-f`} />
                                    </animateMotion>
                                </circle>
                            ) : null}

                            {link.reverse > 0 ? (
                                <circle r="3" fill="rgba(251,191,36,0.95)">
                                    <animateMotion
                                        dur={`${Math.max(1.3, 3 - Math.min(link.reverse, 4) * 0.25)}s`}
                                        repeatCount="indefinite"
                                    >
                                        <mpath href={`#flow-${link.id}-r`} />
                                    </animateMotion>
                                </circle>
                            ) : null}
                        </g>
                    );
                })}

                {AGENT_IDS.map((agentId) => {
                    const meta = getAgentMeta(agentId);
                    const point = POSITIONS[agentId];
                    const row = byId[agentId];
                    const isThinking = row?.status === "thinking";
                    const isWaiting = row?.status === "waiting";
                    const confidence = Math.round((row?.confidence || 0) * 100);

                    return (
                        <g key={agentId} filter={`url(#node-glow-${agentId})`}>
                            <circle cx={point.x} cy={point.y} r={isThinking ? 46 : 40} fill="rgba(3, 10, 24, 0.86)" stroke={meta.color} strokeWidth={2.2} />

                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={isThinking ? 54 : 49}
                                fill="none"
                                stroke={meta.color}
                                strokeOpacity={isThinking ? 0.85 : 0.34}
                                strokeWidth="1.8"
                                strokeDasharray="5 6"
                            >
                                {isThinking ? (
                                    <animateTransform
                                        attributeName="transform"
                                        type="rotate"
                                        from={`0 ${point.x} ${point.y}`}
                                        to={`360 ${point.x} ${point.y}`}
                                        dur="5.5s"
                                        repeatCount="indefinite"
                                    />
                                ) : null}
                            </circle>

                            <text
                                x={point.x}
                                y={point.y - 8}
                                fill={meta.color}
                                textAnchor="middle"
                                fontSize="16"
                                fontFamily="'Sora', sans-serif"
                                fontWeight="700"
                                letterSpacing="1"
                            >
                                {meta.icon}
                            </text>

                            <text
                                x={point.x}
                                y={point.y + 15}
                                fill="#dbeafe"
                                textAnchor="middle"
                                fontSize="10"
                                fontFamily="'JetBrains Mono', monospace"
                                letterSpacing="1"
                            >
                                {confidence > 0 ? `${confidence}%` : "--"}
                            </text>

                            <rect
                                x={point.x - 28}
                                y={point.y - 72}
                                width="56"
                                height="16"
                                rx="8"
                                fill={isThinking ? "rgba(8, 145, 178, 0.3)" : isWaiting ? "rgba(180, 83, 9, 0.3)" : "rgba(30,41,59,0.5)"}
                                stroke={isThinking ? "rgba(103,232,249,0.6)" : isWaiting ? "rgba(251,191,36,0.6)" : "rgba(148,163,184,0.35)"}
                            />
                            <text
                                x={point.x}
                                y={point.y - 60}
                                fill={isThinking ? "#cffafe" : isWaiting ? "#fde68a" : "#cbd5e1"}
                                textAnchor="middle"
                                fontSize="7.8"
                                fontFamily="'JetBrains Mono', monospace"
                                letterSpacing="1.3"
                            >
                                {isThinking ? "THINKING" : isWaiting ? "WAITING" : "IDLE"}
                            </text>

                            <text
                                x={point.x}
                                y={point.y + 71}
                                fill="#94a3b8"
                                textAnchor="middle"
                                fontSize="10"
                                fontFamily="'Sora', sans-serif"
                                letterSpacing="1.5"
                            >
                                {meta.label.toUpperCase()}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Metric label="Link Flux" value={recentMessages.length} accent="#7dd3fc" />
                <Metric label="Active Agents" value={activeAgents} accent="#fcd34d" />
                <Metric label="Disagreement" value={`${disagreement}%`} accent={hasConflict ? "#fda4af" : "#86efac"} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-300" /> Forward Flow</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-300" /> Reverse Flow</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-300" /> Conflict Lane</span>
            </div>

            <motion.div
                className="absolute inset-x-0 bottom-0 h-24"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                style={{
                    background:
                        "linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(11, 18, 32, 0.86) 100%)",
                }}
            />
        </GlassCard>
    );
}
