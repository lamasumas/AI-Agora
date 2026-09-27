import { useState, useEffect } from "react";
import * as api from "./api.js";
import theme from "../library/theme.js";
import ScriptEditor from "./ScriptEditor.jsx";

function StatusBadge({ status, enabled }) {
  if (!enabled) return <span style={{ background: theme.textFaint, color: theme.bg, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>disabled</span>;
  const colors = { ok: theme.success, error: theme.danger, running: theme.accent };
  return <span style={{ background: colors[status] || theme.textFaint, color: theme.bg, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{status || "pending"}</span>;
}

function ScheduleBadge({ schedule }) {
  const val = typeof schedule === "object" ? schedule?.display : schedule;
  if (!val || typeof val !== "string") return null;
  const isOnce = val.startsWith("once");
  return (
    <span style={{
      background: isOnce ? theme.accentDim : theme.bgSubtle,
      color: isOnce ? theme.accent : theme.textMuted,
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 11,
      fontFamily: theme.fontMono,
    }}>
      {val}
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
  } catch {
    return ts;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function navBtnStyle(active = false) {
  return {
    padding: "8px 14px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${active ? theme.accent + "40" : theme.border}`,
    background: active ? theme.accentDim : theme.bgSubtle,
    color: active ? theme.accent : theme.textDim,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: theme.fontBody,
    transition: "all 0.15s",
  };
}

function JobRow({ job, isExpanded, onToggle }) {
  const jobId = job.id || job.job_id;
  const jobPrompt = job.prompt || job.prompt_preview;
  const hasContent = job.script || jobPrompt;
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const handleRun = async (e) => {
    e.stopPropagation();
    setRunning(true);
    setError(null);
    try {
      const resp = await fetch(`/api/cron/${jobId}/trigger`, { method: 'POST' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: "pointer",
          background: isExpanded ? theme.accentDim : "transparent",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = theme.bgHover; }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
      >
        <td style={tdStyle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {hasContent && <span style={{ fontSize: 10, color: theme.textDim }}>{isExpanded ? "▼" : "▶"}</span>}
            <span style={{ fontWeight: 600, color: theme.text }}>{job.name || jobId}</span>
          </span>
        </td>
        <td style={tdStyle}><ScheduleBadge schedule={job.schedule} /></td>
        <td style={tdStyle}><StatusBadge status={job.last_status} enabled={job.enabled} /></td>
        <td style={{ ...tdStyle, color: theme.textMuted, fontSize: 12 }}>{formatTime(job.last_run_at)}</td>
        <td style={{ ...tdStyle, color: theme.textMuted, fontSize: 12 }}>{formatTime(job.next_run_at)}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} style={{ padding: "8px 24px 12px", background: theme.bgSubtle, borderBottom: `1px solid ${theme.border}` }}>
            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: job.script || jobPrompt ? 12 : 0 }}>
              <button
                onClick={handleRun}
                style={{
                  padding: "6px 12px", borderRadius: theme.borderRadiusSm,
                  border: `1px solid ${copied ? theme.success : theme.accent + "40"}`,
                  background: copied ? theme.success + "20" : theme.accentDim,
                  color: copied ? theme.success : theme.accent,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: theme.fontBody, transition: "all 0.15s",
                }}
              >
                {running ? "⏳ Running..." : error ? `✗ ${error}` : copied ? "✓ Triggered!" : "▶ Run Now"}
              </button>
              <span style={{ fontSize: 11, color: error ? theme.error : theme.textDim }}>
                {error ? "" : "Triggers the job immediately via Hermes API"}
              </span>
            </div>
            {/* Content */}
            {job.script ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: theme.textMuted }}>Script:</span>
                <code style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.accent, background: theme.bg, padding: "2px 8px", borderRadius: theme.borderRadiusXs }}>{job.script}</code>
              </div>
            ) : jobPrompt ? (
              <div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>Prompt:</div>
                <pre style={{
                  fontFamily: theme.fontMono, fontSize: 12, color: theme.text,
                  background: theme.bg, padding: "10px 14px", borderRadius: theme.borderRadiusSm,
                  border: `1px solid ${theme.border}`, margin: 0,
                  whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto",
                }}>{jobPrompt}</pre>
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

const thStyle = { padding: "10px 12px", textAlign: "left", color: theme.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${theme.border}`, fontFamily: theme.fontBody };
const tdStyle = { padding: "10px 12px", borderBottom: `1px solid ${theme.borderLight}`, fontSize: 13, fontFamily: theme.fontBody };

export default function CronDashboard({ isMobile }) {
  const [jobs, setJobs] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);
  const [selectedScript, setSelectedScript] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsData, scriptsData] = await Promise.all([
        api.getCronJobs(),
        api.getScripts(),
      ]);
      setJobs(jobsData.jobs || []);
      setScripts(scriptsData.scripts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // If editing a script
  if (selectedScript) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: theme.fontBody, padding: isMobile ? "12px 8px" : "24px 20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", height: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>
          <ScriptEditor filename={selectedScript} onBack={() => setSelectedScript(null)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: theme.fontBody, padding: isMobile ? "12px 8px" : "24px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 16 : 24, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontFamily: theme.fontHeading, fontSize: isMobile ? 22 : 30, fontWeight: 800, color: theme.heading, margin: 0 }}>
            ⚡ <span style={{ color: theme.accent }}>Cron</span>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: theme.textDim, marginRight: 8 }}>
              {jobs.length} job{jobs.length !== 1 ? "s" : ""} · {scripts.length} script{scripts.length !== 1 ? "s" : ""}
            </span>
            <button onClick={loadData} style={navBtnStyle()}>↻ Refresh</button>
          </div>
        </div>

        {error && <div style={{ color: theme.danger, padding: 12, background: `${theme.danger}15`, borderRadius: theme.borderRadiusSm, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {loading ? (
          <div style={{ color: theme.textMuted, padding: 40, textAlign: "center" }}>Loading…</div>
        ) : (
          <>
            {/* Jobs Table */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: theme.fontHeading, fontSize: 16, color: theme.heading, margin: "0 0 12px", fontWeight: 600 }}>Scheduled Jobs</h2>
              <div style={{ overflowX: "auto", border: `1px solid ${theme.border}`, borderRadius: theme.borderRadiusSm, background: theme.bgCard }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Last Run</th>
                      <th style={thStyle}>Next Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: theme.textMuted }}>No cron jobs found</td></tr>
                    ) : (
                      jobs.map(job => (
                        <JobRow
                          key={job.id || job.job_id}
                          job={job}
                          isExpanded={expandedJob === (job.id || job.job_id)}
                          onToggle={() => setExpandedJob(expandedJob === (job.id || job.job_id) ? null : (job.id || job.job_id))}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scripts List */}
            <div>
              <h2 style={{ fontFamily: theme.fontHeading, fontSize: 16, color: theme.heading, margin: "0 0 12px", fontWeight: 600 }}>Scripts</h2>
              {scripts.length === 0 ? (
                <div style={{ color: theme.textMuted, padding: 24, textAlign: "center", border: `1px solid ${theme.border}`, borderRadius: theme.borderRadiusSm, background: theme.bgCard }}>No scripts found in /data/scripts/</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {scripts.map(s => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedScript(s.name)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        background: theme.bgCard,
                        border: `1px solid ${theme.border}`,
                        borderRadius: theme.borderRadiusSm,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                        color: theme.text,
                        fontFamily: theme.fontBody,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.boxShadow = theme.shadowHover; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <span style={{ fontSize: 20 }}>📜</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: theme.fontMono, fontSize: 13, fontWeight: 600, color: theme.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{formatSize(s.size)} · {new Date(s.modified * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                      </div>
                      <span style={{ color: theme.textDim, fontSize: 12 }}>→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
