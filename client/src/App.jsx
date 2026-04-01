// ============================================================
// WARROOM — App.jsx
// Full dashboard: header · SVG agent graph · reasoning feed
// · memory cards · session brief · human intervention panel
// ============================================================
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import './App.css';

// ── Toggle this to switch DEV ↔ LIVE ────────────────────────
const DEV_MODE = false;

// When DEV_MODE = false, install the live hooks:
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from './module_bindings';

// ============================================================
// CONFIGURATION
// ============================================================
const AGENT_CFG = {
  scout:           { color: '#00D4FF', dim: 'rgba(0,212,255,0.12)',  emoji: '🔍', label: 'Scout' },
  strategist:      { color: '#FFB800', dim: 'rgba(255,184,0,0.12)',  emoji: '📊', label: 'Strategist' },
  devils_advocate: { color: '#FF3366', dim: 'rgba(255,51,102,0.12)', emoji: '😈', label: "Devil's Adv" },
};

const DEV_CRISIS = "A major competitor just launched a product at 40% lower price than ours. We have 2 hours to decide our response.";

// ── Sample reasoning pools ───────────────────────────────────
const SAMPLES = {
  scout: [
    { reasoning: "Analyzing competitor pricing model. The 40% reduction indicates either a significant cost advantage through new supply chain partnerships or a VC-backed market-share grab. Cross-referencing LinkedIn: 23 new operations hires in Q4. This is structural, not promotional.", decision: "Competitor achieved permanent cost reduction via Taiwan fab partnership. Not a promotional event.", confidence: 0.87, hasConflict: false },
    { reasoning: "Social media sentiment analysis: competitor announcement getting 94% positive reception. Reddit r/entrepreneur thread — 847 comments. Early adopters reporting 3.2× better price-to-value. Instagram organic posts up 340% in 6 hours.", decision: "Market perception shift is underway. Est. 2,300 accounts switching in first 48 hours.", confidence: 0.91, hasConflict: false },
    { reasoning: "Q3 patent filings confirm exclusive manufacturing agreement. COGS modeling: their costs dropped 62–71%. December Series D raised $180M — financial runway for sustained price war exceeds 24 months.", decision: "Competitor can sustain pricing indefinitely. Financial runway and cost structure both favor them.", confidence: 0.94, hasConflict: false },
    { reasoning: "Customer churn risk: 47 enterprise accounts surveyed, 31 (66%) citing competitor price in renewal talks. SMB early signals — support tickets down 18%, trial cancellations up 44%.", decision: "15–20% customer loss imminent within 60 days without decisive response.", confidence: 0.78, hasConflict: false },
    { reasoning: "Competitor quality signals: 23 critical bug reports on their GitHub, 4 open CVEs unpatched 30+ days, G2 support rating 2.1★. Price advantage comes with reliability trade-offs.", decision: "Significant quality and security gaps exist in competitor product. Exploitable via enterprise messaging.", confidence: 0.83, hasConflict: false },
  ],
  strategist: [
    { reasoning: "Scout confirms structural cost reduction — matching price destroys our margins. Three vectors: (A) Targeted price protection for at-risk accounts only. (B) Launch entry-tier SKU. (C) Accelerate Q2 differentiating features by 8 weeks.", decision: "Recommend Option C + tactical A: protect top 20% accounts via direct outreach, accelerate roadmap simultaneously.", confidence: 0.79, hasConflict: false },
    { reasoning: "Integrating Devil's Advocate challenge on Option B cannibalization risk. Dell 1999 precedent is valid — revised synthesis: reliability narrative. Scout's CVE intelligence + SLA guarantees frame price as a feature of trust, not cost.", decision: "Launch 'Reliability Guarantee' campaign: 99.99% uptime SLA with financial penalties. Competitor 2.1★ support becomes our weapon.", confidence: 0.85, hasConflict: false },
    { reasoning: "Resource modeling: accelerating roadmap needs 4 engineers from Q3 features. Alternative: license two critical features in 6 weeks for ~$200K vs $400K internal build.", decision: "License path is faster and cheaper. Recommend partnership licensing + parallel internal build to avoid single point of failure.", confidence: 0.88, hasConflict: false },
    { reasoning: "Price protection program: top 20% accounts (120 enterprise clients) at current pricing costs $0 revenue loss. Risk: signals to mid-market that negotiation is possible.", decision: "Execute price protection for top 120 accounts via account managers. Frame as loyalty reward, not defensive action.", confidence: 0.82, hasConflict: false },
  ],
  devils_advocate: [
    { reasoning: "Strategist assumes enterprise customers value support most. Market data: 73% of SMB segment cited price as primary factor in last renewal survey. Option C roadmap acceleration = 8 weeks minimum. We lose mid-market in 30 days. This timeline is fatally optimistic.", decision: "Option C timeline cannot prevent 30-day churn window. Need immediate price response for SMB segment.", confidence: 0.88, hasConflict: true },
    { reasoning: "CRITICAL FLAW in Option B: a lower-tier product signals to premium customers they've been overcharged. Dell's 1999 consumer launch reduced enterprise deal sizes by 31% within 6 months. This would be existential for our enterprise segment.", decision: "Option B is catastrophic. Lower-tier product launch permanently destroys enterprise trust. Do not proceed.", confidence: 0.93, hasConflict: true },
    { reasoning: "Reliability narrative is valid leverage, but our Q3 internal audit showed 2 critical unpatched vulnerabilities. Using security as a differentiator while having internal exposure creates legal and reputational risk that exceeds the competitive advantage.", decision: "Pause security-based messaging until internal audit is clean. SLA guarantees without security claims are safe.", confidence: 0.86, hasConflict: false },
    { reasoning: "Licensing strategy: $200K and 6-week timeline looks attractive. Risk analysis: licensing creates vendor lock-in, usage restrictions, and limits inclusion in enterprise tiers. Due diligence required before commitment.", decision: "Licensing path needs 2-week vendor evaluation. Parallel-track internal build to avoid single point of failure.", confidence: 0.80, hasConflict: false },
  ],
};

