import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { AGENT_IDS } from "../lib/agents";
import { toUnixSeconds } from "../lib/time";
import { reducers, tables } from "../module_bindings/index.ts";

const DEFAULT_CRISIS =
    "A major competitor launched at 40% lower pricing and sentiment is shifting fast. Identify a response plan in under 2 hours.";

const DEMO_REASONING = {
    scout: [
        {
            reasoning:
                "Competitive pricing delta appears structural, not promotional. Supply chain evidence and hiring patterns imply a sustained margin advantage.",
            decision:
                "Assume long-duration pricing pressure and protect strategic accounts immediately.",
            confidence: 0.86,
            hasConflict: false,
        },
        {
            reasoning:
                "Early social signal indicates high traction in mid-market cohorts and strong migration curiosity from cost-sensitive buyers.",
            decision:
                "Expect accelerated trial-to-switch behavior across SMB and lower mid-market segments.",
            confidence: 0.8,
            hasConflict: false,
        },
    ],
    strategist: [
        {
            reasoning:
                "Matching headline price globally creates unacceptable margin drag. Better path: selective defense + strong value narrative + roadmap acceleration.",
            decision:
                "Apply targeted retention offers to top-risk accounts while shipping differentiation faster.",
            confidence: 0.82,
            hasConflict: false,
        },
        {
            reasoning:
                "Enterprise clients respond to reliability guarantees when uncertainty rises. Pricing parity is less effective than trust-backed commitments.",
            decision:
                "Launch reliability-led campaign with measurable SLA commitments and executive outreach.",
            confidence: 0.88,
            hasConflict: false,
        },
    ],
    devils_advocate: [
        {
            reasoning:
                "Targeted defense may still miss velocity of churn among price-sensitive cohorts. Timeline assumptions are optimistic if response execution slips.",
            decision:
                "Introduce a time-boxed tactical entry offer for SMB to absorb immediate migration pressure.",
            confidence: 0.84,
            hasConflict: true,
        },
        {
            reasoning:
                "Reliability narrative is strong, but claims must align with internal quality posture. Messaging overreach can damage credibility.",
            decision:
                "Gate external claims to validated strengths and avoid unverifiable superiority statements.",
            confidence: 0.79,
            hasConflict: false,
        },
    ],
};

const LIVE_TABLE_KEYS = ["agent", "reasoning_log", "agent_messages", "shared_context", "structured_memory"];
const LIVE_REDUCER_KEYS = ["spawn_swarm", "inject_belief"];

export const hasLiveBindings =
    Boolean(tables) &&
    LIVE_TABLE_KEYS.every((key) => key in tables) &&
    Boolean(reducers) &&
    LIVE_REDUCER_KEYS.some((key) => key in reducers || camelCaseKey(reducers, key));

function camelCaseKey(obj, snake) {
    const parts = snake.split("_");
    const key =
        parts[0] +
        parts
            .slice(1)
            .map((piece) => piece[0].toUpperCase() + piece.slice(1))
            .join("");
    return obj?.[key];
}

function pick(obj, keys, fallback = undefined) {
    for (const key of keys) {
        if (obj && key in obj) {
            return obj[key];
        }
    }
    return fallback;
}

function normalizeAgent(row) {
    return {
        agentId: String(pick(row, ["agentId", "agent_id"], "")),
        status: String(pick(row, ["status"], "idle")),
        currentTask: String(pick(row, ["currentTask", "current_task"], "Awaiting crisis launch")),
        confidence: Number(pick(row, ["confidence"], 0)),
        lastUpdated: Number(pick(row, ["lastUpdated", "last_updated"], toUnixSeconds())),
    };
}

function normalizeReasoning(row) {
    return {
        logId: Number(pick(row, ["logId", "log_id"], 0)),
        agentId: String(pick(row, ["agentId", "agent_id"], "scout")),
        reasoning: String(pick(row, ["reasoning"], "")),
        decision: String(pick(row, ["decision"], "")),
        confidence: Number(pick(row, ["confidence"], 0)),
        hasConflict: Boolean(pick(row, ["hasConflict", "has_conflict"], false)),
        timestamp: Number(pick(row, ["timestamp"], toUnixSeconds())),
    };
}

