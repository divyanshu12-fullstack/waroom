import React, { useMemo, useState } from 'react';

// ============================================================
// SWARM BRAIN — Memory Visualizer
// Dual-source: SpacetimeDB structured_memory + Mem0 semantic
// ============================================================

const AGENT_META = {
  agent_scout:           { color: '#00D4FF', emoji: '🔍', label: 'Scout',       id: 'scout' },
  agent_strategist:      { color: '#FFB800', emoji: '📊', label: 'Strategist',  id: 'strategist' },
  agent_devils_advocate: { color: '#FF3366', emoji: '😈', label: "Devil's Adv", id: 'devils_advocate' },
  scout:                 { color: '#00D4FF', emoji: '🔍', label: 'Scout',       id: 'scout' },
  strategist:            { color: '#FFB800', emoji: '📊', label: 'Strategist',  id: 'strategist' },
  devils_advocate:       { color: '#FF3366', emoji: '😈', label: "Devil's Adv", id: 'devils_advocate' },
  unknown:               { color: '#8B95A8', emoji: '🤖', label: 'Unknown',     id: 'unknown' },
};

function getAgentMeta(agentKey) {
  return AGENT_META[agentKey] || AGENT_META.unknown;
}

function timeAgo(ts) {
  if (!ts) return '';
  let d;
  if (typeof ts === 'bigint') {
    d = new Date(Number(ts) * 1000);
  } else if (typeof ts === 'number') {
    // If it looks like seconds (< 1e12), convert to ms
    d = new Date(ts < 1e12 ? ts * 1000 : ts);
  } else if (typeof ts === 'string') {
    d = new Date(ts);
  } else {
    d = new Date(Number(ts) * 1000);
  }
  if (isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'all 0.25s ease',
    }}>
      <div style={{
        width: 42, height: 42,
        borderRadius: 'var(--radius)',
        background: `${color}12`,
        border: `1px solid ${color}25`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.3rem',
        flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '1.3rem',
          fontWeight: 700,
          color: color,
          lineHeight: 1,
        }}>{value}</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          marginTop: 4,
          textTransform: 'uppercase',
        }}>{label}</div>
      </div>
    </div>
  );
}

