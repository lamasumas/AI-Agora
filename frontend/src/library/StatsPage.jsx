import { useState, useEffect } from "react";
import theme from "./theme";

export default function StatsPage({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, actRes] = await Promise.all([
          fetch("/api/stats/summary"),
          fetch("/api/stats/activity"),
        ]);
        if (sumRes.ok) setSummary(await sumRes.json());
        if (actRes.ok) setActivity(await actRes.json());
      } catch (err) {
        console.error("Stats load error:", err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const renderHeatmap = () => {
    if (!activity || !activity.dates) return null;
    const dates = activity.dates;
    const weeks = 52;
    const days = 7;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const startDate = new Date(now.getTime() - 365 * dayMs);

    const rows = [];
    for (let day = 0; day < days; day++) {
      const cells = [];
      for (let week = 0; week < weeks; week++) {
        const date = new Date(startDate.getTime() + (week * 7 + day) * dayMs);
        const dateStr = date.toISOString().split("T")[0];
        const count = dates[dateStr] || 0;
        let level = 0;
        if (count > 0) level = Math.min(5, Math.ceil(count / 2));

        cells.push(
          <div
            key={`${week}-${day}`}
            title={`${dateStr}: ${count} note(s)`}
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background:
                level === 0 ? theme.bgSubtle :
                level === 1 ? "rgba(6, 182, 212, 0.2)" :
                level === 2 ? "rgba(6, 182, 212, 0.4)" :
                level === 3 ? "rgba(6, 182, 212, 0.6)" :
                level === 4 ? "rgba(6, 182, 212, 0.8)" :
                "rgba(6, 182, 212, 1.0)",
            }}
          />
        );
      }
      rows.push(
        <div key={day} style={{ display: "flex", gap: 3 }}>
          {cells}
        </div>
      );
    }
    return rows;
  };

  const styles = {
    wrapper: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: theme.bg,
      zIndex: theme.zModal,
      overflow: "auto",
      padding: "24px 32px",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      marginBottom: 32,
    },
    backBtn: {
      background: "transparent",
      border: `1px solid ${theme.border}`,
      color: theme.textMuted,
      padding: "6px 14px",
      borderRadius: theme.borderRadiusSm,
      cursor: "pointer",
      fontSize: 13,
      transition: theme.transition,
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      color: theme.heading,
      fontFamily: theme.fontHeading,
      margin: 0,
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 16,
      marginBottom: 32,
    },
    statCard: {
      background: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: theme.borderRadius,
      padding: 24,
      textAlign: "center",
    },
    statValue: {
      fontSize: 36,
      fontWeight: 700,
      color: theme.accent,
      marginBottom: 8,
      fontFamily: theme.fontMono,
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 13,
    },
    section: {
      background: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: theme.borderRadius,
      padding: 24,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 20,
    },
    tagRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 0",
      borderBottom: `1px solid ${theme.border}`,
    },
    tagName: {
      fontSize: 14,
      color: theme.text,
      fontWeight: 500,
    },
    tagCount: {
      fontSize: 13,
      color: theme.textMuted,
    },
    tagBar: {
      height: 4,
      borderRadius: 2,
      background: theme.accent,
      marginTop: 4,
      transition: "width 0.3s ease",
    },
    loading: {
      textAlign: "center",
      padding: "60px 0",
      color: theme.textMuted,
      fontSize: 14,
    },
  };

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.loading}>Loading stats...</div>
      </div>
    );
  }

  const maxTagCount = summary?.top_tags?.length > 0
    ? Math.max(...summary.top_tags.map((t) => t.count))
    : 1;

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button
          style={styles.backBtn}
          onClick={onBack}
          onMouseEnter={(e) => { e.target.style.borderColor = theme.accent; e.target.style.color = theme.accent; }}
          onMouseLeave={(e) => { e.target.style.borderColor = theme.border; e.target.style.color = theme.textMuted; }}
        >
          ← Back
        </button>
        <h1 style={styles.title}>📊 Activity Stats</h1>
      </div>

      {summary && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{summary.total_notes}</div>
            <div style={styles.statLabel}>Total Notes</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{summary.total_tags}</div>
            <div style={styles.statLabel}>Total Tags</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{summary.notes_week}</div>
            <div style={styles.statLabel}>Notes This Week</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{summary.notes_month}</div>
            <div style={styles.statLabel}>Notes This Month</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{summary.most_active_month || "N/A"}</div>
            <div style={styles.statLabel}>Most Active Month</div>
          </div>
        </div>
      )}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Activity (Last 365 Days)</h2>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 8 }}>
          {renderHeatmap()}
        </div>
      </div>

      {summary?.top_tags?.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Top Tags</h2>
          {summary.top_tags.map((tag, i) => (
            <div key={i} style={styles.tagRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.tagName}>🏷️ {tag.name}</div>
                <div style={{ ...styles.tagBar, width: `${(tag.count / maxTagCount) * 100}%` }} />
              </div>
              <div style={styles.tagCount}>{tag.count} notes</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
