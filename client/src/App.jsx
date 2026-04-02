// ============================================================
// WARROOM — App.jsx
// Full dashboard: header · SVG agent graph · reasoning feed
// · memory cards · session brief · human intervention panel
// ============================================================
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import "./App.css";
import MemoryWebComponent from "./MemoryWeb";

// ── Toggle this to switch DEV ↔ LIVE ────────────────────────
const DEV_MODE = false;

// When DEV_MODE = false, install the live hooks:
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/react";
import { tables, reducers } from "./module_bindings";

// ============================================================
// CONFIGURATION
// ============================================================
const AGENT_CFG = {
  scout: {
    color: "#00D4FF",
    dim: "rgba(0,212,255,0.10)",
    emoji: "🔍",
    label: "Scout",
  },
  strategist: {
    color: "#FFB800",
    dim: "rgba(255,184,0,0.10)",
    emoji: "📊",
    label: "Strategist",
  },
  devils_advocate: {
    color: "#FF3366",
    dim: "rgba(255,51,102,0.10)",
    emoji: "😈",
    label: "Devil's Adv",
  },
};

const DEV_CRISIS =
  "A major competitor just launched a product at 40% lower price than ours. We have 2 hours to decide our response.";

// ── Sample reasoning pools ───────────────────────────────────
const SAMPLES = {
  scout: [
    {
      reasoning:
        "Analyzing competitor pricing model. The 40% reduction indicates either a significant cost advantage through new supply chain partnerships or a VC-backed market-share grab. Cross-referencing LinkedIn: 23 new operations hires in Q4. This is structural, not promotional.",
      decision:
        "Competitor achieved permanent cost reduction via Taiwan fab partnership. Not a promotional event.",
      confidence: 0.87,
      hasConflict: false,
    },
    {
      reasoning:
        "Social media sentiment analysis: competitor announcement getting 94% positive reception. Reddit r/entrepreneur thread — 847 comments. Early adopters reporting 3.2× better price-to-value.",
      decision:
        "Market perception shift is underway. Est. 2,300 accounts switching in first 48 hours.",
      confidence: 0.91,
      hasConflict: false,
    },
    {
      reasoning:
        "Q3 patent filings confirm exclusive manufacturing agreement. COGS modeling: their costs dropped 62–71%. December Series D raised $180M — financial runway for sustained price war exceeds 24 months.",
      decision:
        "Competitor can sustain pricing indefinitely. Financial runway and cost structure both favor them.",
      confidence: 0.94,
      hasConflict: false,
    },
    {
      reasoning:
        "Customer churn risk: 47 enterprise accounts surveyed, 31 (66%) citing competitor price in renewal talks. SMB early signals — support tickets down 18%, trial cancellations up 44%.",
      decision:
        "15–20% customer loss imminent within 60 days without decisive response.",
      confidence: 0.78,
      hasConflict: false,
    },
    {
      reasoning:
        "Competitor quality signals: 23 critical bug reports on their GitHub, 4 open CVEs unpatched 30+ days, G2 support rating 2.1★. Price advantage comes with reliability trade-offs.",
      decision:
        "Significant quality and security gaps exist in competitor product. Exploitable via enterprise messaging.",
      confidence: 0.83,
      hasConflict: false,
    },
  ],
  strategist: [
    {
      reasoning:
        "Scout confirms structural cost reduction — matching price destroys our margins. Three vectors: (A) Targeted price protection for at-risk accounts only. (B) Launch entry-tier SKU. (C) Accelerate Q2 differentiating features by 8 weeks.",
      decision:
        "Recommend Option C + tactical A: protect top 20% accounts via direct outreach, accelerate roadmap simultaneously.",
      confidence: 0.79,
      hasConflict: false,
    },
    {
      reasoning:
        "Integrating Devil's Advocate challenge on Option B cannibalization risk. Dell 1999 precedent is valid — revised synthesis: reliability narrative. Scout's CVE intelligence + SLA guarantees frame price as a feature of trust, not cost.",
      decision:
        "Launch 'Reliability Guarantee' campaign: 99.99% uptime SLA with financial penalties. Competitor 2.1★ support becomes our weapon.",
      confidence: 0.85,
      hasConflict: false,
    },
    {
      reasoning:
        "Resource modeling: accelerating roadmap needs 4 engineers from Q3 features. Alternative: license two critical features in 6 weeks for ~$200K vs $400K internal build.",
      decision:
        "License path is faster and cheaper. Recommend partnership licensing + parallel internal build to avoid single point of failure.",
      confidence: 0.88,
      hasConflict: false,
    },
    {
      reasoning:
        "Price protection program: top 20% accounts (120 enterprise clients) at current pricing costs $0 revenue loss. Risk: signals to mid-market that negotiation is possible.",
      decision:
        "Execute price protection for top 120 accounts via account managers. Frame as loyalty reward, not defensive action.",
      confidence: 0.82,
      hasConflict: false,
    },
  ],
  devils_advocate: [
    {
      reasoning:
        "Strategist assumes enterprise customers value support most. Market data: 73% of SMB segment cited price as primary factor in last renewal survey. Option C roadmap acceleration = 8 weeks minimum. We lose mid-market in 30 days. This timeline is fatally optimistic.",
      decision:
        "Option C timeline cannot prevent 30-day churn window. Need immediate price response for SMB segment.",
      confidence: 0.88,
      hasConflict: true,
    },
    {
      reasoning:
        "CRITICAL FLAW in Option B: a lower-tier product signals to premium customers they've been overcharged. Dell's 1999 consumer launch reduced enterprise deal sizes by 31% within 6 months. This would be existential for our enterprise segment.",
      decision:
        "Option B is catastrophic. Lower-tier product launch permanently destroys enterprise trust. Do not proceed.",
      confidence: 0.93,
      hasConflict: true,
    },
    {
      reasoning:
        "Reliability narrative is valid leverage, but our Q3 internal audit showed 2 critical unpatched vulnerabilities. Using security as a differentiator while having internal exposure creates legal and reputational risk.",
      decision:
        "Pause security-based messaging until internal audit is clean. SLA guarantees without security claims are safe.",
      confidence: 0.86,
      hasConflict: false,
    },
    {
      reasoning:
        "Licensing strategy: $200K and 6-week timeline looks attractive. Risk analysis: licensing creates vendor lock-in, usage restrictions, and limits inclusion in enterprise tiers.",
      decision:
        "Licensing path needs 2-week vendor evaluation. Parallel-track internal build to avoid single point of failure.",
      confidence: 0.8,
      hasConflict: false,
    },
  ],
};