// ── Memory Node (single memory card) ──────────────────────────
function MemoryNode({ memory, type, isHighlighted }) {
  const agent = getAgentMeta(memory.agent || memory.sourceAgent || memory._userId || 'unknown');
  const confidence = memory.confidence ?? memory.metadata?.confidence ?? 0;
  const pattern = memory.pattern || memory.metadata?.pattern || memory.metadata?.crisis_pattern || '';
  const content = memory.insight || memory.memory || memory.content || memory.decision || '';
  const predictedOutcome = memory.predictedOutcome || memory.predicted_outcome || '';
  const timestamp = memory.timestamp || memory.created_at;

  return (
    <div style={{
      background: isHighlighted ? `${agent.color}08` : 'var(--bg-panel)',
      border: `1px solid ${isHighlighted ? `${agent.color}35` : 'var(--border-default)'}`,
      borderLeft: `3px solid ${agent.color}`,
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow effect for highlighted memories */}
      {isHighlighted && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(ellipse at top left, ${agent.color}08, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{
          background: agent.color,
          color: '#060910',
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: '0.62rem',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          letterSpacing: '0.08em',
        }}>
          {agent.emoji} {agent.label.toUpperCase()}
        </span>

        {pattern && (
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.58rem',
            color: agent.color,
            background: `${agent.color}10`,
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${agent.color}20`,
          }}>
            {pattern}
          </span>
        )}

        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.58rem',
          color: '#00FF88',
          background: 'rgba(0, 255, 136, 0.08)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(0, 255, 136, 0.15)',
        }}>
          {(confidence * 100).toFixed(0)}%
        </span>

        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.55rem',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          background: type === 'mem0' ? 'rgba(108, 99, 255, 0.1)' : 'rgba(0, 212, 255, 0.08)',
          border: type === 'mem0' ? '1px solid rgba(108, 99, 255, 0.25)' : '1px solid rgba(0, 212, 255, 0.15)',
          color: type === 'mem0' ? '#6C63FF' : '#00D4FF',
        }}>
          {type === 'mem0' ? '🧠 LONG-TERM' : '⚡ SESSION'}
        </span>

        {isHighlighted && (
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '0.58rem',
            fontWeight: 700,
            color: '#00FF88',
            background: 'rgba(0, 255, 136, 0.12)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            letterSpacing: '0.08em',
          }}>
            🎯 ACTIVE RECALL
          </span>
        )}

        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: '0.55rem',
          color: 'var(--text-muted)',
          marginLeft: 'auto',
        }}>
          {timeAgo(timestamp)}
        </span>
      </div>

      {/* Content */}
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: '0.78rem',
        lineHeight: 1.65,
        color: 'var(--text-primary)',
        position: 'relative',
      }}>
        {content}
      </div>

      {/* Predicted outcome */}
      {predictedOutcome && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
        }}>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '0.56rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            display: 'block',
            marginBottom: 3,
          }}>PREDICTED OUTCOME</span>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>{predictedOutcome}</span>
        </div>
      )}
    </div>
  );
}

// ── Learning Timeline Visualization ───────────────────────────
function LearningTimeline({ memories }) {
  if (memories.length === 0) return null;

  const agentCounts = {};
  memories.forEach(m => {
    const key = getAgentMeta(m.agent || m.sourceAgent || m._userId || 'unknown').id;
    agentCounts[key] = (agentCounts[key] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(agentCounts), 1);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      marginBottom: 20,
    }}>
      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 700,
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.15em',
        marginBottom: 16,
      }}>KNOWLEDGE DISTRIBUTION</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(AGENT_META)
          .filter(([key]) => ['scout', 'strategist', 'devils_advocate'].includes(key))
          .map(([key, meta]) => {
            const count = agentCounts[key] || 0;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 100,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '0.9rem' }}>{meta.emoji}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    color: meta.color,
                    letterSpacing: '0.06em',
                  }}>{meta.label.toUpperCase()}</span>
                </div>
                <div style={{
                  flex: 1,
                  height: 8,
                  background: 'var(--bg-primary)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${meta.color}60, ${meta.color})`,
                    borderRadius: 4,
                    transition: 'width 0.8s ease-out',
                  }} />
                </div>
                <span style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '0.65rem',
                  color: meta.color,
                  width: 36,
                  textAlign: 'right',
                  flexShrink: 0,
                }}>{count}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}


// ============================================================
// MAIN COMPONENT
// ============================================================
export default function MemoryWebComponent({ mem0Memories = [], structuredMemories = [], loading, onRefresh, crisis }) {
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'mem0' | 'session'
  const [agentFilter, setAgentFilter] = useState('all');

  // Normalize structured memories (from SpacetimeDB)
  const normalizedSession = useMemo(() => {
    return structuredMemories.map(m => ({
      _type: 'session',
      id: typeof m.id === 'bigint' ? Number(m.id) : (m.id ?? Math.random()),
      agent: m.sourceAgent,
      insight: m.insight,
      decision: m.decision,
      pattern: m.pattern,
      confidence: typeof m.confidence === 'number' ? m.confidence : Number(m.confidence || 0),
      predictedOutcome: m.predictedOutcome,
      timestamp: typeof m.timestamp === 'bigint' ? Number(m.timestamp) : m.timestamp,
    }));
  }, [structuredMemories]);

  // Normalize Mem0 memories
  const normalizedMem0 = useMemo(() => {
    return mem0Memories.map((m, i) => ({
      _type: 'mem0',
      id: m.id || `mem0-${i}`,
      agent: m._userId || m.metadata?.agent || 'unknown',
      insight: m.memory || m.content || '',
      decision: '',
      pattern: m.metadata?.pattern || m.metadata?.crisis_pattern || '',
      confidence: m.metadata?.confidence || 0.5,
      predictedOutcome: m.metadata?.predicted_outcome || '',
      timestamp: m.created_at || m.updated_at || '',
    }));
  }, [mem0Memories]);

  // Combined and filtered
  const allMemories = useMemo(() => {
    let combined = [];
    if (viewMode === 'all' || viewMode === 'session') combined.push(...normalizedSession);
    if (viewMode === 'all' || viewMode === 'mem0') combined.push(...normalizedMem0);

    if (agentFilter !== 'all') {
      combined = combined.filter(m => {
        const meta = getAgentMeta(m.agent);
        return meta.id === agentFilter;
      });
    }

    return combined;
  }, [normalizedSession, normalizedMem0, viewMode, agentFilter]);

  // Determine which memories are "highlighted" (relevant to current crisis)
  const highlightedIds = useMemo(() => {
    if (!crisis) return new Set();
    const crisisWords = crisis.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const ids = new Set();
    allMemories.forEach(m => {
      const text = (m.insight + ' ' + m.pattern + ' ' + m.decision).toLowerCase();
      const matchCount = crisisWords.filter(w => text.includes(w)).length;
      if (matchCount >= 2) ids.add(m.id);
    });
    return ids;
  }, [allMemories, crisis]);

  const totalCount = normalizedSession.length + normalizedMem0.length;
  const highlightedCount = highlightedIds.size;

  // Loading state
  if (loading && totalCount === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-panel)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 20, animation: 'agentPulse 2s ease-in-out infinite' }}>🧠</div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '0.8rem',
            letterSpacing: '0.2em',
            color: 'var(--text-muted)',
          }}>ACCESSING SWARM MEMORIES...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-panel)',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Header ──────────────────────────────────── */}
      <div style={{
        padding: '20px 24px 0',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}>
          <div>
            <h2 style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: '1.3rem',
              color: 'var(--text-primary)',
              letterSpacing: '0.2em',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              🧠 SWARM BRAIN
            </h2>
            <p style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              margin: '8px 0 0',
              lineHeight: 1.5,
            }}>
              How the AI swarm learns and evolves across crises
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              background: loading
                ? 'rgba(0, 212, 255, 0.05)'
                : 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 212, 255, 0.06))',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              color: loading ? 'var(--text-muted)' : '#00D4FF',
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: '0.72rem',
              letterSpacing: '0.1em',
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.25s ease',
              flexShrink: 0,
            }}
          >
            {loading ? '⟳ LOADING...' : '🔄 REFRESH MEM0'}
          </button>
        </div>

        {/* ── Stats Row ─────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}>
          <StatCard label="Total Memories" value={totalCount} color="#E8EDF5" icon="📦" />
          <StatCard label="Session (Live)" value={normalizedSession.length} color="#00D4FF" icon="⚡" />
          <StatCard label="Long-Term (Mem0)" value={normalizedMem0.length} color="#6C63FF" icon="🧠" />
          <StatCard label="Active Recall" value={highlightedCount} color="#00FF88" icon="🎯" />
        </div>

        {/* ── Filters ───────────────────────────────── */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {/* Source filter */}
          {[
            { id: 'all', label: 'ALL SOURCES', count: totalCount },
            { id: 'session', label: '⚡ SESSION', count: normalizedSession.length },
            { id: 'mem0', label: '🧠 MEM0', count: normalizedMem0.length },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setViewMode(f.id)}
              style={{
                background: viewMode === f.id ? 'rgba(255, 51, 102, 0.12)' : 'var(--bg-card)',
                border: `1px solid ${viewMode === f.id ? 'rgba(255, 51, 102, 0.4)' : 'var(--border-default)'}`,
                color: viewMode === f.id ? '#FF3366' : 'var(--text-muted)',
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}

          <div style={{
            width: 1,
            height: 20,
            background: 'var(--border-default)',
            margin: '0 4px',
          }} />

          {/* Agent filter */}
          {[
            { id: 'all', label: 'ALL AGENTS' },
            { id: 'scout', label: '🔍 SCOUT' },
            { id: 'strategist', label: '📊 STRATEGIST' },
            { id: 'devils_advocate', label: '😈 DEVIL\'S ADV' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setAgentFilter(f.id)}
              style={{
                background: agentFilter === f.id ? 'rgba(0, 212, 255, 0.1)' : 'var(--bg-card)',
                border: `1px solid ${agentFilter === f.id ? 'rgba(0, 212, 255, 0.3)' : 'var(--border-default)'}`,
                color: agentFilter === f.id ? '#00D4FF' : 'var(--text-muted)',
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0 24px 24px',
      }}>
        {totalCount === 0 ? (
          /* Empty state */
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 300,
          }}>
            <div style={{ fontSize: '4rem', marginBottom: 20, opacity: 0.4 }}>🧠</div>
            <h3 style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: '1.1rem',
              color: 'var(--text-primary)',
              margin: '0 0 12px',
              letterSpacing: '0.15em',
            }}>NO MEMORIES YET</h3>
            <p style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              margin: 0,
              textAlign: 'center',
              maxWidth: 460,
              lineHeight: 1.7,
            }}>
              Launch the swarm to solve crises. Each mission creates memories that agents learn from.
              Session memories appear instantly. Long-term Mem0 memories persist across restarts.
            </p>
          </div>
        ) : (
          <>
            {/* Knowledge Distribution Chart */}
            <LearningTimeline memories={allMemories} />

            {/* Active Recall Section */}
            {highlightedCount > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.04), rgba(0, 255, 136, 0.01))',
                border: '1px solid rgba(0, 255, 136, 0.15)',
                borderRadius: 'var(--radius)',
                padding: '14px 18px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: '1.1rem' }}>🎯</span>
                <span style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: '#00FF88',
                  letterSpacing: '0.1em',
                }}>
                  {highlightedCount} MEMORIES RELEVANT TO CURRENT CRISIS
                </span>
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  marginLeft: 'auto',
                }}>
                  Agents are actively recalling these insights
                </span>
              </div>
            )}

            {/* Memory List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Show highlighted first, then the rest */}
              {allMemories
                .sort((a, b) => {
                  const aH = highlightedIds.has(a.id) ? 1 : 0;
                  const bH = highlightedIds.has(b.id) ? 1 : 0;
                  return bH - aH;
                })
                .map((memory) => (
                  <MemoryNode
                    key={memory.id}
                    memory={memory}
                    type={memory._type}
                    isHighlighted={highlightedIds.has(memory.id)}
                  />
                ))
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}
