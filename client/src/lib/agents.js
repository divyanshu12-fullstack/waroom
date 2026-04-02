export const AGENTS = {
    scout: {
        id: "scout",
        label: "Scout",
        title: "Field Signal Collector",
        icon: "SC",
        color: "var(--agent-scout)",
    },
    strategist: {
        id: "strategist",
        label: "Strategist",
        title: "Decision Architect",
        icon: "ST",
        color: "var(--agent-strategist)",
    },
    devils_advocate: {
        id: "devils_advocate",
        label: "Devil's Advocate",
        title: "Assumption Breaker",
        icon: "DA",
        color: "var(--agent-devils)",
    },
};

export const AGENT_IDS = ["scout", "strategist", "devils_advocate"];

export const MEM0_AGENT_KEYS = {
    scout: "agent_scout",
    strategist: "agent_strategist",
    devils_advocate: "agent_devils_advocate",
};

export function getAgentMeta(agentId) {
    if (!agentId) {
        return {
            id: "unknown",
            label: "Unknown",
            title: "Unidentified",
            icon: "??",
            color: "#9ca3af",
        };
    }

    if (AGENTS[agentId]) {
        return AGENTS[agentId];
    }

    if (agentId in MEM0_AGENT_KEYS) {
        return AGENTS[agentId];
    }

    const normalized = String(agentId).replace("agent_", "");
    return AGENTS[normalized] || {
        id: "unknown",
        label: "Unknown",
        title: "Unidentified",
        icon: "??",
        color: "#9ca3af",
    };
}
