# WARROOM

WARROOM is a real-time AI decision theater for crisis response.

It runs a coordinated swarm of three specialized AI agents:
- Scout: gathers signals and intelligence
- Strategist: proposes an actionable plan
- Devil's Advocate: challenges assumptions and exposes risk

The site visualizes their live state, reasoning stream, message passing, and synthesized final recommendation across multiple cycles.

## What The Site Is

WARROOM is a full-stack system with:
- A Rust SpacetimeDB module (backend logic, state tables, reducers, procedures)
- A React + Vite frontend (interactive dashboard + memory views)
- Gemini API integration (agent reasoning and final synthesis)
- Mem0 integration (long-term memory retrieval + storage)

The frontend is not a static UI. It is a reactive client subscribed to backend table changes through SpacetimeDB. As tables update, the interface updates in real time.

## What The Site Does

At a high level, the system:
1. Accepts a crisis prompt.
2. Launches a swarm execution pipeline.
3. Runs agent thinking in a strict sequence.
4. Logs each reasoning step, decision, and confidence.
5. Surfaces conflicts between agents.
6. Repeats through 3 cycles of deliberation.
7. Produces a final executive brief.
8. Exposes session + long-term memories in the "Swarm Brain" tab.

## How It Works (Detailed)

## 1) Frontend Runtime Modes

The frontend supports two runtime modes:
- Live mode: uses generated Spacetime bindings and real backend subscriptions.
- Demo mode: auto-fallback simulation when live bindings are unavailable.

Mode selection is handled in `client/src/main.jsx` and `client/src/hooks/useWarroomData.js`.

## 2) UI Surfaces

The app has two top-level views:
- Dashboard:
  - Control deck (launch, pause/resume, reset if backend supports it)
  - Signal topology graph (agent network + flow animation)
  - Live reasoning timeline
  - Session intelligence summary
  - Human belief injection panel
- Swarm Brain:
  - Combined memory explorer (session memory + Mem0 memory)
  - Filters by source and agent
  - Memory confidence and active-recall indicators

Main composition entry is `client/src/App.jsx`.

## 3) Backend Data Model

Core public tables consumed by frontend:
- `agent`: live status/task/confidence for each agent
- `reasoning_log`: append-only chain of agent outputs
- `agent_messages`: inter-agent (and human-to-agent) messages
- `shared_context`: shared key-value state such as crisis, cycle, final brief
- `structured_memory`: persisted structured insights per cycle
- `decision_log`: final synthesized outcomes

These are defined in `src/lib.rs` and generated into `client/src/module_bindings`.

## 4) Backend Reducers (Current)

Exposed reducers in current backend build:
- `spawn_swarm(crisis)`
- `inject_belief(agent_id, belief)`
- `mark_read(msg_id)`
- `update_agent_status(agent_id, status)`

Important:
- `toggle_pause` and `nuke_session` are not currently exposed reducers in the generated module.
- Frontend now capability-gates unsupported controls and shows a clear notice rather than failing silently.

## 5) Procedure Execution Pipeline

Main procedures in `src/lib.rs`:
- `pattern_extractor_think`
- `scout_think`
- `strategist_think`
- `devils_think`
- `check_and_write_final_brief`
- `get_mem0_memories`

Execution flow:
1. User launches swarm with `spawn_swarm`.
2. Backend clears prior schedules/logs, stores current crisis, resets cycle state.
3. `pattern_extractor_think` classifies crisis pattern/severity/domain.
4. Schedules `scout_think`, `strategist_think`, and `devils_think` in staggered sequence.
5. Each agent:
   - Reads context and unread messages
   - Pulls relevant Mem0 insights
   - Calls Gemini with role-specific system instruction
   - Writes reasoning + decision + confidence
   - Stores memory and forwards message to next agent
6. `check_and_write_final_brief` runs after each agent cycle:
   - If cycle < 3, schedules next cycle and continues
   - At cycle 3 completion, asks Gemini to synthesize final executive brief
   - Writes final brief to `shared_context[final_brief]` and logs decision

## 6) Live Data Contract To Frontend

Frontend subscribes via `useTable(...)` to backend tables.
Reducers are invoked via `useReducer(...)` wrappers.
Data normalization handles snake_case and camelCase shapes from generated bindings.

