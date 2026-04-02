# Warroom Hackathon Plan (Feature + UI Expansion)

## 1. Context for This Plan

This roadmap assumes core setup and environment issues are already resolved in your main working branch.
The focus here is what to build next so Warroom feels like a true hackathon finalist product.

## 2. Product Direction

Warroom should evolve from a cool real-time dashboard into a decision theater:
- A place where people can run high-stakes scenarios.
- Watch AI agents debate in public.
- Get a structured action plan with trade-offs.
- Compare strategies before committing.

## 3. What to Add Next (Priority Order)

## P1 - Product Features That Raise Demo Impact

### 3.1 Scenario Command Center
- [ ] Add a scenario library with one-click templates:
  - Price war
  - Data breach
  - PR backlash
  - Vendor outage
  - Regulatory change
- [ ] Add scenario parameters panel:
  - urgency (30 min / 2 hr / 24 hr)
  - budget limits
  - risk appetite
  - brand sensitivity
  - target customer segment
- [ ] Add scenario difficulty presets:
  - easy (more information)
  - realistic (partial information)
  - adversarial (conflicting information)

### 3.2 Decision Quality Features
- [ ] Upgrade final output into a structured war plan:
  - recommended strategy
  - two alternatives
  - biggest risks
  - mitigation checklist
  - first 24-hour execution steps
  - confidence and uncertainty notes
- [ ] Add evidence-backed decisions:
  - each recommendation links to which agent logs influenced it
  - show confidence spread across agents
- [ ] Add what-if simulator:
  - "What if we cut price by 15%?"
  - "What if we delay response by 48 hours?"
  - show projected outcome deltas

### 3.3 Add Agent Specialization (beyond current 3)
- [ ] Add a Finance agent:
  - estimates revenue, margin, burn impact of each strategy
- [ ] Add a PR/Risk agent:
  - reputational and legal risk checks
- [ ] Add an Ops agent:
  - feasibility checks for timeline and execution constraints
- [ ] Add agent voting mode:
  - each agent scores each plan from 1-10
  - weighted aggregate shown in final brief

## P2 - UI/UX Changes (Major)

### 3.4 Information Architecture Upgrade
- [ ] Split dashboard into 4 tabs:
  - Live Warroom
  - Scenario Builder
  - Decision Report
  - History and Replay
- [ ] Keep current single-screen mode as "Live" tab for dramatic demos.

### 3.5 Visual Hierarchy and Readability
- [ ] Redesign panel density so key insight is never buried.
- [ ] Introduce clear "primary signal" zone:
  - current crisis objective
  - active strategy
  - top conflict right now
- [ ] Use layered emphasis:
  - high priority in bright tones
  - supporting details muted
  - logs collapsible by default

### 3.6 Motion and Storytelling
- [ ] Add animated cycle timeline:
  - cycle start
  - each agent output
  - conflict spikes
  - final convergence
- [ ] Add conflict pulse visual on node graph (not just text badge).
- [ ] Add strategy shift animation:
  - when Strategist changes recommendation after challenge

### 3.7 Better Human Control UX
- [ ] Replace plain "Inject belief" with intervention cards:
  - force stress-test
  - ask for conservative variant
  - ask for aggressive variant
  - prioritize speed over accuracy
- [ ] Add intervention history with outcomes:
  - what was injected
  - which agent adapted
  - how final plan changed

### 3.8 Responsive and Presentation Modes
- [ ] Build responsive breakpoints for laptop and mobile.
- [ ] Add pitch mode:
  - larger typography
  - reduced debug noise
  - cinematic graph focus
- [ ] Add operator mode:
  - denser logs and controls for power users

## P3 - Longitudinal Intelligence Features

### 3.9 Session Replay and Comparison
- [ ] Save every run with metadata.
- [ ] Add replay controls:
  - scrubber by timestamp
  - play/pause at event level
