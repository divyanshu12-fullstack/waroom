

use spacetimedb::{table, reducer, ReducerContext, ProcedureContext, Table, ScheduleAt};
use spacetimedb::http::Request;
use std::time::Duration;
use serde_json::Value;

// =============================================================================
// CONSTANTS — loaded from your .env at BUILD TIME via the Rust env!() macro.
// Before running `spacetime publish`, load the .env into your shell:
//
//   PowerShell:  Get-Content .env | ForEach-Object { if ($_ -match '^(\w+)=(.+)$') { [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2]) } }
//   Linux/Mac:   export $(grep -v '^#' .env | xargs)
// =============================================================================

const GEMINI_API_KEY: &str = env!("GEMINI_API_KEY", "Missing env var: GEMINI_API_KEY — load your .env before building");
const MEM0_API_KEY:   &str = env!("MEM0_API_KEY",   "Missing env var: MEM0_API_KEY — load your .env before building");
const GEMINI_URL:     &str = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";
const MEM0_SEARCH_URL: &str = "https://api.mem0.ai/v1/memories/search";
const MEM0_ADD_URL:    &str = "https://api.mem0.ai/v1/memories";

// =============================================================================
// HELPER — unix timestamp in seconds
// =============================================================================

/// Returns the current Unix timestamp in seconds.
/// Used everywhere instead of repeating SystemTime boilerplate.
fn current_timestamp_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// =============================================================================
// TABLE: agents
// Tracks each autonomous agent's live status, task, and confidence score.
// The frontend polls / subscribes to this for the status-indicator panel.
// =============================================================================

#[table(accessor = agent, public)]
pub struct Agent {
    /// Unique agent identifier ("scout", "strategist", "devils_advocate")
    #[primary_key]
    pub agent_id: String,
    /// Role descriptor e.g. "intelligence", "strategy", "critic"
    pub agent_type: String,
    /// "idle" | "thinking" | "error"
    pub status: String,
    /// Short description of what the agent is currently working on
    pub current_task: String,
    /// Last recorded self-reported confidence (0.0 – 1.0)
    pub confidence: f32,
    /// Unix timestamp of last status update
    pub last_updated: u64,
}

// =============================================================================
// TABLE: reasoning_log
// Append-only log of every reasoning cycle. The React dashboard streams this
// table to render the scrolling thought panels.
// =============================================================================

#[table(accessor = reasoning_log, public)]
pub struct ReasoningLog {
    #[primary_key]
    #[auto_inc]
    pub log_id: u64,
    /// Which agent produced this entry
    pub agent_id: String,
    /// Full chain-of-thought from the LLM response
    pub reasoning: String,
    /// Key finding / recommendation / counter-argument
    pub decision: String,
    /// Self-reported confidence for this cycle
    pub confidence: f32,
    /// True when Devil's Advocate disagrees strongly with Strategist
    pub has_conflict: bool,
    /// Unix timestamp when this entry was written
    pub timestamp: u64,
}

// =============================================================================
// TABLE: agent_messages
// Inter-agent message bus. Agents post messages here; recipients read and mark
// them as read. Also used by the human "inject belief" feature.
// =============================================================================

#[derive(Clone)]
#[table(accessor = agent_messages, public)]
pub struct AgentMessage {
    #[primary_key]
    #[auto_inc]
    pub msg_id: u64,
    /// Sender agent id (or "human" for injected beliefs)
    pub from_agent: String,
    /// Recipient agent id
    pub to_agent: String,
    /// Message payload
    pub content: String,
    /// False until the recipient procedure reads it
    pub is_read: bool,
    /// Unix timestamp of send
    pub sent_at: u64,
}

// =============================================================================
// TABLE: shared_context
// Key-value store for facts that all agents can read. Starts with the crisis
// description; can be extended by any agent or human operator.
// =============================================================================

#[table(accessor = shared_context, public)]
pub struct SharedContext {
    #[primary_key]
    pub key: String,
    pub value: String,
    pub updated_at: u64,
}

// =============================================================================
// SCHEDULE TABLES — one per agent
// Each scheduled row fires its linked procedure every 30 seconds.
// =============================================================================