function normalizeMessage(row) {
    return {
        msgId: Number(pick(row, ["msgId", "msg_id"], 0)),
        fromAgent: String(pick(row, ["fromAgent", "from_agent"], "")),
        toAgent: String(pick(row, ["toAgent", "to_agent"], "")),
        content: String(pick(row, ["content"], "")),
        isRead: Boolean(pick(row, ["isRead", "is_read"], false)),
        sentAt: Number(pick(row, ["sentAt", "sent_at"], toUnixSeconds())),
    };
}

function normalizeContext(row) {
    return {
        key: String(pick(row, ["key"], "")),
        value: String(pick(row, ["value"], "")),
    };
}

function normalizeStructuredMemory(row) {
    return {
        id: Number(pick(row, ["id"], 0)),
        source: "session",
        sourceAgent: String(pick(row, ["sourceAgent", "source_agent"], "unknown")),
        pattern: String(pick(row, ["pattern"], "")),
        insight: String(pick(row, ["insight", "reasoning", "decision"], "")),
        decision: String(pick(row, ["decision"], "")),
        confidence: Number(pick(row, ["confidence"], 0)),
        predictedOutcome: String(pick(row, ["predictedOutcome", "predicted_outcome"], "")),
        timestamp: Number(pick(row, ["timestamp"], toUnixSeconds())),
    };
}

async function invokeReducer(reducerFn, objectPayload, positionalPayload = []) {
    if (typeof reducerFn !== "function") {
        return;
    }

    try {
        if (objectPayload === undefined) {
            await reducerFn();
        } else {
            await reducerFn(objectPayload);
        }
        return;
    } catch (_firstError) {
        if (!positionalPayload.length) {
            return;
        }
    }

    try {
        await reducerFn(...positionalPayload);
    } catch (error) {
        console.error("Reducer invocation failed", error);
    }
}