- [ ] Add compare mode:
  - Scenario A vs Scenario B
  - Strategy A vs Strategy B on same scenario

### 3.10 Learning Memory Layer
- [ ] Add memory quality scoring:
  - useful / outdated / conflicting
- [ ] Build pattern heatmap:
  - which crisis patterns appear most
  - which strategies historically perform best
- [ ] Add "lessons learned" card generated after each run

### 3.11 Explainability Features
- [ ] Add "Why this recommendation?" panel.
- [ ] Add "What could go wrong?" auto-generated failure modes.
- [ ] Add confidence decomposition:
  - model confidence
  - evidence confidence
  - assumption risk

## P4 - Hackathon Packaging Features

### 3.12 Demo Experience
- [ ] Add guided onboarding flow:
  - 3-step first-run wizard for judges
- [ ] Add sample scenarios preloaded for instant demo.
- [ ] Add one-click "Run cinematic demo" mode.

### 3.13 Output and Sharing
- [ ] Export decision report to PDF.
- [ ] Export run summary JSON for technical judges.
- [ ] Add shareable "Run ID" snapshot in UI.

### 3.14 Team Collaboration
- [ ] Multi-viewer mode (read-only observers).
- [ ] Analyst notes attached to timeline events.
- [ ] Decision approval workflow (draft -> review -> approved).

## 4. File-Level Expansion Plan

### Frontend
- [ ] client/src/App.jsx
  - Break into modules:
    - HeaderBar
    - CrisisControlPanel
    - AgentGraph
    - LiveReasoningFeed
    - DecisionReportPanel
    - ReplayTimeline
- [ ] client/src/App.css
  - Add tokenized spacing and typography scales.
  - Add responsive layouts and pitch/operator mode themes.
- [ ] client/src/main.jsx
  - Add app-level route/tab state and mode switching.

### Backend
- [ ] src/lib.rs
  - Add richer run/session tables (run metadata, scenario params, outcome metrics).
  - Add replay-friendly event records.
  - Add additional agent reducers/procedures (finance, PR/risk, ops).

### New files to introduce
- [ ] client/src/components/*
- [ ] client/src/features/scenario-builder/*
- [ ] client/src/features/replay/*
- [ ] client/src/features/reporting/*
- [ ] docs/demo-script.md
- [ ] docs/architecture.md

## 5. Suggested 48-Hour Hackathon Build Schedule

## Block 1 (Hour 0-10): Feature Foundation
- [ ] Scenario Builder panel + templates
- [ ] Structured final report panel
- [ ] Intervention cards v1

## Block 2 (Hour 10-22): UI Transformation
- [ ] 4-tab IA layout
- [ ] Visual hierarchy cleanup
- [ ] Timeline + conflict pulse animations

## Block 3 (Hour 22-34): Intelligence Depth
- [ ] Add one new specialist agent (Finance first)
- [ ] Add compare mode (basic)
- [ ] Add replay storage and scrubber

## Block 4 (Hour 34-48): Demo Packaging
- [ ] Pitch mode polish
- [ ] PDF export
- [ ] Guided onboarding + final rehearsal

## 6. Definition of Done for a Hackathon-Level Submission

- [ ] Judge can run a scenario and get a clear report in under 90 seconds.
- [ ] UI has distinct modes (live + report + replay), not just one dashboard screen.
- [ ] At least one specialist agent is added beyond the original trio.
- [ ] Final plan includes alternatives, risks, and mitigation, not a single generic answer.
- [ ] Session replay works for at least one saved run.
- [ ] Demo feels intentional, polished, and story-driven end-to-end.

## 7. Recommended Immediate Build Order

1. Build Scenario Builder + structured Decision Report first.
2. Redesign Live tab hierarchy so key signals are impossible to miss.
3. Add one specialist agent (Finance) to prove extensibility.
4. Add Replay + Compare to show product depth beyond a one-shot demo.
5. Finish with pitch mode and polished 3-minute story flow.
