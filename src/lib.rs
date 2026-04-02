

use spacetimedb::{table, reducer, ReducerContext, ProcedureContext, Table, ScheduleAt};
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
const GEMINI_MODEL_NAME: &str = env!("GEMINI_MODEL_NAME", "Missing env var: GEMINI_MODEL_NAME — load your .env before building");
const GEMINI_URL:     &str = "https://generativelanguage.googleapis.com/v1beta/models/";
const MEM0_SEARCH_URL: &str = "https://api.mem0.ai/v1/memories/search/";
const MEM0_ADD_URL:    &str = "https://api.mem0.ai/v1/memories/";

// =============================================================================
// HELPER — unix timestamp in seconds
// =============================================================================

macro_rules! current_timestamp_secs {
    ($ctx:expr) => {
        ($ctx.timestamp.to_micros_since_unix_epoch() as u64) / 1_000_000
    };
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
// TABLE: structured_memory
// Advanced hybrid semantic+structured memory of an agent's insights.
// =============================================================================

#[table(accessor = structured_memory, public)]
pub struct StructuredMemory {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pattern: String,
    pub insight: String,
    pub decision: String,
    pub confidence: f32,
    pub predicted_outcome: String,
    pub source_agent: String,
    pub timestamp: u64,
}

// =============================================================================
// TABLE: decision_log
// Final synthesis outcomes for pattern learning feedback loops.
// =============================================================================

#[table(accessor = decision_log, public)]
pub struct DecisionLog {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pattern: String,
    pub decision: String,
    pub reasoning_summary: String,
    pub confidence: f32,
    pub predicted_outcome: String,
    pub timestamp: u64,
}

// =============================================================================
// TABLE: agent_messages

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
    /// Key for the shared context
    #[primary_key]
    pub key: String,
    /// Value for the shared context
    pub value: String,
    /// Timestamp for when the shared context was last updated
    pub updated_at: u64,
}

// =============================================================================
// SCHEDULE TABLES — one per agent
// Each scheduled row fires its linked procedure every 30 seconds.
// =============================================================================

/// Pre-flight classification.
#[table(accessor = pattern_extractor_schedule, scheduled(pattern_extractor_think))]
pub struct PatternExtractorSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

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
    let now = current_timestamp_secs!(ctx);

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
    // The swarm schedule is no longer seeded here. It is exclusively triggered
    // once by spawn_swarm.
    // -------------------------------------------------------------------------

    log::info!("[warroom] init complete — swarm standing by");
}

// =============================================================================
// REDUCER: spawn_swarm
// Called by the React dashboard's "LAUNCH SWARM" button.
// Updates the crisis text and flips all three agents to "thinking".
// =============================================================================