/// Drives Scout's 30-second think cycle.
#[table(accessor = scout_schedule, scheduled(scout_think))]
pub struct ScoutSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Drives Strategist's 30-second think cycle.
#[table(accessor = strategist_schedule, scheduled(strategist_think))]
pub struct StrategistSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Drives Devil's Advocate's 30-second think cycle.
#[table(accessor = devils_schedule, scheduled(devils_think))]
pub struct DevilsSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

// =============================================================================
// REDUCER: init
// Runs exactly once when the module is first published to SpacetimeDB.
// Seeds the database with three agent rows, the default crisis, and the first
// scheduled tick for each agent cycle.
// =============================================================================

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let now = current_timestamp_secs();

    // -------------------------------------------------------------------------
    // Insert the three autonomous agents
    // -------------------------------------------------------------------------
    ctx.db.agent().insert(Agent {
        agent_id:     "scout".to_string(),
        agent_type:   "intelligence".to_string(),
        status:       "idle".to_string(),
        current_task: "Awaiting crisis".to_string(),
        confidence:   0.0,
        last_updated: now,
    });

    ctx.db.agent().insert(Agent {
        agent_id:     "strategist".to_string(),
        agent_type:   "strategy".to_string(),
        status:       "idle".to_string(),
        current_task: "Awaiting intelligence briefing".to_string(),
        confidence:   0.0,
        last_updated: now,
    });

    ctx.db.agent().insert(Agent {
        agent_id:     "devils_advocate".to_string(),
        agent_type:   "critic".to_string(),
        status:       "idle".to_string(),
        current_task: "Awaiting recommendation to challenge".to_string(),
        confidence:   0.0,
        last_updated: now,
    });

    // -------------------------------------------------------------------------
    // Seed the default crisis scenario into shared_context
    // -------------------------------------------------------------------------
    ctx.db.shared_context().insert(SharedContext {
        key:        "crisis".to_string(),
        value:      "A major competitor just launched a product at 40% lower price than ours. \
                     We have 2 hours to decide our response.".to_string(),
        updated_at: now,
    });

    // -------------------------------------------------------------------------
    // Schedule each agent's first cycle to fire in 30 seconds
    // -------------------------------------------------------------------------
    let interval = ScheduleAt::from(Duration::from_secs(30));

    ctx.db.scout_schedule().insert(ScoutSchedule {
        scheduled_id: 0,
        scheduled_at: interval.clone(),
    });

    ctx.db.strategist_schedule().insert(StrategistSchedule {
        scheduled_id: 0,
        scheduled_at: interval.clone(),
    });

    ctx.db.devils_schedule().insert(DevilsSchedule {
        scheduled_id: 0,
        scheduled_at: interval,
    });

    log::info!("[warroom] init complete — swarm standing by");
}

// =============================================================================
// REDUCER: spawn_swarm
// Called by the React dashboard's "LAUNCH SWARM" button.
// Updates the crisis text and flips all three agents to "thinking".
// =============================================================================

#[reducer]
pub fn spawn_swarm(ctx: &ReducerContext, crisis: String) {
    let now = current_timestamp_secs();

    // Delete-then-reinsert pattern for primary-key upsert
    ctx.db.shared_context().key().delete("crisis".to_string());
    ctx.db.shared_context().insert(SharedContext {
        key:        "crisis".to_string(),
        value:      crisis.clone(),
        updated_at: now,
    });

    // Set all agents to "thinking" so the frontend status indicators update
    for agent_id in &["scout", "strategist", "devils_advocate"] {
        if ctx.db.agent().agent_id().find(agent_id.to_string()).is_some() {
            ctx.db.agent().agent_id().delete(agent_id.to_string());
            ctx.db.agent().insert(Agent {
                status:       "thinking".to_string(),
                current_task: format!("Processing crisis: {}", &crisis[..crisis.len().min(60)]),
                last_updated: now,
                ..Agent {
                    agent_id:     agent_id.to_string(),
                    agent_type:   match *agent_id {
                        "scout"           => "intelligence".to_string(),
                        "strategist"      => "strategy".to_string(),
                        "devils_advocate" => "critic".to_string(),
                        _                 => "unknown".to_string(),
                    },
                    status:       String::new(), // overridden above
                    current_task: String::new(), // overridden above
                    confidence:   0.0,
                    last_updated: 0,
                }
            });
        }
    }

    log::info!("[warroom] swarm launched — crisis: {}", &crisis[..crisis.len().min(80)]);
}