function useSharedUiState() {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [launchDraft, setLaunchDraft] = useState(DEFAULT_CRISIS);
    const [injectionInput, setInjectionInput] = useState("");
    const [injectionAgent, setInjectionAgent] = useState("scout");
    const [injections, setInjections] = useState([]);
    const [mem0Memories, setMem0Memories] = useState([]);
    const [memoriesLoading, setMemoriesLoading] = useState(false);
    const [sessionSeconds, setSessionSeconds] = useState(0);
    const sessionStartRef = useRef(toUnixSeconds());

    useEffect(() => {
        const timer = setInterval(() => {
            setSessionSeconds(Math.max(0, toUnixSeconds() - sessionStartRef.current));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const resetSessionClock = useCallback(() => {
        sessionStartRef.current = toUnixSeconds();
        setSessionSeconds(0);
    }, []);

    const recordInjection = useCallback((entry) => {
        setInjections((current) => [entry, ...current].slice(0, 6));
    }, []);

    const refreshMem0Memories = useCallback(async () => {
        const apiKey = import.meta.env.VITE_MEM0_API_KEY;
        if (!apiKey) {
            setMem0Memories([]);
            return;
        }

        setMemoriesLoading(true);
        try {
            const userIds = ["agent_scout", "agent_strategist", "agent_devils_advocate"];
            const responses = await Promise.all(
                userIds.map(async (userId) => {
                    const response = await fetch(`https://api.mem0.ai/v1/memories/?user_id=${userId}`, {
                        headers: {
                            Authorization: `Token ${apiKey}`,
                        },
                    });

                    if (!response.ok) {
                        return [];
                    }

                    const data = await response.json();
                    const records = Array.isArray(data) ? data : data?.results || [];
                    return records.map((record, index) => ({
                        id: record.id || `${userId}-${index}`,
                        source: "mem0",
                        sourceAgent: String(userId).replace("agent_", ""),
                        pattern: record?.metadata?.pattern || record?.pattern || "Long-term memory",
                        insight: record?.memory || record?.content || "",
                        decision: record?.decision || "",
                        confidence: Number(record?.metadata?.confidence || record?.confidence || 0.5),
                        predictedOutcome:
                            record?.metadata?.predicted_outcome ||
                            record?.predicted_outcome ||
                            record?.predictedOutcome ||
                            "",
                        timestamp: Number(new Date(record.created_at || Date.now()).getTime() / 1000),
                    }));
                }),
            );

            setMem0Memories(responses.flat());
        } catch (error) {
            console.error("Failed to fetch Mem0 memories", error);
            setMem0Memories([]);
        } finally {
            setMemoriesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === "memory") {
            refreshMem0Memories();
        }
    }, [activeTab, refreshMem0Memories]);

    return {
        activeTab,
        setActiveTab,
        launchDraft,
        setLaunchDraft,
        injectionInput,
        setInjectionInput,
        injectionAgent,
        setInjectionAgent,
        injections,
        recordInjection,
        mem0Memories,
        memoriesLoading,
        refreshMem0Memories,
        sessionSeconds,
        resetSessionClock,
    };
}

export function useLiveWarroomData() {
    const ui = useSharedUiState();

    const [agentsRaw = []] = useTable(tables.agent);
    const [logRaw = []] = useTable(tables.reasoning_log);
    const [messagesRaw = []] = useTable(tables.agent_messages);
    const [contextRaw = []] = useTable(tables.shared_context);
    const [memoryRaw = []] = useTable(tables.structured_memory);

    const hasSpawnReducer = Boolean(reducers.spawnSwarm || reducers.spawn_swarm);
    const hasInjectReducer = Boolean(reducers.injectBelief || reducers.inject_belief);
    const hasNukeReducer = Boolean(reducers.nukeSession || reducers.nuke_session);
    const hasPauseReducer = Boolean(reducers.togglePause || reducers.toggle_pause);

    const spawnSwarm = useReducer(reducers.spawnSwarm || reducers.spawn_swarm || (() => Promise.resolve()));
    const injectBelief = useReducer(reducers.injectBelief || reducers.inject_belief || (() => Promise.resolve()));
    const nukeSession = useReducer(reducers.nukeSession || reducers.nuke_session || (() => Promise.resolve()));
    const togglePause = useReducer(reducers.togglePause || reducers.toggle_pause || (() => Promise.resolve()));

    const agents = useMemo(() => {
        const normalized = agentsRaw.map(normalizeAgent);
        return AGENT_IDS.map((agentId) => normalized.find((agent) => agent.agentId === agentId)).filter(Boolean);
    }, [agentsRaw]);

    const reasoningLog = useMemo(
        () => logRaw.map(normalizeReasoning).sort((a, b) => b.timestamp - a.timestamp),
        [logRaw],
    );
    const agentMessages = useMemo(() => messagesRaw.map(normalizeMessage), [messagesRaw]);
    const sharedContext = useMemo(() => contextRaw.map(normalizeContext), [contextRaw]);
    const structuredMemories = useMemo(
        () => memoryRaw.map(normalizeStructuredMemory).sort((a, b) => b.timestamp - a.timestamp),
        [memoryRaw],
    );

    const sharedContextMap = useMemo(
        () => Object.fromEntries(sharedContext.map((entry) => [entry.key, entry.value])),
        [sharedContext],
    );

    const launchSwarm = useCallback(async () => {
        if (!hasSpawnReducer) {
            console.warn("spawn_swarm reducer is not available in generated bindings.");
            return;
        }
        ui.resetSessionClock();
        await invokeReducer(spawnSwarm, { crisis: ui.launchDraft }, [ui.launchDraft]);
    }, [hasSpawnReducer, spawnSwarm, ui]);

    const resetSession = useCallback(async () => {
        if (!hasNukeReducer) {
            console.warn("nuke_session reducer is not available in backend module.");
            return;
        }
        ui.resetSessionClock();
        await invokeReducer(nukeSession, undefined, []);
    }, [hasNukeReducer, nukeSession, ui]);

    const togglePauseState = useCallback(async () => {
        if (!hasPauseReducer) {
            console.warn("toggle_pause reducer is not available in backend module.");
            return;
        }
        await invokeReducer(togglePause, undefined, []);
    }, [hasPauseReducer, togglePause]);

    const submitInjection = useCallback(async () => {
        if (!hasInjectReducer) {
            console.warn("inject_belief reducer is not available in generated bindings.");
            return;
        }
        const text = ui.injectionInput.trim();
        if (!text) {
            return;
        }

        ui.recordInjection({
            agentId: ui.injectionAgent,
            text,
            timestamp: toUnixSeconds(),
        });
        ui.setInjectionInput("");

        await invokeReducer(
            injectBelief,
            { agentId: ui.injectionAgent, belief: text },
            [ui.injectionAgent, text],
        );
    }, [hasInjectReducer, injectBelief, ui]);

    const totalConflicts = reasoningLog.filter((entry) => entry.hasConflict).length;
    const avgConfidence =
        reasoningLog.length > 0
            ? reasoningLog.reduce((sum, entry) => sum + Number(entry.confidence || 0), 0) / reasoningLog.length
            : 0;

    const latestByAgent = useMemo(
        () =>
            Object.fromEntries(
                AGENT_IDS.map((agentId) => [agentId, reasoningLog.find((entry) => entry.agentId === agentId)]),
            ),
        [reasoningLog],
    );

    return {
        mode: "live",
        capabilities: {
            canLaunch: hasSpawnReducer,
            canInject: hasInjectReducer,
            canResetSession: hasNukeReducer,
            canPause: hasPauseReducer,
        },
        activeTab: ui.activeTab,
        setActiveTab: ui.setActiveTab,
        launchDraft: ui.launchDraft,
        setLaunchDraft: ui.setLaunchDraft,
        injectionInput: ui.injectionInput,
        setInjectionInput: ui.setInjectionInput,
        injectionAgent: ui.injectionAgent,
        setInjectionAgent: ui.setInjectionAgent,
        injections: ui.injections,
        sessionSeconds: ui.sessionSeconds,
        agents,
        reasoningLog,
        agentMessages,
        sharedContext,
        structuredMemories,
        mem0Memories: ui.mem0Memories,
        memoriesLoading: ui.memoriesLoading,
        refreshMem0Memories: ui.refreshMem0Memories,
        crisis: sharedContextMap.crisis || DEFAULT_CRISIS,
        finalBrief: sharedContextMap.final_brief || "",
        isPaused: sharedContextMap.is_paused === "true",
        isSwarmActive: agents.some((agent) => agent.status === "thinking"),
        totalConflicts,
        avgConfidence,
        latestByAgent,
        launchSwarm,
        resetSession,
        togglePauseState,
        submitInjection,
    };
}

export function useDemoWarroomData() {
    const ui = useSharedUiState();
    const [crisis, setCrisis] = useState(DEFAULT_CRISIS);
    const [finalBrief, setFinalBrief] = useState("");
    const [isPaused, setPaused] = useState(false);
    const [agents, setAgents] = useState(
        AGENT_IDS.map((agentId) => ({
            agentId,
            status: "idle",
            currentTask: "Awaiting launch",
            confidence: 0,
            lastUpdated: toUnixSeconds(),
        })),
    );
    const [reasoningLog, setReasoningLog] = useState([]);
    const [agentMessages, setAgentMessages] = useState([]);
    const [structuredMemories, setStructuredMemories] = useState([]);

    const cycleRef = useRef(0);

    useEffect(() => {
        if (reasoningLog.length < 9) {
            return;
        }

        if (!finalBrief) {
            setFinalBrief(
                "Sequence indicates a dual-track strategy: contain near-term churn with focused retention plays while accelerating trust-centered differentiation to defend long-term positioning.",
            );
        }
    }, [reasoningLog, finalBrief]);

    useEffect(() => {
        if (reasoningLog.length === 0 || isPaused) {
            return;
        }

        const timer = setInterval(() => {
            const now = toUnixSeconds();
            const agentId = AGENT_IDS[cycleRef.current % AGENT_IDS.length];
            const pool = DEMO_REASONING[agentId];
            const sample = pool[cycleRef.current % pool.length];
            cycleRef.current += 1;

            setAgents((current) =>
                current.map((agent) =>
                    agent.agentId === agentId
                        ? {
                            ...agent,
                            status: "thinking",
                            currentTask: "Synthesizing latest signal",
                            lastUpdated: now,
                        }
                        : agent,
                ),
            );

            setTimeout(() => {
                setAgents((current) =>
                    current.map((agent) =>
                        agent.agentId === agentId
                            ? {
                                ...agent,
                                status: "idle",
                                currentTask: "Waiting for next cycle",
                                confidence: sample.confidence,
                                lastUpdated: now,
                            }
                            : agent,
                    ),
                );

                const logEntry = {
                    logId: now,
                    agentId,
                    reasoning: sample.reasoning,
                    decision: sample.decision,
                    confidence: sample.confidence,
                    hasConflict: sample.hasConflict,
                    timestamp: now,
                };
                setReasoningLog((current) => [logEntry, ...current].slice(0, 40));

                setStructuredMemories((current) => [
                    {
                        id: now,
                        source: "session",
                        sourceAgent: agentId,
                        pattern: "competitive-response",
                        insight: sample.reasoning,
                        decision: sample.decision,
                        confidence: sample.confidence,
                        predictedOutcome: "Improved decision confidence across next planning loop.",
                        timestamp: now,
                    },
                    ...current,
                ]);

                if (agentId !== "devils_advocate") {
                    const toAgent = agentId === "scout" ? "strategist" : "devils_advocate";
                    setAgentMessages((current) => [
                        {
                            msgId: now,
                            fromAgent: agentId,
                            toAgent,
                            content: sample.decision,
                            isRead: false,
                            sentAt: now,
                        },
                        ...current,
                    ]);
                }
            }, 1800);
        }, 5200);

        return () => clearInterval(timer);
    }, [isPaused, reasoningLog.length]);

    const launchSwarm = useCallback(async () => {
        setCrisis(ui.launchDraft);
        setFinalBrief("");
        setReasoningLog([]);
        setAgentMessages([]);
        setStructuredMemories([]);
        setPaused(false);
        ui.resetSessionClock();

        const now = toUnixSeconds();
        setAgents((current) =>
            current.map((agent) => ({
                ...agent,
                status: "thinking",
                currentTask: "Analyzing scenario",
                confidence: 0,
                lastUpdated: now,
            })),
        );

        setTimeout(() => {
            setAgents((current) =>
                current.map((agent) => ({
                    ...agent,
                    status: "idle",
                    currentTask: "Streaming analysis",
                    lastUpdated: toUnixSeconds(),
                })),
            );
        }, 1500);
    }, [ui]);

    const submitInjection = useCallback(async () => {
        const text = ui.injectionInput.trim();
        if (!text) {
            return;
        }

        const now = toUnixSeconds();
        ui.recordInjection({
            agentId: ui.injectionAgent,
            text,
            timestamp: now,
        });
        ui.setInjectionInput("");

        setAgentMessages((current) => [
            {
                msgId: now,
                fromAgent: "human",
                toAgent: ui.injectionAgent,
                content: text,
                isRead: false,
                sentAt: now,
            },
            ...current,
        ]);
    }, [ui]);

    const resetSession = useCallback(async () => {
        ui.resetSessionClock();
        setPaused(false);
        setFinalBrief("");
        setReasoningLog([]);
        setAgentMessages([]);
        setStructuredMemories([]);
        setAgents(
            AGENT_IDS.map((agentId) => ({
                agentId,
                status: "idle",
                currentTask: "Awaiting launch",
                confidence: 0,
                lastUpdated: toUnixSeconds(),
            })),
        );
    }, [ui]);

    const togglePauseState = useCallback(async () => {
        setPaused((current) => !current);
    }, []);

    const totalConflicts = reasoningLog.filter((entry) => entry.hasConflict).length;
    const avgConfidence =
        reasoningLog.length > 0
            ? reasoningLog.reduce((sum, entry) => sum + Number(entry.confidence || 0), 0) / reasoningLog.length
            : 0;

    const latestByAgent = useMemo(
        () =>
            Object.fromEntries(
                AGENT_IDS.map((agentId) => [agentId, reasoningLog.find((entry) => entry.agentId === agentId)]),
            ),
        [reasoningLog],
    );

    return {
        mode: "demo",
        capabilities: {
            canLaunch: true,
            canInject: true,
            canResetSession: true,
            canPause: true,
        },
        activeTab: ui.activeTab,
        setActiveTab: ui.setActiveTab,
        launchDraft: ui.launchDraft,
        setLaunchDraft: ui.setLaunchDraft,
        injectionInput: ui.injectionInput,
        setInjectionInput: ui.setInjectionInput,
        injectionAgent: ui.injectionAgent,
        setInjectionAgent: ui.setInjectionAgent,
        injections: ui.injections,
        sessionSeconds: ui.sessionSeconds,
        agents,
        reasoningLog,
        agentMessages,
        sharedContext: [
            { key: "crisis", value: crisis },
            { key: "final_brief", value: finalBrief },
            { key: "is_paused", value: String(isPaused) },
        ],
        structuredMemories,
        mem0Memories: ui.mem0Memories,
        memoriesLoading: ui.memoriesLoading,
        refreshMem0Memories: ui.refreshMem0Memories,
        crisis,
        finalBrief,
        isPaused,
        isSwarmActive: agents.some((agent) => agent.status === "thinking"),
        totalConflicts,
        avgConfidence,
        latestByAgent,
        launchSwarm,
        resetSession,
        togglePauseState,
        submitInjection,
    };
}