The state adapter hook is `client/src/hooks/useWarroomData.js`.

## 7) Styling And Motion Strategy

Frontend stack:
- React 18
- Vite 5
- Tailwind CSS v4
- Framer Motion

Design intent:
- Editorial-tech visual language
- Layered background atmosphere
- Animated topology and feed transitions
- Real-time micro-interactions for confidence, conflict, and status

Global styles are in `client/src/styles.css`.

## Project Structure

```text
waroom/
  src/
    lib.rs                        # SpacetimeDB backend module
  client/
    src/
      App.jsx                     # top-level app composition
      main.jsx                    # live/demo bootstrapping
      hooks/useWarroomData.js     # state adapter (live + demo)
      module_bindings/            # generated Spacetime TS bindings
      components/                 # dashboard/memory/shared UI modules
      styles.css                  # global design tokens + base styling
```

## Prerequisites

- Rust toolchain
- wasm32 target for Rust
- SpacetimeDB CLI (`spacetime`)
- Node.js + npm

## Environment Variables

There are two env contexts:

1) Root `.env` (used at Rust compile/build time):
- `GEMINI_API_KEY`
- `MEM0_API_KEY`
- `GEMINI_MODEL_NAME`

Template is in `.env.example`.

2) Frontend `client/.env` (used by Vite runtime):
- `VITE_STDB_URI`
- `VITE_STDB_DB_NAME`
- Optional: `VITE_MEM0_API_KEY` (for Mem0 fetch in memory tab)

## Setup And Run (Recommended)

## A) Build backend module and generate frontend bindings

From repo root:

### PowerShell
```powershell
# Load .env into current shell
Get-Content .env | ForEach-Object {
  if ($_ -match '^(\w+)=(.+)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
  }
}

cargo build --release --target wasm32-unknown-unknown
spacetime generate --lang typescript --out-dir client/src/module_bindings --bin-path target/wasm32-unknown-unknown/release/warroom.wasm
```

### Bash (Git Bash)
```bash
set -a
. ./.env
set +a

cargo build --release --target wasm32-unknown-unknown
spacetime generate --lang typescript --out-dir client/src/module_bindings --bin-path target/wasm32-unknown-unknown/release/warroom.wasm
```

## B) Publish backend module (if running local backend)

```bash
spacetime publish --server local -y --bin-path target/wasm32-unknown-unknown/release/warroom.wasm warroom
```

## C) Run frontend

From `client/`:

```bash
npm install
npm run dev
```

Open:
- `http://localhost:5173`

## Useful Scripts

In `client/package.json`:
- `npm run dev`
- `npm run build`
- `npm run generate-bindings`

`generate-bindings` currently uses:
- `--bin-path ../target/wasm32-unknown-unknown/release/warroom.wasm`

## Troubleshooting

## Frontend always in demo mode

Cause:
- Generated bindings missing/outdated.

Fix:
1. Build wasm in repo root.
2. Regenerate bindings.
3. Restart Vite server.

## Binding generation fails with module source error

Cause:
- Generating from wrong directory without module path.

Fix:
- Use wasm bin-path generation command (already configured in client script).

## Rust build fails with missing env vars

Cause:
- `env!()` macros in `src/lib.rs` require variables at compile time.

Fix:
- Load root `.env` into shell before `cargo build`.

## Some controls disabled in UI

Cause:
- Current backend module does not expose required reducers (example: pause/reset).

Fix options:
- Add missing reducers in `src/lib.rs`, republish, regenerate bindings.
- Or keep current behavior and use only supported reducers.

## Notes For Contributors

- Do not manually edit generated files in `client/src/module_bindings`.
- Regenerate bindings after backend schema/reducer changes.
- Prefer updating `src/lib.rs` and regenerating rather than patching generated TS.

## Current Status Summary

WARROOM is currently a working real-time swarm intelligence dashboard with:
- Live SpacetimeDB data flow
- Multi-agent reasoning pipeline
- Conflict-aware timeline and topology visualization
- Memory exploration across session and Mem0

The architecture is production-oriented, but feature completeness depends on which reducers are currently exposed in the backend module version you publish.