// =============================================================================
// REDUCER: inject_belief
// Human operator injects a belief or hint directly into an agent's message
// inbox. The agent will pick it up on the next think cycle.
// =============================================================================

#[reducer]
pub fn inject_belief(ctx: &ReducerContext, agent_id: String, belief: String) {
    ctx.db.agent_messages().insert(AgentMessage {
        msg_id:     0,
        from_agent: "human".to_string(),
        to_agent:   agent_id.clone(),
        content:    belief,
        is_read:    false,
        sent_at:    current_timestamp_secs(),
    });

    log::info!("[warroom] belief injected for agent: {}", agent_id);
}

// =============================================================================
// REDUCER: mark_read
// Marks an inter-agent message as read. Called by procedures after consuming
// a message, and also exposed for the dashboard to acknowledge human messages.
// =============================================================================

#[reducer]
pub fn mark_read(ctx: &ReducerContext, msg_id: u64) {
    if let Some(msg) = ctx.db.agent_messages().msg_id().find(msg_id) {
        let updated = AgentMessage { is_read: true, ..msg };
        ctx.db.agent_messages().msg_id().delete(msg_id);
        ctx.db.agent_messages().insert(updated);
    }
}

// =============================================================================
// REDUCER: update_agent_status
// Internal helper reducer. Procedures call this (via ctx.with_tx) to flip
// an agent's status field without duplicating delete-and-reinsert logic.
// =============================================================================