#[reducer]
pub fn spawn_swarm(ctx: &ReducerContext, crisis: String) {
    let now = current_timestamp_secs!(ctx);

    // Kills legacy daemons
    let sched_ids: Vec<_> = ctx.db.pattern_extractor_schedule().iter().map(|s| s.scheduled_id).collect();
    for id in sched_ids { ctx.db.pattern_extractor_schedule().scheduled_id().delete(id); }

    let sched_ids: Vec<_> = ctx.db.scout_schedule().iter().map(|s| s.scheduled_id).collect();
    for id in sched_ids { ctx.db.scout_schedule().scheduled_id().delete(id); }
    
    let sched_ids: Vec<_> = ctx.db.strategist_schedule().iter().map(|s| s.scheduled_id).collect();
    for id in sched_ids { ctx.db.strategist_schedule().scheduled_id().delete(id); }
    
    let sched_ids: Vec<_> = ctx.db.devils_schedule().iter().map(|s| s.scheduled_id).collect();
    for id in sched_ids { ctx.db.devils_schedule().scheduled_id().delete(id); }

    // Wipe previous session logs to start fresh
    let log_ids: Vec<_> = ctx.db.reasoning_log().iter().map(|r| r.log_id).collect();
    for id in log_ids { ctx.db.reasoning_log().log_id().delete(id); }
    
    let msg_ids: Vec<_> = ctx.db.agent_messages().iter().map(|m| m.msg_id).collect();
    for id in msg_ids { ctx.db.agent_messages().msg_id().delete(id); }

    // Delete-then-reinsert pattern for primary-key upsert
    ctx.db.shared_context().key().delete("crisis".to_string());
    ctx.db.shared_context().insert(SharedContext {
        key:        "crisis".to_string(),
        value:      crisis.clone(),
        updated_at: now,
    });

    ctx.db.shared_context().key().delete("current_cycle".to_string());
    ctx.db.shared_context().insert(SharedContext {
        key:        "current_cycle".to_string(),
        value:      "1".to_string(),
        updated_at: now,
    });

    // Set all agents to "waiting" until pattern is extracted
    for agent_id in &["scout", "strategist", "devils_advocate"] {
        if ctx.db.agent().agent_id().find(agent_id.to_string()).is_some() {
            ctx.db.agent().agent_id().delete(agent_id.to_string());
            ctx.db.agent().insert(Agent {
                status:       "waiting".to_string(),
                current_task: "Awaiting crisis pattern classification...".to_string(),
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

    // Schedule EXACTLY the pattern extractor to run immediately
    let now_micros = ctx.timestamp.to_micros_since_unix_epoch() as i64;
    ctx.db.pattern_extractor_schedule().insert(PatternExtractorSchedule { 
        scheduled_id: 0, 
        scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 100_000)) 
    });

    // Delete any old final_brief if it exists
    ctx.db.shared_context().key().delete("final_brief".to_string());

    log::info!("[warroom] swarm launched — single shot execution queued.");
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
        sent_at:    current_timestamp_secs!(ctx),
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
    let now = current_timestamp_secs!(ctx);
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

/// Build a Mem0 memory-add request body explicitly encoding the outcome and confidence.
fn build_mem0_add_body(content: &str, user_id: &str, pattern: &str, confidence: f32, predicted_outcome: &str) -> Vec<u8> {
    serde_json::json!({
        "messages": [{ "role": "user", "content": content }],
        "user_id": user_id,
        "metadata": {
            "pattern": pattern,
            "confidence": confidence,
            "predicted_outcome": predicted_outcome
        }
    })
    .to_string()
    .into_bytes()
}

/// Helper: Queries Mem0, parses the results, applies the (similarity + confidence) formula, and returns formatted Top 3 insights.
fn retrieve_mem0_insights(ctx: &mut ProcedureContext, crisis_text: &str, user_id: &str) -> String {
    let mem0_body = serde_json::json!({
        "query": crisis_text,
        "user_id": user_id,
        "limit": 10
    }).to_string().into_bytes();

    use spacetimedb::http::Request;
    let raw_resp = match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(MEM0_SEARCH_URL)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Token {}", MEM0_API_KEY))
            .body(mem0_body)
            .unwrap()
    ) {
        Ok(resp) => resp.into_parts().1.into_string_lossy(),
        Err(e) => {
            log::error!("[mem0] search failed: {:?}", e);
            return String::new();
        }
    };

    let parsed: Value = match serde_json::from_str(&raw_resp) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };

    let mut results: Vec<(f64, String)> = Vec::new();
    if let Some(arr) = parsed.as_array() {
        for (idx, item) in arr.iter().enumerate() {
            let score = item["score"].as_f64().unwrap_or(0.0);
            let mem_text = item["memory"].as_str().unwrap_or("").to_string();
            let mut conf = 0.5;
            let mut pattern = "unknown".to_string();

            if let Some(meta) = item.get("metadata") {
                if let Some(c) = meta.get("confidence") { conf = c.as_f64().unwrap_or(0.5); }
                if let Some(p) = meta.get("pattern") { pattern = p.as_str().unwrap_or("unknown").to_string(); }
            }
            
            let final_score = score + conf;
            let display_text = format!("{}. [Pattern: {}, Conf: {:.2}] {}", idx + 1, pattern, conf, mem_text);
            results.push((final_score, display_text));
        }
    }

    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    
    let top_3: Vec<String> = results.into_iter().take(3).map(|(_, s)| s).collect();
    
    if top_3.is_empty() {
        return "No relevant past insights available.".to_string();
    }
    
    format!("Relevant past insights from similar scenarios:\n{}\n\nUse these only if applicable. Do not blindly follow them.", top_3.join("\n"))
}

/// Extract the text payload from a Gemini response.
/// Path: `candidates[0].content.parts[0].text`
fn extract_gemini_text(raw: &str) -> Option<String> {
    let v: Value = serde_json::from_str(raw).ok()?;

    // If Google returns an API error directly (e.g. 429 Quota Exceeded), capture and display it!
    if let Some(err_obj) = v.get("error") {
        if let Some(msg) = err_obj.get("message") {
            let error_text = format!("SYSTEM ERROR: {}", msg.as_str().unwrap_or("Quota or API Error"));
            let fallback_json = serde_json::json!({
                "reasoning": error_text,
                "decision": "RATE LIMIT HIT",
                "confidence": 0.0,
                "has_conflict": false
            });
            return Some(fallback_json.to_string());
        }
    }

    let text_val = v.get("candidates")?.get(0)?.get("content")?.get("parts")?.get(0)?.get("text")?.as_str()?;
    
    let mut cleaned = text_val.trim();
    if cleaned.starts_with("```json") {
        cleaned = cleaned[7..].trim_start();
    } else if cleaned.starts_with("```") {
        cleaned = cleaned[3..].trim_start();
    }
    if cleaned.ends_with("```") {
        cleaned = cleaned[..cleaned.len() - 3].trim_end();
    }
    
    Some(cleaned.to_string())
}

// =============================================================================
// PROCEDURE: pattern_extractor_think
// Fires exactly once per launch.
// Quickly classifies the crisis, saves pattern/severe to shared_context,
// and then physically schedules the 3 main agents.
// =============================================================================

#[spacetimedb::procedure]
fn pattern_extractor_think(ctx: &mut ProcedureContext, _arg: PatternExtractorSchedule) {
    log::info!("[pattern_extractor] think cycle starting");

    let crisis_text = ctx.with_tx(|tx_ctx| {
        tx_ctx.db.shared_context().key().find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string())
    });

    let system_instruction = "You are the Pattern Extractor for an elite crisis swarm. \
        Read the user's crisis and classify its core pattern type (e.g., 'price_competition', 'supply_chain_failure', 'pr_disaster'), \
        its severity ('low', 'medium', 'high', 'critical'), and its domain. \
        You must respond ONLY in valid JSON with exactly these keys: \
        pattern (string), severity (string), domain (string)";

    let prompt = format!("CRISIS: {}", crisis_text);
    let gemini_url = format!("{}{}:generateContent?key={}", GEMINI_URL, GEMINI_MODEL_NAME, GEMINI_API_KEY);
    let gemini_body = build_gemini_request(&prompt, system_instruction);

    use spacetimedb::http::Request;
    
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
            log::error!("[pattern_extractor] Gemini call failed: {:?}", e);
            "{\"pattern\":\"unknown\",\"severity\":\"critical\",\"domain\":\"unknown\"}".to_string()
        }
    };

    let parsed_text = extract_gemini_text(&gemini_raw).unwrap_or(gemini_raw);
    let parsed: Value = serde_json::from_str(&parsed_text).unwrap_or_else(|e| {
        log::error!("[pattern_extractor] JSON parse error: {:?}", e);
        serde_json::json!({
            "pattern": "unknown",
            "severity": "critical",
            "domain": "unknown"
        })
    });

    let pattern  = parsed["pattern"].as_str().unwrap_or("unknown").to_string();
    let severity = parsed["severity"].as_str().unwrap_or("critical").to_string();
    let domain   = parsed["domain"].as_str().unwrap_or("unknown").to_string();

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch() as i64;
    let now_secs = (now_micros / 1_000_000) as u64;

    ctx.with_tx(|tx_ctx| {
        // Save pattern info to shared context
        tx_ctx.db.shared_context().key().delete("crisis_pattern".to_string());
        tx_ctx.db.shared_context().insert(SharedContext {
            key: "crisis_pattern".to_string(),
            value: pattern.clone(),
            updated_at: now_secs,
        });

        // Set agents to thinking BEFORE queuing them
        for agent_id in &["scout", "strategist", "devils_advocate"] {
            if let Some(agent) = tx_ctx.db.agent().agent_id().find(agent_id.to_string()) {
                let updated = Agent {
                    status: "thinking".to_string(),
                    current_task: format!("{} | {} priority", pattern, severity),
                    last_updated: now_secs,
                    ..agent
                };
                tx_ctx.db.agent().agent_id().delete(agent_id.to_string());
                tx_ctx.db.agent().insert(updated);
            }
        }

        // Schedule the agents for strict sequential execution
        tx_ctx.db.scout_schedule().insert(ScoutSchedule { 
            scheduled_id: 0, 
            scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 500_000)) 
        });
        tx_ctx.db.strategist_schedule().insert(StrategistSchedule { 
            scheduled_id: 0, 
            scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 4_500_000)) 
        });
        tx_ctx.db.devils_schedule().insert(DevilsSchedule { 
            scheduled_id: 0, 
            scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 8_500_000)) 
        });
    });

    log::info!("[pattern_extractor] crisis classified: {} | {} | {}", pattern, severity, domain);
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
    let (crisis_text, crisis_pattern, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        // Read crisis from shared_context
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        let pattern = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis_pattern".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "unknown".to_string());

        // Collect unread messages addressed to "scout"
        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "scout" && !m.is_read)
            .collect();

        // Fetch the scout agent row (for context / logging)
        let agent = tx_ctx.db.agent().agent_id().find("scout".to_owned());

        (crisis, pattern, msgs, agent)
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
    let mem0_response_text = retrieve_mem0_insights(ctx, &crisis_text, "agent_scout");

    // -------------------------------------------------------------------------
    // STEP 3 — Call Gemini for intelligence analysis
    // -------------------------------------------------------------------------
    let system_instruction = "You are Scout, an elite intelligence gathering agent in a crisis \
        response AI swarm. Find facts, signals, market data, and evidence relevant to the crisis. \
        You must respond ONLY in valid JSON with exactly these keys: \
        reasoning (string - detailed analysis), \
        decision (string - key finding or recommended next investigation), \
        confidence (float 0.0-1.0), \
        predicted_outcome (string - predicted result of your findings), \
        memory_to_store (string - compressed insight to permanently remember), \
        message_to_strategist (string - intelligence briefing for Strategist agent)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         {mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Analyze the crisis."
    );
    
    log::info!("[scout] PROMPT GENERATED\nCRISIS: {}\nMEMORIES PARSED", crisis_text);

    let gemini_url = format!("{}{}:generateContent?key={}", GEMINI_URL, GEMINI_MODEL_NAME, GEMINI_API_KEY);
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
            let now = current_timestamp_secs!(ctx);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "scout".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    now,
                });
            });
            return;
        }
    };

    let parsed_text = extract_gemini_text(&gemini_raw).unwrap_or(gemini_raw);
    let parsed: Value = serde_json::from_str(&parsed_text).unwrap_or_else(|e| {
        log::error!("[scout] JSON parse error: {:?}", e);
        serde_json::json!({
            "reasoning": "Failed to parse Gemini response",
            "decision": "",
            "confidence": 0.0,
            "predicted_outcome": "",
            "memory_to_store": "",
            "message_to_strategist": ""
        })
    });

    let reasoning            = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision             = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence           = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let predicted_outcome    = parsed["predicted_outcome"].as_str().unwrap_or("").to_string();
    let memory_to_store      = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    let message_to_strategist = parsed["message_to_strategist"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store the most important fact in Mem0
    // -------------------------------------------------------------------------
    use spacetimedb::http::Request;
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_scout", &crisis_pattern, confidence, &predicted_outcome);
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
    let now = current_timestamp_secs!(ctx);
    ctx.with_tx(|tx_ctx| {
        if !memory_to_store.is_empty() {
            tx_ctx.db.structured_memory().insert(StructuredMemory {
                id: 0,
                pattern: crisis_pattern.clone(),
                insight: memory_to_store.clone(),
                decision: decision.clone(),
                confidence,
                predicted_outcome: predicted_outcome.clone(),
                source_agent: "scout".to_string(),
                timestamp: now,
            });
        }

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
    
    check_and_write_final_brief(ctx);
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
    let (crisis_text, crisis_pattern, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        let pattern = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis_pattern".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "unknown".to_string());

        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "strategist" && !m.is_read)
            .collect();

        let agent = tx_ctx.db.agent().agent_id().find("strategist".to_owned());
        (crisis, pattern, msgs, agent)
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
    let mem0_response_text = retrieve_mem0_insights(ctx, &crisis_text, "agent_strategist");

    // -------------------------------------------------------------------------
    // STEP 3 — Gemini decision synthesis
    // -------------------------------------------------------------------------
    let system_instruction = "You are Strategist, a decision synthesis agent in a crisis response \
        AI swarm. You receive intelligence from Scout and challenges from Devil's Advocate. \
        Your role is to form clear, actionable recommendations. Be decisive but consider all angles. \
        You must respond ONLY in valid JSON with exactly these keys: \
        reasoning (string), \
        decision (string - specific recommendation), \
        confidence (float 0.0-1.0), \
        predicted_outcome (string), \
        memory_to_store (string - compressed insight to permanently remember), \
        message_to_devils_advocate (string - present your recommendation for scrutiny)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         {mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Synthesise the intelligence and provide your recommendation."
    );

    let gemini_url = format!("{}{}:generateContent?key={}", GEMINI_URL, GEMINI_MODEL_NAME, GEMINI_API_KEY);
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
            let now = current_timestamp_secs!(ctx);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "strategist".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    now,
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
            "predicted_outcome": "",
            "memory_to_store": "",
            "message_to_devils_advocate": ""
        })
    });

    let reasoning                 = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision                  = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence                = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let predicted_outcome         = parsed["predicted_outcome"].as_str().unwrap_or("").to_string();
    let memory_to_store           = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    let message_to_devils_advocate = parsed["message_to_devils_advocate"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store memory in Mem0
    // -------------------------------------------------------------------------
    use spacetimedb::http::Request;
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_strategist", &crisis_pattern, confidence, &predicted_outcome);
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
    let now = current_timestamp_secs!(ctx);
    ctx.with_tx(|tx_ctx| {
        if !memory_to_store.is_empty() {
            tx_ctx.db.structured_memory().insert(StructuredMemory {
                id: 0,
                pattern: crisis_pattern.clone(),
                insight: memory_to_store.clone(),
                decision: decision.clone(),
                confidence,
                predicted_outcome: predicted_outcome.clone(),
                source_agent: "strategist".to_string(),
                timestamp: now,
            });
        }

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
    
    check_and_write_final_brief(ctx);
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
    let (crisis_text, crisis_pattern, unread_msgs, _agent_row) = ctx.with_tx(|tx_ctx| {
        let crisis = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "No crisis defined".to_string());

        let pattern = tx_ctx
            .db
            .shared_context()
            .key()
            .find("crisis_pattern".to_owned())
            .map(|r| r.value)
            .unwrap_or_else(|| "unknown".to_string());

        let msgs: Vec<AgentMessage> = tx_ctx
            .db
            .agent_messages()
            .iter()
            .filter(|m| m.to_agent == "devils_advocate" && !m.is_read)
            .collect();

        let agent = tx_ctx.db.agent().agent_id().find("devils_advocate".to_owned());
        (crisis, pattern, msgs, agent)
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
    let mem0_response_text = retrieve_mem0_insights(ctx, &crisis_text, "agent_devils_advocate");

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
        predicted_outcome (string), \
        memory_to_store (string - compressed insight to permanently remember), \
        has_conflict (boolean), \
        challenge_to_strategist (string)";

    let prompt = format!(
        "CRISIS: {crisis_text}\n\n\
         {mem0_response_text}\n\n\
         UNREAD MESSAGES:\n{msgs_text}\n\n\
         Challenge the current strategy. Find weaknesses and risks."
    );

    let gemini_url = format!("{}{}:generateContent?key={}", GEMINI_URL, GEMINI_MODEL_NAME, GEMINI_API_KEY);
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
            let now = current_timestamp_secs!(ctx);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.reasoning_log().insert(ReasoningLog {
                    log_id:       0,
                    agent_id:     "devils_advocate".to_string(),
                    reasoning:    "API call failed".to_string(),
                    decision:     String::new(),
                    confidence:   0.0,
                    has_conflict: false,
                    timestamp:    now,
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
            "predicted_outcome": "",
            "memory_to_store": "",
            "has_conflict": false,
            "challenge_to_strategist": ""
        })
    });

    let reasoning              = parsed["reasoning"].as_str().unwrap_or("").to_string();
    let decision               = parsed["decision"].as_str().unwrap_or("").to_string();
    let confidence             = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;
    let predicted_outcome      = parsed["predicted_outcome"].as_str().unwrap_or("").to_string();
    let memory_to_store        = parsed["memory_to_store"].as_str().unwrap_or("").to_string();
    // has_conflict comes directly from the LLM — Devil's Advocate controls this flag
    let has_conflict           = parsed["has_conflict"].as_bool().unwrap_or(false);
    let challenge_to_strategist = parsed["challenge_to_strategist"].as_str().unwrap_or("").to_string();

    // -------------------------------------------------------------------------
    // STEP 5 — Store memory in Mem0
    // -------------------------------------------------------------------------
    use spacetimedb::http::Request;
    if !memory_to_store.is_empty() {
        let mem0_add_body = build_mem0_add_body(&memory_to_store, "agent_devils_advocate", &crisis_pattern, confidence, &predicted_outcome);
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
    let now = current_timestamp_secs!(ctx);
    ctx.with_tx(|tx_ctx| {
        if !memory_to_store.is_empty() {
            tx_ctx.db.structured_memory().insert(StructuredMemory {
                id: 0,
                pattern: crisis_pattern.clone(),
                insight: memory_to_store.clone(),
                decision: decision.clone(),
                confidence,
                predicted_outcome: predicted_outcome.clone(),
                source_agent: "devils_advocate".to_string(),
                timestamp: now,
            });
        }

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

    check_and_write_final_brief(ctx);
}

// =============================================================================
// HELPER: check_and_write_final_brief
// Checks if all agents are idle. If so, forms the final decision summary!
// =============================================================================

fn check_and_write_final_brief(ctx: &mut ProcedureContext) {
    let (current_time, all_done, crisis, pattern, agent_decisions, current_cycle) = ctx.with_tx(|tx_ctx| {
        let current_time = tx_ctx.db.agent().iter().map(|a| a.last_updated).max().unwrap_or(0);
        let all_done = tx_ctx.db.agent().iter().all(|a| a.status == "idle" || a.status == "error" || a.status == "paused");
        
        let crisis = tx_ctx.db.shared_context().key().find("crisis".to_owned())
            .map(|r| r.value).unwrap_or_default();
            
        let pattern = tx_ctx.db.shared_context().key().find("crisis_pattern".to_owned())
            .map(|r| r.value).unwrap_or_else(|| "unknown".to_string());
            
        let current_cycle = tx_ctx.db.shared_context().key().find("current_cycle".to_owned())
            .map(|r| r.value.parse::<u32>().unwrap_or(1))
            .unwrap_or(1);
            
        let decisions: Vec<String> = tx_ctx.db.reasoning_log().iter()
            .map(|l| format!("{}:\nDecision: {}", l.agent_id, l.decision))
            .collect();
            
        (current_time, all_done, crisis, pattern, decisions, current_cycle)
    });

    if all_done && !agent_decisions.is_empty() {
        if current_cycle < 3 {
             log::info!("[warroom] Cycle {} complete! Triggering Cycle {}...", current_cycle, current_cycle + 1);
             
             let now_micros = ctx.timestamp.to_micros_since_unix_epoch() as i64;
             let new_cycle = current_cycle + 1;
             
             ctx.with_tx(|tx_ctx| {
                 tx_ctx.db.shared_context().key().delete("current_cycle".to_string());
                 tx_ctx.db.shared_context().insert(SharedContext {
                     key: "current_cycle".to_string(),
                     value: new_cycle.to_string(),
                     updated_at: current_time,
                 });
                 
                 for agent_id in &["scout", "strategist", "devils_advocate"] {
                     if let Some(agent) = tx_ctx.db.agent().agent_id().find(agent_id.to_string()) {
                         let updated = Agent {
                             status: "thinking".to_string(),
                             current_task: format!("Cycle {} of 3: Deepening insights...", new_cycle),
                             last_updated: current_time,
                             ..agent
                         };
                         tx_ctx.db.agent().agent_id().delete(agent_id.to_string());
                         tx_ctx.db.agent().insert(updated);
                     }
                 }
                 
                 tx_ctx.db.scout_schedule().insert(ScoutSchedule { 
                     scheduled_id: 0, 
                     scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 500_000)) 
                 });
                 tx_ctx.db.strategist_schedule().insert(StrategistSchedule { 
                     scheduled_id: 0, 
                     scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 4_500_000)) 
                 });
                 tx_ctx.db.devils_schedule().insert(DevilsSchedule { 
                     scheduled_id: 0, 
                     scheduled_at: ScheduleAt::Time(spacetimedb::Timestamp::from_micros_since_unix_epoch(now_micros + 8_500_000)) 
                 });
             });
             return;
        }

        log::info!("[warroom] All 3 agents completed 3 cycles! Synthesizing final brief...");
        
        let system_instruction = "You are the Commander of the AI warroom. Read the crisis and the independent insights generated by your agents. Write a highly professional, definitive 3-sentence action plan resolving the crisis. DO NOT use markdown codeblocks. Output plain concise text.";
        let prompt = format!("CRISIS:\n{}\n\nAGENT STRATEGIES:\n{}", crisis, agent_decisions.join("\n\n"));
        let gemini_url = format!("{}{}:generateContent?key={}", GEMINI_URL, GEMINI_MODEL_NAME, GEMINI_API_KEY);
        let gemini_body = build_gemini_request(&prompt, system_instruction);

        let final_text = match ctx.http.send(
            spacetimedb::http::Request::builder()
                .method("POST")
                .uri(&gemini_url)
                .header("Content-Type", "application/json")
                .body(gemini_body)
                .unwrap(),
        ) {
            Ok(resp) => {
                let raw = resp.into_parts().1.into_string_lossy();
                extract_gemini_text(&raw).unwrap_or_else(|| "Failed to parse final brief.".to_string())
            },
            Err(_) => "Error connecting to AI service for final brief.".to_string()
        };

        // Save to shared_context
        ctx.with_tx(|tx_ctx| {
            tx_ctx.db.shared_context().key().delete("final_brief".to_string());
            tx_ctx.db.shared_context().insert(SharedContext {
                key: "final_brief".to_string(),
                value: final_text.clone(),
                updated_at: current_time,
            });

            // Log this final decision structure
            tx_ctx.db.decision_log().insert(DecisionLog {
                id: 0,
                pattern: pattern.clone(),
                decision: final_text.clone(),
                reasoning_summary: agent_decisions.join(" | "),
                confidence: 0.9,
                predicted_outcome: "Synthesis Outcome".to_string(),
                timestamp: current_time,
            });
        });
        
        log::info!("[warroom] Final brief successfully written and logged to Structured Memory.");
    }
}