const INITIAL_AGENTS = Object.entries(AGENT_CFG).map(([id, cfg]) => ({
  agentId: id,
  agentType: cfg.label.toLowerCase(),
  status: "idle",
  currentTask: "Awaiting crisis launch",
  confidence: 0,
  lastUpdated: Date.now() / 1000,
}));

// ============================================================
// HELPERS
// ============================================================
const fmt = (secs) => {
  const numSecs = Number(secs);
  const h = String(Math.floor(numSecs / 3600)).padStart(2, "0");
  const m = String(Math.floor((numSecs % 3600) / 60)).padStart(2, "0");
  const s = String(numSecs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};
const tsNow = () => Date.now() / 1000;
let _lid = 10;
const nxtLog = () => ++_lid;
let _mid = 10;
const nxtMsg = () => ++_mid;

// ============================================================
// SUB-COMPONENT: SVG Agent Graph
// ============================================================
function AgentGraph({ agents, agentMessages, reasoningLog }) {
  const now = tsNow();
  const recentMsgs = agentMessages.filter((m) => now - Number(m.sentAt) < 12);

  const latestDevils = useMemo(
    () =>
      [...reasoningLog]
        .filter((r) => r.agentId === "devils_advocate")
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0],
    [reasoningLog],
  );
  const isConflict = latestDevils?.hasConflict ?? false;

  const hasMsgBetween = (a, b) =>
    recentMsgs.some(
      (m) =>
        (m.fromAgent === a && m.toAgent === b) ||
        (m.fromAgent === b && m.toAgent === a),
    );

  const agentMap = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.agentId, a])),
    [agents],
  );
  const latestConf = useMemo(() => {
    const out = {};
    ["scout", "strategist", "devils_advocate"].forEach((id) => {
      const entries = reasoningLog.filter((r) => r.agentId === id);
      out[id] = entries.length ? entries[0].confidence : 0;
    });
    return out;
  }, [reasoningLog]);

  // Node positions - centered triangle
  const POS = {
    scout: { cx: 190, cy: 60 },
    strategist: { cx: 70, cy: 240 },
    devils_advocate: { cx: 310, cy: 240 },
  };

  const pairs = [
    ["scout", "strategist"],
    ["scout", "devils_advocate"],
    ["strategist", "devils_advocate"],
  ];

  return (
    <svg viewBox="0 0 380 320" style={{ width: "100%", height: "100%", maxHeight: "100%" }}>
      <defs>
        {/* Glow filters */}
        {Object.entries(AGENT_CFG).map(([id, cfg]) => (
          <filter key={id} id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor={cfg.color} floodOpacity="0.3" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>

      {/* Edges */}
      {pairs.map(([a, b]) => {
        const pa = POS[a];
        const pb = POS[b];
        const active = hasMsgBetween(a, b);
        const conflict =
          isConflict && (a === "devils_advocate" || b === "devils_advocate");
        return (
          <line
            key={`${a}-${b}`}
            x1={pa.cx}
            y1={pa.cy}
            x2={pb.cx}
            y2={pb.cy}
            stroke={conflict ? "#FF3366" : active ? "#243049" : "#1A2035"}
            strokeWidth={conflict ? 2 : active ? 1.5 : 1}
            strokeOpacity={conflict || active ? 0.9 : 0.4}
            strokeDasharray={conflict ? "4 4" : active ? "6 6" : "4 8"}
            className={
              conflict ? "edge-conflict" : active ? "edge-message-flow" : ""
            }
          />
        );
      })}

      {/* Nodes */}
      {Object.entries(AGENT_CFG).map(([id, cfg]) => {
        const { cx, cy } = POS[id];
        const agent = agentMap[id];
        const isThinking = agent?.status === "thinking";
        const conf = latestConf[id];
        return (
          <g key={id} style={{ color: cfg.color }}>
            {/* Pulse ring when thinking */}
            {isThinking && (
              <circle
                cx={cx}
                cy={cy}
                r={48}
                fill="none"
                stroke={cfg.color}
                strokeWidth={1.5}
                strokeOpacity={0.4}
                className="node-pulse-ring"
              />
            )}
            {/* Warning pulse when paused */}
            {agent?.status === "paused" && (
              <circle
                cx={cx}
                cy={cy}
                r={46}
                fill="none"
                stroke="var(--strategist)"
                strokeWidth={1.5}
                strokeOpacity={0.6}
                className="node-pulse-ring"
              />
            )}
            {/* Outer glow */}
            <circle
              cx={cx}
              cy={cy}
              r={34}
              fill={cfg.dim}
              stroke={cfg.color}
              strokeWidth={isThinking ? 1.5 : 0.8}
              strokeOpacity={isThinking ? 1 : 0.4}
              className={isThinking ? "node-thinking" : ""}
              filter={isThinking ? `url(#glow-${id})` : undefined}
            />
            {/* Inner circle */}
            <circle
              cx={cx}
              cy={cy}
              r={22}
              fill={`${cfg.color}08`}
              stroke={cfg.color}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
            {/* Emoji */}
            <text
              x={cx}
              y={cy + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={20}
              style={{ userSelect: "none" }}
            >
              {cfg.emoji}
            </text>
            {/* Agent name */}
            <text
              x={cx}
              y={cy + 50}
              textAnchor="middle"
              fill={cfg.color}
              fontSize={11}
              fontFamily="Rajdhani,sans-serif"
              fontWeight={700}
              letterSpacing={1.5}
            >
              {cfg.label.toUpperCase()}
            </text>
            {/* Status badge */}
            <g>
              <rect
                x={cx - 30}
                y={cy + 58}
                width={60}
                height={16}
                rx={4}
                fill={isThinking ? `${cfg.color}18` : "#0B0F19"}
                stroke={isThinking ? cfg.color : "#1A2035"}
                strokeWidth={0.8}
              />
              <text
                x={cx}
                y={cy + 69}
                textAnchor="middle"
                fill={isThinking ? cfg.color : "#4A5568"}
                fontSize={8}
                fontFamily="Orbitron,sans-serif"
                fontWeight={700}
                letterSpacing={1.5}
              >
                {(agent?.status ?? "idle").toUpperCase()}
              </text>
            </g>
            {/* Confidence */}
            {conf > 0 && (
              <text
                x={cx}
                y={cy + 86}
                textAnchor="middle"
                fill="#8B95A8"
                fontSize={9}
                fontFamily="Orbitron,sans-serif"
              >
                {Math.round(conf * 100)}%
              </text>
            )}
          </g>
        );
      })}

      {/* Conflict indicator */}
      {isConflict && (
        <g>
          <rect
            x={130} y={298} width={120} height={18} rx={4}
            fill="rgba(255,51,102,0.1)"
            stroke="#FF3366"
            strokeWidth={0.8}
          />
          <text
            x={190}
            y={310}
            textAnchor="middle"
            fill="#FF3366"
            fontSize={8}
            fontFamily="Rajdhani,sans-serif"
            fontWeight={700}
            letterSpacing={2}
          >
            ⚠ CONFLICT DETECTED
          </text>
        </g>
      )}
    </svg>
  );
}

// ============================================================
// SUB-COMPONENT: Single reasoning feed entry
// ============================================================
function ReasoningEntry({ entry, sessionStart }) {
  const cfg = AGENT_CFG[entry.agentId] ?? {
    color: "#8B95A8",
    label: entry.agentId,
  };
  const elapsed = Math.max(
    0,
    Math.round(Number(entry.timestamp) - sessionStart),
  );

  return (
    <div
      className={`reasoning-entry${entry.hasConflict ? " conflict" : ""}`}
    >
      {/* Top row */}
      <div className="entry-header">
        <span
          className="entry-agent-badge"
          style={{ background: cfg.color }}
        >
          {(AGENT_CFG[entry.agentId]?.emoji ?? "") +
            " " +
            (AGENT_CFG[entry.agentId]?.label ?? entry.agentId).toUpperCase()}
        </span>
        {entry.hasConflict && (
          <span className="conflict-badge">⚡ CONFLICT</span>
        )}
        <span className="entry-time">{fmt(elapsed)}</span>
      </div>

      {/* Reasoning text */}
      <p className="entry-reasoning">{entry.reasoning}</p>

      {/* Decision */}
      <p className="entry-decision">{entry.decision}</p>

      {/* Confidence bar */}
      <div className="confidence-row">
        <span className="confidence-label">
          {Math.round(entry.confidence * 100)}%
        </span>
        <div className="confidence-track">
          <div
            className="confidence-bar-fill"
            style={{
              width: `${entry.confidence * 100}%`,
              background: `linear-gradient(90deg, ${cfg.color}80, ${cfg.color})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: Agent Memory Card
// ============================================================
function MemoryCard({ agentId, reasoningLog }) {
  const cfg = AGENT_CFG[agentId];
  const entries = reasoningLog.filter((r) => r.agentId === agentId).slice(0, 5);

  return (
    <div
      className="memory-card"
      style={{ borderTop: `2px solid ${cfg.color}` }}
    >
      <div className="memory-card-header">
        <span style={{ fontSize: "0.95rem" }}>{cfg.emoji}</span>
        <span
          className="memory-card-title"
          style={{ color: cfg.color }}
        >
          {cfg.label.toUpperCase()}
        </span>
        <span className="memory-card-count">
          {entries.length} memories
        </span>
      </div>
      <div className="memory-card-list">
        {entries.length === 0 ? (
          <p className="memory-empty">No memories yet…</p>
        ) : (
          entries.map((e, i) => (
            <div
              key={e.logId ?? i}
              className="memory-item"
              style={{ borderLeft: `2px solid ${cfg.color}30` }}
            >
              {e.decision}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: Brief Row
// ============================================================
function BriefRow({ label, value, valueColor = "#E8EDF5", mono = false }) {
  return (
    <div className="brief-row">
      <span className="brief-row-label">{label}</span>
      <span
        className="brief-row-value"
        style={{
          fontFamily: mono ? "'Space Mono', monospace" : "'Inter', sans-serif",
          fontSize: mono ? "0.65rem" : "0.72rem",
          color: value ? valueColor : "#2D3B52",
        }}
      >
        {value ?? "— awaiting data"}
      </span>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function App() {
  // ── State ──────────────────────────────────────────────────
  // ── LIVE MODE SpacetimeDB Hooks ─────────────────────────────
  const conn = useSpacetimeDB();
  const [_agents] = useTable(tables.agent);
  const [_log] = useTable(tables.reasoning_log);
  const [_msgs] = useTable(tables.agent_messages);
  const [_ctx] = useTable(tables.shared_context);
  const [_structMem] = useTable(tables.structured_memory);

  const agents = _agents ? [..._agents] : INITIAL_AGENTS;
  const reasoningLog = _log
    ? [..._log].sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    : [];
  const agentMessages = _msgs ? [..._msgs] : [];
  const sharedContext = _ctx
    ? [..._ctx]
    : [{ key: "crisis", value: DEV_CRISIS }];
  const structuredMemories = _structMem
    ? [..._structMem].sort((a, b) => {
        const ta = typeof a.timestamp === 'bigint' ? Number(a.timestamp) : Number(a.timestamp || 0);
        const tb = typeof b.timestamp === 'bigint' ? Number(b.timestamp) : Number(b.timestamp || 0);
        return tb - ta;
      })
    : [];

  // ── LIVE MODE Reducers ──────────────────────────────────────
  const spawnSwarm = useReducer(reducers.spawnSwarm || reducers.spawn_swarm || ((...args) => {
    console.error("CRITICAL: spawn_swarm reducer not found in bindings!");
  }));
  const nukeSession = useReducer(reducers.nukeSession || reducers.nuke_session || (() => {
    console.error("CRITICAL: nuke_session reducer not found in bindings!");
  }));
  const injectBelief = useReducer(reducers.injectBelief || reducers.inject_belief || ((...args) => {}));
  const togglePause = useReducer(reducers.togglePause || reducers.toggle_pause || ((...args) => {}));

  // ── Legacy DEV hooks ───────────────────────────────────────
  const [devAgents, setAgents] = useState(INITIAL_AGENTS);
  const [devReasoningLog, setReasoningLog] = useState([]);
  const [devAgentMessages, setAgentMessages] = useState([]);
  const [devSharedContext, setSharedContext] = useState([
    { key: "crisis", value: DEV_CRISIS },
  ]);
  const [sessionSecs, setSessionSecs] = useState(0);
  const [isLaunched, setIsLaunched] = useState(false);
  const [mem0Memories, setMem0Memories] = useState([]);
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchCrisis, setLaunchCrisis] = useState(DEV_CRISIS);
  const [injInput, setInjInput] = useState("");
  const [injAgent, setInjAgent] = useState("scout");
  const [injections, setInjections] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const sessionStart = useRef(tsNow());
  const feedRef = useRef(null);
  const simActive = useRef(false);

  // ── Memory Web: fetch Mem0 memories directly via API ─────────
  const fetchMem0Memories = useCallback(async () => {
    const apiKey = import.meta.env.VITE_MEM0_API_KEY;
    if (!apiKey) { console.warn("No VITE_MEM0_API_KEY"); return; }
    setMemoriesLoading(true);
    try {
      const agents = ["agent_scout", "agent_strategist", "agent_devils_advocate"];
      const allMemories = [];
      for (const userId of agents) {
        const resp = await fetch(`https://api.mem0.ai/v1/memories/?user_id=${userId}`, {
          headers: { "Authorization": `Token ${apiKey}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            allMemories.push(...data.map(m => ({ ...m, _source: "mem0", _userId: userId })));
          } else if (data.results && Array.isArray(data.results)) {
            allMemories.push(...data.results.map(m => ({ ...m, _source: "mem0", _userId: userId })));
          }
        }
      }
      setMem0Memories(allMemories);
    } catch (err) {
      console.error("Mem0 fetch failed:", err);
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "memory") {
      fetchMem0Memories();
    }
  }, [activeTab, fetchMem0Memories]);

  // ── Derived ────────────────────────────────────────────────
  const crisis =
    sharedContext.find((c) => c.key === "crisis")?.value ?? DEV_CRISIS;
  const isPaused = sharedContext.find((c) => c.key === "is_paused")?.value === "true";
  const finalBrief = sharedContext.find((c) => c.key === "final_brief")?.value;
  const totalConflicts = reasoningLog.filter((r) => r.hasConflict).length;
  const avgConfidence = reasoningLog.length
    ? reasoningLog.reduce((s, r) => s + r.confidence, 0) / reasoningLog.length
    : 0;
  const latestByAgent = useMemo(() => {
    const out = {};
    ["scout", "strategist", "devils_advocate"].forEach((id) => {
      out[id] = reasoningLog.find((r) => r.agentId === id);
    });
    return out;
  }, [reasoningLog]);

  // ── Session timer ──────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setSessionSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-scroll feed to top ────────────────────────────────
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [reasoningLog.length]);

  // ── DEV Simulation ─────────────────────────────────────────
  useEffect(() => {
    if (!DEV_MODE || !isLaunched) return;
    simActive.current = !isPaused;

    if (isPaused) return;
    simActive.current = true;

    const addLog = (agentId, sample, msgTarget) => {
      if (!simActive.current) return;
      const now = tsNow();
      const entry = {
        logId: nxtLog(),
        agentId,
        reasoning: sample.reasoning,
        decision: sample.decision,
        confidence: sample.confidence,
        hasConflict: sample.hasConflict ?? false,
        timestamp: now,
      };
      setReasoningLog((prev) => [entry, ...prev].slice(0, 30));
      setAgents((prev) =>
        prev.map((a) =>
          a.agentId === agentId
            ? {
                ...a,
                status: "idle",
                confidence: sample.confidence,
                lastUpdated: now,
              }
            : a,
        ),
      );
      if (msgTarget) {
        setAgentMessages((prev) =>
          [
            ...prev,
            {
              msgId: nxtMsg(),
              fromAgent: agentId,
              toAgent: msgTarget,
              content: sample.decision,
              isRead: false,
              sentAt: now,
            },
          ].slice(-60),
        );
      }
    };

    const MSG_TARGETS = {
      scout: "strategist",
      strategist: "devils_advocate",
      devils_advocate: "strategist",
    };

    const cycle = (agentId, initialDelay) => {
      let pool = [...SAMPLES[agentId]];
      let poolIdx = 0;

      const tick = (delay) => {
        setTimeout(() => {
          if (!simActive.current) return;
          // Set thinking
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === agentId
                ? { ...a, status: "thinking", lastUpdated: tsNow() }
                : a,
            ),
          );
          // After think time, produce output
          const thinkMs = 3500 + Math.random() * 4000;
          setTimeout(() => {
            if (!simActive.current) return;
            const sample = pool[poolIdx % pool.length];
            poolIdx++;
            addLog(
              agentId,
              sample,
              Math.random() > 0.35 ? MSG_TARGETS[agentId] : null,
            );
            tick(9000 + Math.random() * 11000);
          }, thinkMs);
        }, delay);
      };

      tick(initialDelay);
    };

    cycle("scout", 1200);
    cycle("strategist", 5500);
    cycle("devils_advocate", 9500);

    return () => {
      simActive.current = false;
    };
  }, [isLaunched, isPaused]);

  // ── Handlers ───────────────────────────────────────────────
  const handleLaunch = useCallback(() => {
    setSharedContext([{ key: "crisis", value: launchCrisis }]);
    setReasoningLog([]);
    setAgentMessages([]);
    setAgents((prev) =>
      prev.map((a) => ({ ...a, status: "idle", confidence: 0 })),
    );
    sessionStart.current = tsNow();
    setSessionSecs(0);
    setIsLaunched(false);
    setShowLaunch(false);
    setTimeout(() => setIsLaunched(true), 80);
    if (!DEV_MODE) {
      spawnSwarm({ crisis: launchCrisis });
    }
  }, [launchCrisis, spawnSwarm]);

  const handleInject = useCallback(() => {
    if (!injInput.trim()) return;
    const now = tsNow();
    if (DEV_MODE) {
      setAgentMessages((prev) => [
        ...prev,
        {
          msgId: nxtMsg(),
          fromAgent: "human",
          toAgent: injAgent,
          content: injInput.trim(),
          isRead: false,
          sentAt: now,
        },
      ]);
    } else {
      injectBelief({ agentId: injAgent, belief: injInput.trim() });
    }
    setInjections((prev) =>
      [{ agent: injAgent, text: injInput.trim(), at: now }, ...prev].slice(
        0,
        3,
      ),
    );
    setInjInput("");
  }, [injInput, injAgent, injectBelief]);

  const isSwarmActive = agents.some((a) => a.status === "thinking");

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <div className="dashboard">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 30px', borderBottom: '1px solid var(--border-default)' }}>
        <h1 className="header-title title-pulse" style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-primary)' }}>WARROOM</h1>

        <div className="header-center" style={{ display: 'flex', gap: '20px' }}>
          <div className="agent-status-indicators" style={{ display: 'flex', gap: '15px' }}>
            {agents.map((a) => {
              const cfg = AGENT_CFG[a.agentId];
              if (!cfg) return null;
              const thinking = a.status === "thinking";
              return (
                <div key={a.agentId} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div className={`agent-dot ${thinking ? "active" : ""}`} style={{ width: '8px', height: '8px', borderRadius: '50%', background: thinking ? cfg.color : '#333' }} />
                  <span style={{ fontSize: '10px', color: thinking ? cfg.color : '#888' }}>{cfg.label.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            className="reset-btn-final"
            style={{ 
              background: 'rgba(255, 51, 102, 0.15)', 
              border: '1.5px solid #FF3366', 
              color: '#FF3366',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '900',
              cursor: 'pointer',
              letterSpacing: '1px'
            }}
            onClick={() => {
              if (window.confirm("☢️ NUCLEAR RESET: Wipe all session memories and start fresh?")) {
                if (nukeSession) {
                  console.log("NUCLEAR RESET LOG: DISPATCHING VIA HOOK");
                  nukeSession();
                  setSessionSecs(0);
                  setIsLaunched(false);
                  setShowLaunch(false);
                  setMem0Memories([]);
                  alert("☢️ Reset command broadcast to swarm. Cleaning up...");
                } else {
                  console.warn("Nuke reducer not active yet.");
                }
              }
            }}
          >
            ☢️ RESET SESSION
          </button>

          <button
            className="launch-btn"
            onClick={() => setShowLaunch(true)}
            disabled={isSwarmActive && !isPaused}
            style={{ 
              background: 'var(--strategist)', 
              color: 'black',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '900',
              cursor: 'pointer'
            }}
          >
            {isSwarmActive ? "⟳ RUNNING..." : "▶ LAUNCH SWARM"}
          </button>
        </div>
      </header>

      {/* ── TAB NAVIGATION ─────────────────────────────── */}
      <div className="tab-bar">
        {[
          { id: "dashboard", label: "DASHBOARD", icon: "🎯" },
          { id: "memory", label: "SWARM BRAIN", icon: "🧠" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────── */}
      {activeTab === "dashboard" ? (
        <>
          <div className="dashboard-content">
            {/* ── Agent Graph panel ──────────────────── */}
            <div className="panel graph-panel">
              <div className="panel-header">
                <span className="panel-label">NODE GRAPH — AGENT TOPOLOGY</span>
              </div>
              <div className="graph-container">
                <AgentGraph
                  agents={agents}
                  agentMessages={agentMessages}
                  reasoningLog={reasoningLog}
                />
              </div>
            </div>

            {/* ── Reasoning Feed ─────────────────────── */}
            <div className="panel feed-panel">
              <div className="panel-header">
                <span className="panel-label">LIVE REASONING FEED</span>
                <span className="panel-badge">{reasoningLog.length} ENTRIES</span>
              </div>

              {finalBrief && (
                <div className="action-plan fade-in">
                  <h3>⭐ EXECUTIVE ACTION PLAN</h3>
                  <p>{finalBrief}</p>
                </div>
              )}

              <div ref={feedRef} className="feed-scroll">
                {isPaused && (
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      background: "rgba(255, 184, 0, 0.15)",
                      border: "1px solid rgba(255, 184, 0, 0.3)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 12px",
                      textAlign: "center",
                      fontFamily: "Orbitron",
                      fontSize: "0.65rem",
                      color: "var(--strategist)",
                      letterSpacing: "0.15em",
                      marginBottom: "12px",
                      backdropFilter: "blur(4px)",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    }}
                  >
                    ⚠️ SYSTEM PAUSED — AWAITING HUMAN INJECTION
                  </div>
                )}
                {reasoningLog.length === 0 ? (
                  <div className="feed-empty">
                    <span className="feed-empty-icon">🧠</span>
                    <p className="feed-empty-text">
                      {isLaunched
                        ? "Agents are spinning up…"
                        : "Launch the swarm to begin analysis."}
                    </p>
                    <span className="blink-cursor" style={{ color: "#4A5568", fontFamily: "Space Mono" }}>
                      _
                    </span>
                  </div>
                ) : (
                  reasoningLog.map((entry) => (
                    <ReasoningEntry
                      key={entry.logId}
                      entry={entry}
                      sessionStart={sessionStart.current}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── BOTTOM ROW ─────────────────────────── */}
            <div className="bottom-row">
              {/* Memory Cards */}
              <div className="memory-cards-panel">
                <div className="panel-header">
                  <span className="panel-label">AGENT MEMORY CACHE</span>
                </div>
                <div className="memory-cards-container">
                  {Object.keys(AGENT_CFG).map((id) => (
                    <MemoryCard
                      key={id}
                      agentId={id}
                      reasoningLog={reasoningLog}
                    />
                  ))}
                </div>
              </div>

              {/* Session Brief */}
              <div className="brief-panel">
                <div className="panel-header">
                  <span className="panel-label">SESSION INTELLIGENCE BRIEF</span>
                </div>
                <div className="brief-content">
                  <BriefRow
                    label="CRISIS"
                    value={crisis.slice(0, 80) + (crisis.length > 80 ? "…" : "")}
                    valueColor="#E8EDF5"
                    mono
                  />
                  <div className="stats-grid">
                    <BriefRow
                      label="FINDINGS"
                      value={String(reasoningLog.length)}
                      valueColor="#00FF88"
                      mono
                    />
                    <BriefRow
                      label="CONFLICTS"
                      value={String(totalConflicts)}
                      valueColor={totalConflicts > 0 ? "#FF3366" : "#4A5568"}
                      mono
                    />
                  </div>
                  <BriefRow
                    label="AVG CONFIDENCE"
                    value={(avgConfidence * 100).toFixed(1) + "%"}
                    valueColor="#E8EDF5"
                    mono
                  />
                  {["scout", "strategist", "devils_advocate"].map((agentId) => (
                    <BriefRow
                      key={agentId}
                      label={
                        (AGENT_CFG[agentId]?.label ?? agentId).toUpperCase() +
                        " LATEST"
                      }
                      value={latestByAgent[agentId]?.decision}
                      valueColor={AGENT_CFG[agentId]?.color ?? "#8B95A8"}
                      mono
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── INJECT BAR ────────────────────────────── */}
          <div className="inject-bar">
            <span className="inject-label">INJECT BELIEF</span>

            <select
              className="inject-select"
              value={injAgent}
              onChange={(e) => setInjAgent(e.target.value)}
            >
              <option value="scout">🔍 Scout</option>
              <option value="strategist">📊 Strategist</option>
              <option value="devils_advocate">😈 Devil's Advocate</option>
            </select>

            <input
              className={`inject-input ${!isPaused ? "locked" : ""}`}
              value={injInput}
              onChange={(e) => setInjInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isPaused && handleInject()}
              placeholder={isPaused ? "Inject strategic insight..." : "PAUSE SWARM TO INJECT BELIEF"}
              disabled={!isPaused}
            />

            <button 
              className={`inject-btn ${!isPaused ? "locked" : ""}`} 
              onClick={handleInject}
              disabled={!isPaused}
            >
              INJECT ⚡
            </button>

            {injections.length > 0 && (
              <div className="inject-history">
                {injections.map((inj, i) => {
                  const c = AGENT_CFG[inj.agent]?.color ?? "#8B95A8";
                  return (
                    <span
                      key={i}
                      className="inject-history-item"
                      style={{
                        background: `${c}12`,
                        border: `1px solid ${c}35`,
                        color: c,
                      }}
                      title={inj.text}
                    >
                      {AGENT_CFG[inj.agent]?.emoji} {inj.text.slice(0, 18)}
                      {inj.text.length > 18 ? "…" : ""}
                    </span>
                  );
                })}
              </div>
            )}

            <span className="inject-note">
              Picked up on next think cycle
            </span>
          </div>
        </>
      ) : activeTab === "memory" ? (
        <MemoryWebComponent
          mem0Memories={mem0Memories}
          structuredMemories={structuredMemories}
          loading={memoriesLoading}
          onRefresh={fetchMem0Memories}
          crisis={crisis}
        />
      ) : null}

      {/* ── LAUNCH MODAL ───────────────────────────────────── */}
      {showLaunch && (
        <div
          className="modal-overlay"
          onClick={() => setShowLaunch(false)}
        >
          <div
            className="modal-content fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">LAUNCH SWARM</h2>
            <p className="modal-desc">
              Define the crisis scenario. All three agents will begin thinking
              in parallel.
            </p>
            <textarea
              className="modal-textarea"
              value={launchCrisis}
              onChange={(e) => setLaunchCrisis(e.target.value)}
              rows={4}
            />
            <div className="modal-actions">
              <button
                className="modal-cancel-btn"
                onClick={() => setShowLaunch(false)}
              >
                CANCEL
              </button>
              <button className="modal-launch-btn" onClick={handleLaunch}>
                ▶ LAUNCH
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
