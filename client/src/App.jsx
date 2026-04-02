import { motion } from "framer-motion";
import { ControlDeck } from "./components/dashboard/ControlDeck";
import { AgentConstellation } from "./components/dashboard/AgentConstellation";
import { ReasoningTimeline } from "./components/dashboard/ReasoningTimeline";
import { InsightsRail } from "./components/dashboard/InsightsRail";
import { BeliefInjectionPanel } from "./components/dashboard/BeliefInjectionPanel";
import { MemoryStudio } from "./components/memory/MemoryStudio";
import { hasLiveBindings, useDemoWarroomData, useLiveWarroomData } from "./hooks/useWarroomData";

function TabButton({ active, children, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative rounded-full border px-4 py-2 text-[0.64rem] uppercase tracking-[0.18em]"
      style={{
        borderColor: active ? "rgba(125, 211, 252, 0.55)" : "rgba(148, 163, 184, 0.25)",
        color: active ? "#e0f2fe" : "#94a3b8",
        background: active ? "rgba(12, 74, 110, 0.55)" : "rgba(2, 6, 23, 0.35)",
      }}
    >
      {active ? (
        <motion.span
          layoutId="tabIndicator"
          className="absolute inset-0 -z-10 rounded-full"
          style={{ boxShadow: "0 0 2rem rgba(56, 189, 248, 0.3)" }}
        />
      ) : null}
      {children}
    </motion.button>
  );
}

function DashboardView({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.2fr]">
        <AgentConstellation
          agents={data.agents}
          reasoningLog={data.reasoningLog}
          agentMessages={data.agentMessages}
        />
        <ReasoningTimeline
          reasoningLog={data.reasoningLog}
          finalBrief={data.finalBrief}
          isPaused={data.isPaused}
        />
      </div>

      <InsightsRail
        latestByAgent={data.latestByAgent}
        crisis={data.crisis}
        totalConflicts={data.totalConflicts}
        avgConfidence={data.avgConfidence}
        structuredMemories={data.structuredMemories}
      />

      <BeliefInjectionPanel
        isPaused={data.isPaused}
        canInject={data.capabilities?.canInject}
        injectionAgent={data.injectionAgent}
        setInjectionAgent={data.setInjectionAgent}
        injectionInput={data.injectionInput}
        setInjectionInput={data.setInjectionInput}
        submitInjection={data.submitInjection}
        injections={data.injections}
      />
    </div>
  );
}

export default function App({ forceDemo = false }) {
  const liveMode = hasLiveBindings && !forceDemo;
  const data = liveMode ? useLiveWarroomData() : useDemoWarroomData();

  return (
    <div className="relative min-h-screen overflow-hidden px-4 pb-10 pt-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_78%_14%,rgba(245,158,11,0.16),transparent_34%),radial-gradient(circle_at_44%_82%,rgba(30,41,59,0.7),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-35 mix-blend-screen [background-image:linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:34px_34px]" />

      <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
        <ControlDeck
          mode={data.mode}
          capabilities={data.capabilities}
          agents={data.agents}
          crisis={data.crisis}
          launchDraft={data.launchDraft}
          setLaunchDraft={data.setLaunchDraft}
          sessionSeconds={data.sessionSeconds}
          isSwarmActive={data.isSwarmActive}
          isPaused={data.isPaused}
          onLaunch={data.launchSwarm}
          onReset={data.resetSession}
          onTogglePause={data.togglePauseState}
        />

        <div className="flex flex-wrap gap-2">
          <TabButton active={data.activeTab === "dashboard"} onClick={() => data.setActiveTab("dashboard")}>
            Dashboard
          </TabButton>
          <TabButton active={data.activeTab === "memory"} onClick={() => data.setActiveTab("memory")}>
            Swarm Brain
          </TabButton>
        </div>

        {data.activeTab === "dashboard" ? (
          <DashboardView data={data} />
        ) : (
          <MemoryStudio
            structuredMemories={data.structuredMemories}
            mem0Memories={data.mem0Memories}
            memoriesLoading={data.memoriesLoading}
            refreshMem0Memories={data.refreshMem0Memories}
          />
        )}
      </main>
    </div>
  );
}