// =============================================================================
// REDUCER: get_mem0_memories
// Fetches all memories from Mem0 for the Memory Web visualizer
// =============================================================================

#[spacetimedb::procedure]
fn get_mem0_memories(ctx: &mut ProcedureContext) -> Result<(), String> {
    log::info!("[memory_web] Fetching all memories from Mem0...");
    
    let mem0_search_body = serde_json::json!({
        "query": "crisis strategy decision outcome",
        "limit": 50,
        "user_id": "warroom_swarm"
    }).to_string().into_bytes();

    use spacetimedb::http::Request;
    match ctx.http.send(
        Request::builder()
            .method("POST")
            .uri(&format!("{}?query=crisis&limit=50", MEM0_SEARCH_URL))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Token {}", MEM0_API_KEY))
            .body(mem0_search_body)
            .unwrap(),
    ) {
        Ok(response) => {
            let body = response.into_parts().1.into_string_lossy();
            log::info!("[memory_web] Retrieved {} memories", body.len());
            // Store in shared context for frontend to read
            let now = current_timestamp_secs!(ctx);
            ctx.with_tx(|tx_ctx| {
                tx_ctx.db.shared_context().insert(SharedContext { 
                    key: "mem0_memories".to_string(), 
                    value: body.to_string(),
                    updated_at: now,
                });
            });
            Ok(())
        }
        Err(e) => {
            log::error!("[memory_web] Failed to fetch memories: {:?}", e);
            Err(format!("Failed to fetch memories: {:?}", e))
        }
    }
}