#[reducer]
pub fn update_agent_status(ctx: &ReducerContext, agent_id: String, status: String) {
    let now = current_timestamp_secs();
    if let Some(agent) = ctx.db.agent().agent_id().find(&agent_id) {
        let updated = Agent {
            status,
            last_updated: now,
            ..agent
        };
        ctx.db.agent().agent_id().delete(&agent_id);
        ctx.db.agent().insert(updated);
    }
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/// Build a Gemini generateContent JSON body from a user prompt and a system
/// instruction string.  Returns the serialized JSON bytes.
fn build_gemini_request(prompt: &str, system_instruction: &str) -> Vec<u8> {
    let body = serde_json::json!({
        "contents": [{
            "role": "user",
            "parts": [{ "text": prompt }]
        }],
        "systemInstruction": {
            "parts": [{ "text": system_instruction }]
        },
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    });
    body.to_string().into_bytes()
}

/// Build a Mem0 memory-search request body.
fn build_mem0_search_body(query: &str, user_id: &str) -> Vec<u8> {
    serde_json::json!({
        "query": query,
        "user_id": user_id,
        "limit": 5
    })
    .to_string()
    .into_bytes()
}

/// Build a Mem0 memory-add request body.
fn build_mem0_add_body(content: &str, user_id: &str) -> Vec<u8> {
    serde_json::json!({
        "messages": [{ "role": "assistant", "content": content }],
        "user_id": user_id
    })
    .to_string()
    .into_bytes()
}

/// Extract the text payload from a Gemini response.
/// Path: `candidates[0].content.parts[0].text`
fn extract_gemini_text(raw: &str) -> Option<String> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let text = v["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()?
        .to_string();
    Some(text)
}

// =============================================================================
// PROCEDURE: scout_think
// Fires every 30 seconds via ScoutSchedule.
// Gathers intelligence by querying Mem0 for context, asking Gemini to analyse
// the crisis, then persisting results and sending a briefing to Strategist.
// =============================================================================

#[spacetimedb::procedure]
fn scout_think(ctx: &mut ProcedureContext, _arg: ScoutSchedule) {
    log::info!("[scout] think cycle starting");

    // -------------------------------------------------------------------------
    // STEP 1 — Read current state from the database
    // -------------------------------------------------------------------------
    let (crisis_text, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        // Read crisis from shared_context
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        // Collect unread messages addressed to "scout"
        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "scout" && !m.is_read)
            .collect();

        // Fetch the scout agent row (for context / logging)
        let agent = tx_ctx.db.agent().agent_id().find("scout".to_owned());

        (crisis, msgs, agent)
    });

    // Mark unread messages as read
    ctx.with_tx(|tx_ctx| {
        for msg in &unread_msgs {
            let updated = AgentMessage { is_read: true, ..(*msg).clone() };
            tx_ctx.db.agent_messages().msg_id().delete(msg.msg_id);
            tx_ctx.db.agent_messages().insert(updated);
        }
    });

    // Format messages for the prompt
    let msgs_text = if unread_msgs.is_empty() {
        "No new messages".to_string()
    } else {
        unread_msgs
            .iter()
            .map(|m| format!("From {}: {}", m.from_agent, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    };

    // -------------------------------------------------------------------------
    // STEP 2 — Retrieve relevant memories from Mem0
    // -------------------------------------------------------------------------
    use spacetimedb::http::Request;

    let mem0_body = build_mem0_search_body(&crisis_text, "agent_scout");
    let mem0_response_text = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(MEM0_SEARCH_URL)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Token {}", MEM0_API_KEY))
            .body(mem0_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[scout] Mem0 search failed: {:?}", e);
            String::new()
        }
    };

    // -------------------------------------------------------------------------
    // STEP 3 — Call Gemini for intelligence analysis
    // -------------------------------------------------------------------------
    let system_instruction = "You are Scout, an elite intelligence gathering agent in a crisis \
        response AI swarm. Your role is to find facts, signals, market data, and evidence \
        relevant to the crisis. Be specific, analytical, and data-driven. \
        You must respond ONLY in valid JSON with exactly these keys: \
        reasoning (string - your detailed analysis), \
        decision (string - your key finding or recommended next investigation), \
        confidence (float between 0.0 and 1.0), \
        memory_to_store (string - the single most important fact to remember), \
        message_to_strategist (string - intelligence briefing for Strategist agent)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         YOUR MEMORIES FROM PREVIOUS CYCLES:\n{mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Analyze the crisis. Provide your intelligence report."
    );

    let gemini_url = format!("{}?key={}", GEMINI_URL, GEMINI_API_KEY);
    let gemini_body = build_gemini_request(&prompt, system_instruction);

    let gemini_raw = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(&gemini_url)
            .header("Content-Type", "application/json")
            .body(gemini_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[scout] Gemini call failed: {:?}", e);
            // Gracefully write a failure log entry and bail
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "scout".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    current_timestamp_secs(),
                });
            });
            return;
        }
    };

    // -------------------------------------------------------------------------
    // STEP 4 — Parse Gemini response
    // -------------------------------------------------------------------------
    let parsed_text = extract_gemini_text(&gemini_raw).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&parsed_text).unwrap_or_else(|e| {
        log::error!("[scout] JSON parse error: {:?}", e);
        serde_json::json!({
            "reasoning": "Failed to parse Gemini response",
            "decision": "",
            "confidence": 0.0,
            "memory_to_store": "",
            "message_to_strategist": ""
        })
    });

    let reasoning            = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision             = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence           = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let memory_to_store      = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    let message_to_strategist = parsed["message_to_strategist"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store the most important fact in Mem0
    // -------------------------------------------------------------------------
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_scout");
        if let Err(e) = ctx.http.send(
            Request::builder()
                .method("POST")
                .uri(MEM0_ADD_URL)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Token {}", MEM0_API_KEY))
                .body(mem0_add_body)
                .unwrap(),
        ) {
            log::error!("[scout] Mem0 add failed: {:?}", e);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 6 — Persist results to the database
    // -------------------------------------------------------------------------
    ctx.with_tx(|tx_ctx| {
        let now = current_timestamp_secs();

        // Append reasoning log entry
        tx_ctx.db.reasoning_log().insert(ReasoningLog {
            log_id:       0,
            agent_id:     "scout".to_string(),
            reasoning:    reasoning.clone(),
            decision:     decision.clone(),
            confidence,
            has_conflict: false,
            timestamp:    now,
        });

        // Send intelligence briefing to Strategist
        if !message_to_strategist.is_empty() {
            tx_ctx.db.agent_messages().insert(AgentMessage {
                msg_id:     0,
                from_agent: "scout".to_string(),
                to_agent:   "strategist".to_string(),
                content:    message_to_strategist.clone(),
                is_read:    false,
                sent_at:    now,
            });
        }

        // Update agent status back to idle with latest confidence
        if let Some(agent) = tx_ctx.db.agent().agent_id().find("scout".to_owned()) {
            let updated = Agent {
                status:       "idle".to_string(),
                confidence,
                last_updated: now,
                ..agent
            };
            tx_ctx.db.agent().agent_id().delete("scout".to_owned());
            tx_ctx.db.agent().insert(updated);
        }
    });

    log::info!("[scout] think cycle complete — confidence: {:.2}", confidence);
}

// =============================================================================
// PROCEDURE: strategist_think
// Fires every 30 seconds via StrategistSchedule.
// Synthesises Scout's intelligence into a clear recommendation, then sends it
// to Devil's Advocate for scrutiny.
// =============================================================================

#[spacetimedb::procedure]
fn strategist_think(ctx: &mut ProcedureContext, _arg: StrategistSchedule) {
    log::info!("[strategist] think cycle starting");

    // -------------------------------------------------------------------------
    // STEP 1 — Read state
    // -------------------------------------------------------------------------
    let (crisis_text, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "strategist" && !m.is_read)
            .collect();

        let agent = tx_ctx.db.agent().agent_id().find("strategist".to_owned());
        (crisis, msgs, agent)
    });

    ctx.with_tx(|tx_ctx| {
        for msg in &unread_msgs {
            let updated = AgentMessage { is_read: true, ..(*msg).clone() };
            tx_ctx.db.agent_messages().msg_id().delete(msg.msg_id);
            tx_ctx.db.agent_messages().insert(updated);
        }
    });

    let msgs_text = if unread_msgs.is_empty() {
        "No new messages".to_string()
    } else {
        unread_msgs
            .iter()
            .map(|m| format!("From {}: {}", m.from_agent, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    };

    // -------------------------------------------------------------------------
    // STEP 2 — Mem0 memory retrieval
    // -------------------------------------------------------------------------
    use spacetimedb::http::Request;

    let mem0_body = build_mem0_search_body(&crisis_text, "agent_strategist");
    let mem0_response_text = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(MEM0_SEARCH_URL)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Token {}", MEM0_API_KEY))
            .body(mem0_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[strategist] Mem0 search failed: {:?}", e);
            String::new()
        }
    };

    // -------------------------------------------------------------------------
    // STEP 3 — Gemini decision synthesis
    // -------------------------------------------------------------------------
    let system_instruction = "You are Strategist, a decision synthesis agent in a crisis response \
        AI swarm. You receive intelligence from Scout and challenges from Devil's Advocate. \
        Your role is to form clear, actionable recommendations. Be decisive but consider all angles. \
        You must respond ONLY in valid JSON with exactly these keys: \
        reasoning (string), \
        decision (string - your specific recommendation), \
        confidence (float 0.0-1.0), \
        memory_to_store (string), \
        message_to_devils_advocate (string - present your recommendation for scrutiny)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         YOUR MEMORIES FROM PREVIOUS CYCLES:\n{mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Synthesise the intelligence and provide your recommendation."
    );

    let gemini_url = format!("{}?key={}", GEMINI_URL, GEMINI_API_KEY);
    let gemini_body = build_gemini_request(&prompt, system_instruction);

    let gemini_raw = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(&gemini_url)
            .header("Content-Type", "application/json")
            .body(gemini_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[strategist] Gemini call failed: {:?}", e);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "strategist".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    current_timestamp_secs(),
                });
            });
            return;
        }
    };

    // -------------------------------------------------------------------------
    // STEP 4 — Parse Gemini response
    // -------------------------------------------------------------------------
    let parsed_text = extract_gemini_text(&gemini_raw).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&parsed_text).unwrap_or_else(|e| {
        log::error!("[strategist] JSON parse error: {:?}", e);
        serde_json::json!({
            "reasoning": "Failed to parse Gemini response",
            "decision": "",
            "confidence": 0.0,
            "memory_to_store": "",
            "message_to_devils_advocate": ""
        })
    });

    let reasoning                 = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision                  = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence                = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let memory_to_store           = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    let message_to_devils_advocate = parsed["message_to_devils_advocate"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store memory in Mem0
    // -------------------------------------------------------------------------
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_strategist");
        if let Err(e) = ctx.http.send(
            Request::builder()
                .method("POST")
                .uri(MEM0_ADD_URL)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Token {}", MEM0_API_KEY))
                .body(mem0_add_body)
                .unwrap(),
        ) {
            log::error!("[strategist] Mem0 add failed: {:?}", e);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 6 — Persist results
    // -------------------------------------------------------------------------
    ctx.with_tx(|tx_ctx| {
        let now = current_timestamp_secs();

        tx_ctx.db.reasoning_log().insert(ReasoningLog {
            log_id:       0,
            agent_id:     "strategist".to_string(),
            reasoning:    reasoning.clone(),
            decision:     decision.clone(),
            confidence,
            has_conflict: false,
            timestamp:    now,
        });

        if !message_to_devils_advocate.is_empty() {
            tx_ctx.db.agent_messages().insert(AgentMessage {
                msg_id:     0,
                from_agent: "strategist".to_string(),
                to_agent:   "devils_advocate".to_string(),
                content:    message_to_devils_advocate.clone(),
                is_read:    false,
                sent_at:    now,
            });
        }

        if let Some(agent) = tx_ctx.db.agent().agent_id().find("strategist".to_owned()) {
            let updated = Agent {
                status:       "idle".to_string(),
                confidence,
                last_updated: now,
                ..agent
            };
            tx_ctx.db.agent().agent_id().delete("strategist".to_owned());
            tx_ctx.db.agent().insert(updated);
        }
    });

    log::info!("[strategist] think cycle complete — confidence: {:.2}", confidence);
}

// =============================================================================
// PROCEDURE: devils_think
// Fires every 30 seconds via DevilsSchedule.
// Stress-tests Strategist's recommendation. Sets has_conflict=true when it
// finds serious flaws, and sends a challenge back to Strategist.
// =============================================================================

#[spacetimedb::procedure]
fn devils_think(ctx: &mut ProcedureContext, _arg: DevilsSchedule) {
    log::info!("[devils_advocate] think cycle starting");

    // -------------------------------------------------------------------------
    // STEP 1 — Read state
    // -------------------------------------------------------------------------
    let (crisis_text, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "devils_advocate" && !m.is_read)
            .collect();

        let agent = tx_ctx.db.agent().agent_id().find("devils_advocate".to_owned());
        (crisis, msgs, agent)
    });

    ctx.with_tx(|tx_ctx| {
        for msg in &unread_msgs {
            let updated = AgentMessage { is_read: true, ..(*msg).clone() };
            tx_ctx.db.agent_messages().msg_id().delete(msg.msg_id);
            tx_ctx.db.agent_messages().insert(updated);
        }
    });

    let msgs_text = if unread_msgs.is_empty() {
        "No new messages".to_string()
    } else {
        unread_msgs
            .iter()
            .map(|m| format!("From {}: {}", m.from_agent, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    };

    // -------------------------------------------------------------------------
    // STEP 2 — Mem0 memory retrieval
    // -------------------------------------------------------------------------
    let mem0_body = build_mem0_search_body(&crisis_text, "agent_devils_advocate");
    let mem0_response_text = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(MEM0_SEARCH_URL)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Token {}", MEM0_API_KEY))
            .body(mem0_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[devils_advocate] Mem0 search failed: {:?}", e);
            String::new()
        }
    };

    // -------------------------------------------------------------------------
    // STEP 3 — Gemini critical challenge
    // -------------------------------------------------------------------------
    let system_instruction = "You are Devil's Advocate, a critical challenge agent in a crisis \
        response AI swarm. Your job is to stress-test every recommendation from Strategist and \
        find weaknesses, risks, or overlooked factors. Be rigorous and skeptical. \
        If you strongly disagree with Strategist's recommendation, set has_conflict to true. \
        You must respond ONLY in valid JSON with exactly these keys: \
        reasoning (string), \
        decision (string - your counter-argument or alternative), \
        confidence (float 0.0-1.0), \
        memory_to_store (string), \
        has_conflict (boolean), \
        challenge_to_strategist (string)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         YOUR MEMORIES FROM PREVIOUS CYCLES:\n{mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Challenge the current strategy. Find weaknesses and risks."
    );

    let gemini_url = format!("{}?key={}", GEMINI_URL, GEMINI_API_KEY);
    let gemini_body = build_gemini_request(&prompt, system_instruction);

    let gemini_raw = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(&gemini_url)
            .header("Content-Type", "application/json")
            .body(gemini_body)
            .unwrap(),
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[devils_advocate] Gemini call failed: {:?}", e);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "devils_advocate".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    current_timestamp_secs(),
                });
            });
            return;
        }
    };

    // -------------------------------------------------------------------------
    // STEP 4 — Parse Gemini response
    // -------------------------------------------------------------------------
    let parsed_text = extract_gemini_text(&gemini_raw).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&parsed_text).unwrap_or_else(|e| {
        log::error!("[devils_advocate] JSON parse error: {:?}", e);
        serde_json::json!({
            "reasoning": "Failed to parse Gemini response",
            "decision": "",
            "confidence": 0.0,
            "memory_to_store": "",
            "has_conflict": false,
            "challenge_to_strategist": ""
        })
    });

    let reasoning              = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision               = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence             = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let memory_to_store        = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    // has_conflict comes directly from the LLM — Devil's Advocate controls this flag
    let has_conflict           = parsed["has_conflict"].as_bool().unwrap_or(false);
    let challenge_to_strategist = parsed["challenge_to_strategist"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store memory in Mem0
    // -------------------------------------------------------------------------
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_devils_advocate");
        if let Err(e) = ctx.http.send(
            Request::builder()
                .method("POST")
                .uri(MEM0_ADD_URL)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Token {}", MEM0_API_KEY))
                .body(mem0_add_body)
                .unwrap(),
        ) {
            log::error!("[devils_advocate] Mem0 add failed: {:?}", e);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 6 — Persist results (including the LLM-controlled has_conflict flag)
    // -------------------------------------------------------------------------
    ctx.with_tx(|tx_ctx| {
        let now = current_timestamp_secs();

        // Log entry — note has_conflict is set from the parsed LLM response
        tx_ctx.db.reasoning_log().insert(ReasoningLog {
            log_id: 0,
            agent_id: "devils_advocate".to_string(),
            reasoning: reasoning.clone(),
            decision:  decision.clone(),
            confidence,
            has_conflict, // ← direct from Gemini JSON
            timestamp: now,
        });

        // Send challenge back to Strategist
        if !challenge_to_strategist.is_empty() {
            tx_ctx.db.agent_messages().insert(AgentMessage {
                msg_id:     0,
                from_agent: "devils_advocate".to_string(),
                to_agent:   "strategist".to_string(),
                content:    challenge_to_strategist.clone(),
                is_read:    false,
                sent_at:    now,
            });
        }

        // Update agent status
        if let Some(agent) = tx_ctx.db.agent().agent_id().find("devils_advocate".to_owned()) {
            let updated = Agent {
                status:       "idle".to_string(),
                confidence,
                last_updated: now,
                ..agent
            };
            tx_ctx.db.agent().agent_id().delete("devils_advocate".to_owned());
            tx_ctx.db.agent().insert(updated);
        }
    });

    log::info!(
        "[devils_advocate] think cycle complete — confidence: {:.2}, conflict: {}",
        confidence,
        has_conflict
    );
}