const INITIAL_AGENTS = Object.entries(AGENT_CFG).map(([id, cfg]) => ({
  agentId: id, agentType: cfg.label.toLowerCase(),
  status: 'idle', currentTask: 'Awaiting crisis launch',
  confidence: 0, lastUpdated: Date.now() / 1000,
}));

// ============================================================
// HELPERS
// ============================================================
const fmt = (secs) => {
  const h = String(Math.floor(secs / 3600)).padStart(2,'0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2,'0');
  const s = String(secs % 60).padStart(2,'0');
  return `${h}:${m}:${s}`;
};
const tsNow = () => Date.now() / 1000;
let _lid = 10; const nxtLog = () => ++_lid;
let _mid = 10; const nxtMsg = () => ++_mid;

// ============================================================
// SUB-COMPONENT: SVG Agent Graph
// ============================================================
function AgentGraph({ agents, agentMessages, reasoningLog }) {
  const now = tsNow();
  const recentMsgs = agentMessages.filter(m => now - Number(m.sentAt) < 12);

  const latestDevils = useMemo(() =>
    [...reasoningLog].filter(r => r.agentId === 'devils_advocate')
      .sort((a,b) => Number(b.timestamp) - Number(a.timestamp))[0],
  [reasoningLog]);
  const isConflict = latestDevils?.hasConflict ?? false;

  const hasMsgBetween = (a, b) =>
    recentMsgs.some(m => (m.fromAgent===a&&m.toAgent===b)||(m.fromAgent===b&&m.toAgent===a));

  const agentMap = useMemo(() => Object.fromEntries(agents.map(a => [a.agentId, a])), [agents]);
  const latestConf = useMemo(() => {
    const out = {};
    ['scout','strategist','devils_advocate'].forEach(id => {
      const entries = reasoningLog.filter(r => r.agentId === id);
      out[id] = entries.length ? entries[0].confidence : 0;
    });
    return out;
  }, [reasoningLog]);

  // Node positions in a triangle (compressed to fit any panel height)
  const POS = {
    scout:           { cx: 210, cy: 68 },
    strategist:      { cx: 75,  cy: 268 },
    devils_advocate: { cx: 345, cy: 268 },
  };

  const pairs = [
    ['scout','strategist'],
    ['scout','devils_advocate'],
    ['strategist','devils_advocate'],
  ];

  return (
    <svg viewBox="0 0 420 360" style={{ width: '100%', height: '100%' }}>
      {/* Edges */}
      {pairs.map(([a, b]) => {
        const pa = POS[a]; const pb = POS[b];
        const active = hasMsgBetween(a, b);
        const conflict = isConflict && (a === 'devils_advocate' || b === 'devils_advocate');
        return (
          <line key={`${a}-${b}`}
            x1={pa.cx} y1={pa.cy} x2={pb.cx} y2={pb.cy}
            stroke={conflict ? '#FF3366' : active ? '#2D3B52' : '#1E293B'}
            strokeWidth={conflict ? 2 : active ? 1.5 : 1}
            strokeOpacity={conflict || active ? 0.9 : 0.35}
            strokeDasharray={conflict ? '4 4' : active ? '6 6' : '4 8'}
            className={conflict ? 'edge-conflict' : active ? 'edge-message-flow' : ''}
          />
        );
      })}

      {/* Nodes */}
      {Object.entries(AGENT_CFG).map(([id, cfg]) => {
        const { cx, cy } = POS[id];
        const agent = agentMap[id];
        const isThinking = agent?.status === 'thinking';
        const conf = latestConf[id];
        return (
          <g key={id} style={{ color: cfg.color }}>
            {/* Pulse ring when thinking */}
            {isThinking && (
              <circle cx={cx} cy={cy} r={52} fill="none"
                stroke={cfg.color} strokeWidth={1.5} strokeOpacity={0.5}
                className="node-pulse-ring"
              />
            )}
            {/* Glow halo */}
            <circle cx={cx} cy={cy} r={38}
              fill={cfg.dim} stroke={cfg.color} strokeWidth={isThinking ? 1.5 : 0.8}
              strokeOpacity={isThinking ? 1 : 0.5}
              className={isThinking ? 'node-thinking' : ''}
            />
            {/* Emoji */}
            <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle"
              fontSize={24} style={{ userSelect: 'none' }}>
              {cfg.emoji}
            </text>
            {/* Agent name */}
            <text x={cx} y={cy + 54} textAnchor="middle"
              fill={cfg.color} fontSize={11}
              fontFamily="Rajdhani,sans-serif" fontWeight={700} letterSpacing={1}>
              {cfg.label.toUpperCase()}
            </text>
            {/* Status badge */}
            <g>
              <rect x={cx - 34} y={cy + 65} width={68} height={16} rx={3}
                fill={isThinking ? cfg.color : '#161B27'}
                fillOpacity={isThinking ? 0.2 : 1}
                stroke={isThinking ? cfg.color : '#1E293B'}
                strokeWidth={0.8}
              />
              <text x={cx} y={cy + 76} textAnchor="middle"
                fill={isThinking ? cfg.color : '#4A5568'}
                fontSize={9} fontFamily="Orbitron,sans-serif" fontWeight={700} letterSpacing={1.5}>
                {(agent?.status ?? 'idle').toUpperCase()}
              </text>
            </g>
            {/* Confidence */}
            <text x={cx} y={cy + 92} textAnchor="middle"
              fill="#8892A4" fontSize={9} fontFamily="Orbitron,sans-serif">
              {conf > 0 ? `${Math.round(conf * 100)}%` : '—'}
            </text>
          </g>
        );
      })}

      {/* Conflict indicator */}
      {isConflict && (
        <text x={210} y={352} textAnchor="middle"
          fill="#FF3366" fontSize={9} fontFamily="Rajdhani,sans-serif" fontWeight={700} letterSpacing={2}>
          ⚠ CONFLICT DETECTED
        </text>
      )}
    </svg>
  );
}

// ============================================================
// SUB-COMPONENT: Single reasoning feed entry
// ============================================================
function ReasoningEntry({ entry, sessionStart }) {
  const cfg = AGENT_CFG[entry.agentId] ?? { color: '#8892A4', label: entry.agentId };
  const elapsed = Math.max(0, Math.round(Number(entry.timestamp) - sessionStart));

  return (
    <div className="reasoning-entry" style={{
      borderLeft: `3px solid ${cfg.color}`,
      background: '#0D1117',
      borderRadius: 4,
      padding: '10px 14px',
      marginBottom: 8,
      position: 'relative',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          background: cfg.color, color: '#080B14',
          fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.7rem',
          padding: '1px 7px', borderRadius: 2, letterSpacing: 1,
        }}>
          {(AGENT_CFG[entry.agentId]?.emoji ?? '') + ' ' + (AGENT_CFG[entry.agentId]?.label ?? entry.agentId).toUpperCase()}
        </span>
        <span style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', color: '#4A5568', marginLeft: 'auto' }}>
          {fmt(elapsed)}
        </span>
        {entry.hasConflict && (
          <span className="conflict-badge-live" style={{
            background: 'rgba(255,51,102,0.15)', border: '1px solid #FF3366',
            color: '#FF3366', fontFamily: 'Rajdhani', fontWeight: 700,
            fontSize: '0.65rem', padding: '1px 6px', borderRadius: 2, letterSpacing: 1,
          }}>⚡ CONFLICT</span>
        )}
      </div>

      {/* Reasoning text */}
      <p style={{
        fontFamily: 'Space Mono', fontSize: '0.67rem', color: '#8892A4',
        lineHeight: 1.6, marginBottom: 6,
      }}>
        {entry.reasoning}
      </p>

      {/* Decision */}
      <p style={{
        fontFamily: 'Space Mono', fontSize: '0.7rem', color: '#E8EDF5',
        fontWeight: 700, lineHeight: 1.5, marginBottom: 8,
      }}>
        ▸ {entry.decision}
      </p>

      {/* Confidence bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: '0.6rem', color: '#4A5568', width: 28 }}>
          {Math.round(entry.confidence * 100)}%
        </span>
        <div style={{ flex: 1, height: 3, background: '#161B27', borderRadius: 2, overflow: 'hidden' }}>
          <div className="confidence-bar-fill" style={{
            height: '100%', width: `${entry.confidence * 100}%`,
            background: cfg.color, borderRadius: 2,
          }} />
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
  const entries = reasoningLog.filter(r => r.agentId === agentId).slice(0, 5);

  return (
    <div style={{
      background: '#0D1117', borderRadius: 4,
      border: '1px solid #161B27',
      borderTop: `3px solid ${cfg.color}`,
      padding: '12px', flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: '1rem' }}>{cfg.emoji}</span>
        <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem',
          color: cfg.color, letterSpacing: 1 }}>
          {cfg.label.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'Rajdhani', fontSize: '0.65rem', color: '#4A5568',
          marginLeft: 'auto' }}>{entries.length} memories</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 130, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {entries.length === 0 ? (
          <p style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#4A5568',
            fontStyle: 'italic' }}>No memories yet…</p>
        ) : entries.map((e, i) => (
          <div key={e.logId ?? i} style={{
            background: '#080B14', borderRadius: 3, padding: '5px 8px',
            borderLeft: `2px solid ${cfg.color}40`,
          }}>
            <p style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#8892A4',
              lineHeight: 1.5, overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {e.decision}
            </p>
          </div>
        ))}
      </div>
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
  const [_log]    = useTable(tables.reasoning_log);
  const [_msgs]   = useTable(tables.agent_messages);
  const [_ctx]    = useTable(tables.shared_context);

  const agents        = _agents ? [..._agents] : INITIAL_AGENTS;
  const reasoningLog  = _log ? [..._log].sort((a,b) => Number(b.timestamp) - Number(a.timestamp)) : [];
  const agentMessages = _msgs ? [..._msgs] : [];
  const sharedContext = _ctx ? [..._ctx] : [{ key:'crisis', value: DEV_CRISIS }];

  // ── LIVE MODE Reducers ──────────────────────────────────────
  const spawnSwarm = useReducer(reducers.spawnSwarm);
  const injectBelief = useReducer(reducers.injectBelief);

  // ── Legacy DEV hooks (Disabled by false DEV_MODE) ──────────
  const [devAgents,        setAgents]        = useState(INITIAL_AGENTS);
  const [devReasoningLog,  setReasoningLog]  = useState([]);
  const [devAgentMessages, setAgentMessages] = useState([]);
  const [devSharedContext, setSharedContext] = useState([{ key:'crisis', value: DEV_CRISIS }]);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [isPaused,      setIsPaused]      = useState(false);
  const [isLaunched,    setIsLaunched]    = useState(false);
  const [showLaunch,    setShowLaunch]    = useState(false);
  const [launchCrisis,  setLaunchCrisis]  = useState(DEV_CRISIS);
  const [injInput,      setInjInput]      = useState('');
  const [injAgent,      setInjAgent]      = useState('scout');
  const [injections,    setInjections]    = useState([]);
  const sessionStart = useRef(tsNow());
  const feedRef      = useRef(null);
  const simActive    = useRef(false);

  // ── Derived ────────────────────────────────────────────────
  const crisis = sharedContext.find(c => c.key === 'crisis')?.value ?? DEV_CRISIS;
  const finalBrief = sharedContext.find(c => c.key === 'final_brief')?.value;
  const totalConflicts   = reasoningLog.filter(r => r.hasConflict).length;
  const avgConfidence    = reasoningLog.length
    ? reasoningLog.reduce((s, r) => s + r.confidence, 0) / reasoningLog.length : 0;
  const latestByAgent    = useMemo(() => {
    const out = {};
    ['scout','strategist','devils_advocate'].forEach(id => {
      out[id] = reasoningLog.find(r => r.agentId === id);
    });
    return out;
  }, [reasoningLog]);

  // ── Session timer ──────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setSessionSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-scroll feed to top ────────────────────────────────
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
        logId: nxtLog(), agentId,
        reasoning: sample.reasoning, decision: sample.decision,
        confidence: sample.confidence, hasConflict: sample.hasConflict ?? false,
        timestamp: now,
      };
      setReasoningLog(prev => [entry, ...prev].slice(0, 30));
      setAgents(prev => prev.map(a =>
        a.agentId === agentId
          ? { ...a, status:'idle', confidence: sample.confidence, lastUpdated: now }
          : a
      ));
      if (msgTarget) {
        setAgentMessages(prev => [...prev, {
          msgId: nxtMsg(), fromAgent: agentId, toAgent: msgTarget,
          content: sample.decision, isRead: false, sentAt: now,
        }].slice(-60));
      }
    };

    const MSG_TARGETS = {
      scout: 'strategist',
      strategist: 'devils_advocate',
      devils_advocate: 'strategist',
    };

    const cycle = (agentId, initialDelay) => {
      let pool = [...SAMPLES[agentId]];
      let poolIdx = 0;

      const tick = (delay) => {
        setTimeout(() => {
          if (!simActive.current) return;
          // Set thinking
          setAgents(prev => prev.map(a =>
            a.agentId === agentId ? { ...a, status:'thinking', lastUpdated: tsNow() } : a
          ));
          // After think time, produce output
          const thinkMs = 3500 + Math.random() * 4000;
          setTimeout(() => {
            if (!simActive.current) return;
            const sample = pool[poolIdx % pool.length];
            poolIdx++;
            addLog(agentId, sample, Math.random() > 0.35 ? MSG_TARGETS[agentId] : null);
            tick(9000 + Math.random() * 11000);
          }, thinkMs);
        }, delay);
      };

      tick(initialDelay);
    };

    cycle('scout',           1200);
    cycle('strategist',      5500);
    cycle('devils_advocate', 9500);

    return () => { simActive.current = false; };
  }, [isLaunched, isPaused]);

  // ── Handlers ───────────────────────────────────────────────
  const handleLaunch = useCallback(() => {
    setSharedContext([{ key:'crisis', value: launchCrisis }]);
    setReasoningLog([]);
    setAgentMessages([]);
    setAgents(prev => prev.map(a => ({ ...a, status:'idle', confidence:0 })));
    sessionStart.current = tsNow();
    setSessionSecs(0);
    setIsLaunched(false);
    setShowLaunch(false);
    // Tiny delay so simulation effect re-fires cleanly
    setTimeout(() => setIsLaunched(true), 80);
    if (!DEV_MODE) {
      spawnSwarm({ crisis: launchCrisis });
    }
  }, [launchCrisis, spawnSwarm]);
  const handleInject = useCallback(() => {
    if (!injInput.trim()) return;
    const now = tsNow();
    if (DEV_MODE) {
      setAgentMessages(prev => [...prev, {
        msgId: nxtMsg(), fromAgent:'human', toAgent: injAgent,
        content: injInput.trim(), isRead: false, sentAt: now,
      }]);
    } else {
      injectBelief({ agentId: injAgent, belief: injInput.trim() });
    }
    setInjections(prev => [{ agent: injAgent, text: injInput.trim(), at: now }, ...prev].slice(0, 3));
    setInjInput('');
  }, [injInput, injAgent, injectBelief]);

  const handleTogglePause = useCallback(() => {
    if (DEV_MODE) setIsPaused(p => !p);
  }, []);

  // ── LIVE MODE data hooks (activated when DEV_MODE = false) ──
  // Replaced with actual useTable hooks at top of component.

  // ── Styles helpers ─────────────────────────────────────────
  const panel = (extra = {}) => ({
    background: '#0D1117', border: '1px solid #161B27',
    borderRadius: 4, overflow: 'hidden', ...extra,
  });
  const panelLabel = (color = '#4A5568') => ({
    fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem',
    letterSpacing: '0.2em', color, padding: '8px 14px 4px',
    borderBottom: '1px solid #161B27',
  });

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <div className="dashboard" style={{
      display: 'grid',
      gridTemplateRows: '64px 1fr 220px 80px',
      height: '100vh', overflow: 'hidden',
    }}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 20px', borderBottom: '1px solid #161B27',
        background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(10px)',
        zIndex: 10,
      }}>
        {/* Logo */}
        <h1 className="title-pulse" style={{
          fontFamily: 'Orbitron', fontWeight: 900, fontSize: '1.55rem',
          letterSpacing: '0.3em', color: '#E8EDF5', whiteSpace: 'nowrap',
        }}>WARROOM</h1>

        {/* Live dot */}
        <div style={{ position:'relative', width:10, height:10, flexShrink:0 }}>
          <div className="live-ping" style={{
            position:'absolute', inset:0, borderRadius:'50%', background:'#FF3366',
          }} />
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'#FF3366' }} />
        </div>
        <span style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:'0.7rem',
          color:'#FF3366', letterSpacing:'0.2em', flexShrink:0 }}>LIVE</span>

        {/* Timer */}
        <span style={{ fontFamily:'Orbitron', fontSize:'0.85rem', color:'#8892A4', flexShrink:0 }}>
          {fmt(sessionSecs)}
        </span>

        {/* Crisis */}
        <div style={{ flex:1, overflow:'hidden', borderLeft:'1px solid #1E293B', paddingLeft:12 }}>
          <span style={{
            fontFamily:'Space Mono', fontSize:'0.65rem', color:'#4A5568',
            display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>
            ⚡ {crisis}
          </span>
        </div>

        {/* Agent status mini indicators */}
        <div style={{ display:'flex', gap:12, alignItems:'center', flexShrink:0 }}>
          {agents.map(a => {
            const cfg = AGENT_CFG[a.agentId]; if (!cfg) return null;
            const thinking = a.status === 'thinking';
            return (
              <div key={a.agentId} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div className={thinking ? 'status-thinking' : ''} style={{
                  width:7, height:7, borderRadius:'50%',
                  background: thinking ? cfg.color : '#2D3B52',
                  boxShadow: thinking ? `0 0 6px ${cfg.color}` : 'none',
                }} />
                <span style={{ fontFamily:'Rajdhani', fontSize:'0.7rem',
                  color: thinking ? cfg.color : '#4A5568', fontWeight:700, letterSpacing:0.5 }}>
                  {cfg.label.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <button 
          onClick={() => setShowLaunch(true)} 
          disabled={agents.some(a => a.status === 'thinking')}
          style={{
          background: isLaunched ? 'rgba(255,51,102,0.08)' : 'rgba(255,51,102,0.15)',
          border: `1px solid ${isLaunched ? '#FF336640':'#FF3366'}`,
          color: agents.some(a => a.status === 'thinking') ? '#FF336640' : (isLaunched ? '#FF336688' : '#FF3366'),
          cursor: agents.some(a => a.status === 'thinking') ? 'not-allowed' : 'pointer',
          fontFamily:'Rajdhani', fontWeight:700, fontSize:'0.75rem',
          letterSpacing:'0.15em', padding:'6px 14px', borderRadius:3, flexShrink:0,
        }}>
          {agents.some(a => a.status === 'thinking') ? 'SWARM IS ACTIVE...' : (isLaunched ? '⟳ RELAUNCH' : '▶ LAUNCH SWARM')}
        </button>

      </header>

      {/* ── MAIN ROW: Graph + Feed ─────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', overflow:'hidden' }}>

        {/* Agent Graph panel */}
        <div style={{ ...panel(), borderRight:'1px solid #161B27', display:'flex', flexDirection:'column' }}>
          <div style={panelLabel()}>NODE GRAPH — AGENT TOPOLOGY</div>
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'8px 0' }}>
            <AgentGraph agents={agents} agentMessages={agentMessages} reasoningLog={reasoningLog} />
          </div>
        </div>

        {/* Reasoning Feed */}
        <div style={{ ...panel(), display:'flex', flexDirection:'column' }}>
          <div style={{ ...panelLabel(), display:'flex', alignItems:'center', gap:8 }}>
            <span>LIVE REASONING FEED</span>
            <span style={{ fontFamily:'Orbitron', fontSize:'0.6rem', color:'#FF3366',
              marginLeft:'auto' }}>
              {reasoningLog.length} ENTRIES
            </span>
          </div>
          
          {finalBrief && (
            <div style={{
              margin: '12px 12px 0 12px', padding: '16px', borderRadius: '4px',
              background: 'rgba(0, 255, 136, 0.05)', border: '1px solid #00FF8840',
              boxShadow: '0 0 15px rgba(0, 255, 136, 0.1)'
            }}>
              <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: '#00FF88', marginBottom: '8px', letterSpacing: '0.1em' }}>
                ⭐ EXECUTIVE ACTION PLAN
              </h3>
              <p style={{ fontFamily: 'Space Mono', fontSize: '0.8rem', color: '#E8EDF5', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {finalBrief}
              </p>
            </div>
          )}

          <div ref={feedRef} style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
            {reasoningLog.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', height:'100%', gap:10 }}>
                <span style={{ fontSize:'2rem' }}>🧠</span>
                <p style={{ fontFamily:'Space Mono', fontSize:'0.68rem', color:'#4A5568',
                  textAlign:'center' }}>
                  {isLaunched ? 'Agents are spinning up…' : 'Launch the swarm to begin.'}
                </p>
                <span className="blink-cursor" style={{ color:'#4A5568', fontFamily:'Space Mono' }}>_</span>
              </div>
            ) : reasoningLog.map(e => (
              <ReasoningEntry key={e.logId} entry={e} sessionStart={sessionStart.current} />
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: Memory Cards + Session Brief ──────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', overflow:'hidden',
        borderTop:'1px solid #161B27' }}>

        {/* Memory Cards */}
        <div style={{ ...panel(), borderRight:'1px solid #161B27', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={panelLabel()}>AGENT MEMORY CACHE</div>
          <div style={{ flex:1, display:'flex', gap:8, padding:'10px', overflow:'hidden' }}>
            {Object.keys(AGENT_CFG).map(id => (
              <MemoryCard key={id} agentId={id} reasoningLog={reasoningLog} />
            ))}
          </div>
        </div>

        {/* Session Brief */}
        <div style={{ ...panel(), display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={panelLabel()}>SESSION INTELLIGENCE BRIEF</div>
          <div style={{ flex:1, overflowY:'auto', padding:'10px 14px', display:'flex',
            flexDirection:'column', gap:8 }}>
            {/* Crisis */}
            <BriefRow label="CRISIS" value={crisis.slice(0,80) + (crisis.length>80?'…':'')}
              valueColor="#E8EDF5" mono />
            {/* Stats row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <BriefRow label="FINDINGS"  value={String(reasoningLog.length)} valueColor="#00FF88" mono />
              <BriefRow label="CONFLICTS" value={String(totalConflicts)}
                valueColor={totalConflicts > 0 ? '#FF3366' : '#4A5568'} mono />
            </div>
            {/* Avg confidence */}
            <div>
              <span style={{ fontFamily:'Rajdhani', fontSize:'0.6rem', color:'#4A5568',
                letterSpacing:'0.15em', display:'block', marginBottom:4 }}>AVG CONFIDENCE</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ flex:1, height:4, background:'#161B27', borderRadius:2, overflow:'hidden' }}>
                  <div className="confidence-bar-fill" style={{
                    height:'100%', width:`${avgConfidence*100}%`,
                    background:'linear-gradient(90deg,#00D4FF,#00FF88)', borderRadius:2,
                  }} />
                </div>
                <span style={{ fontFamily:'Orbitron', fontSize:'0.65rem', color:'#E8EDF5', width:32 }}>
                  {Math.round(avgConfidence*100)}%
                </span>
              </div>
            </div>
            {/* Latest per agent */}
            <BriefRow label="SCOUT INTEL"      value={latestByAgent.scout?.decision}      valueColor="#00D4FF" mono />
            <BriefRow label="RECOMMENDATION"   value={latestByAgent.strategist?.decision}  valueColor="#FFB800" mono />
            <BriefRow label="ACTIVE CHALLENGE" value={latestByAgent.devils_advocate?.decision} valueColor="#FF3366" mono />
          </div>
        </div>
      </div>

      {/* ── HUMAN INTERVENTION ROW ─────────────────────────── */}
      <div style={{ ...panel(), display:'flex', alignItems:'center', gap:10, padding:'0 16px',
        borderTop:'1px solid #161B27' }}>
        <span style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:'0.65rem',
          color:'#4A5568', letterSpacing:'0.15em', flexShrink:0 }}>INJECT BELIEF</span>

        <select value={injAgent} onChange={e => setInjAgent(e.target.value)} style={{
          background:'#080B14', border:'1px solid #1E293B', color:'#8892A4',
          fontFamily:'Rajdhani', fontWeight:600, fontSize:'0.75rem',
          padding:'5px 10px', borderRadius:3, flexShrink:0,
        }}>
          <option value="scout">Scout</option>
          <option value="strategist">Strategist</option>
          <option value="devils_advocate">Devil's Advocate</option>
        </select>

        <input
          value={injInput} onChange={e => setInjInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInject()}
          placeholder="Inject a belief or instruction into an agent…"
          style={{
            flex:1, background:'#080B14', border:'1px solid #1E293B',
            color:'#E8EDF5', fontFamily:'Space Mono', fontSize:'0.65rem',
            padding:'6px 12px', borderRadius:3, outline:'none',
          }}
        />

        <button onClick={handleInject} style={{
          background:'rgba(0,212,255,0.1)', border:'1px solid #00D4FF40',
          color:'#00D4FF', fontFamily:'Rajdhani', fontWeight:700,
          fontSize:'0.7rem', letterSpacing:'0.1em', padding:'6px 14px', borderRadius:3, flexShrink:0,
        }}>INJECT</button>

        {/* Last injections */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {injections.map((inj, i) => {
            const c = AGENT_CFG[inj.agent]?.color ?? '#8892A4';
            return (
              <span key={i} style={{
                background: `${c}15`, border:`1px solid ${c}40`,
                color: c, fontFamily:'Rajdhani', fontSize:'0.65rem',
                padding:'2px 8px', borderRadius:2, maxWidth:120,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }} title={inj.text}>
                {AGENT_CFG[inj.agent]?.emoji} {inj.text.slice(0,18)}{inj.text.length>18?'…':''}
              </span>
            );
          })}
        </div>

        <span style={{ fontFamily:'Space Mono', fontSize:'0.58rem', color:'#2D3B52',
          flexShrink:0, fontStyle:'italic' }}>
          Picked up on next think cycle
        </span>
      </div>

      {/* ── LAUNCH MODAL ───────────────────────────────────── */}
      {showLaunch && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(8,11,20,0.88)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
          backdropFilter:'blur(4px)',
        }} onClick={() => setShowLaunch(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'#0D1117', border:'1px solid #1E293B',
            borderTop:'3px solid #FF3366', borderRadius:6,
            padding:'28px 32px', width:560, display:'flex', flexDirection:'column', gap:16,
          }}>
            <h2 style={{ fontFamily:'Orbitron', fontWeight:700, fontSize:'1.1rem',
              color:'#E8EDF5', letterSpacing:'0.2em' }}>LAUNCH SWARM</h2>
            <p style={{ fontFamily:'Rajdhani', fontSize:'0.8rem', color:'#8892A4' }}>
              Define the crisis scenario. All three agents will begin thinking in parallel.
            </p>
            <textarea
              value={launchCrisis}
              onChange={e => setLaunchCrisis(e.target.value)}
              rows={4}
              style={{
                background:'#080B14', border:'1px solid #1E293B',
                color:'#E8EDF5', fontFamily:'Space Mono', fontSize:'0.68rem',
                padding:'12px', borderRadius:4, resize:'vertical', outline:'none',
                lineHeight:1.7,
              }}
            />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setShowLaunch(false)} style={{
                background:'transparent', border:'1px solid #1E293B',
                color:'#4A5568', fontFamily:'Rajdhani', fontWeight:700,
                fontSize:'0.75rem', letterSpacing:'0.1em', padding:'8px 18px', borderRadius:3,
              }}>CANCEL</button>
              <button onClick={handleLaunch} style={{
                background:'rgba(255,51,102,0.15)', border:'1px solid #FF3366',
                color:'#FF3366', fontFamily:'Rajdhani', fontWeight:700,
                fontSize:'0.75rem', letterSpacing:'0.15em', padding:'8px 22px', borderRadius:3,
              }}>▶ LAUNCH</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small helper for the session brief rows
function BriefRow({ label, value, valueColor = '#E8EDF5', mono = false }) {
  return (
    <div>
      <span style={{ fontFamily:'Rajdhani', fontSize:'0.58rem', color:'#4A5568',
        letterSpacing:'0.15em', display:'block', marginBottom:2 }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'Space Mono' : 'Rajdhani',
        fontSize: mono ? '0.65rem' : '0.75rem',
        color: value ? valueColor : '#2D3B52',
        lineHeight:1.5, display:'block',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
      }}>
        {value ?? '— awaiting data'}
      </span>
    </div>
  );
}
