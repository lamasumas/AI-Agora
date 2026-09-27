import { useState, useCallback } from "react";
import NoteCard from "./NoteCard.jsx";
import theme from "./theme.js";

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 16,
  },
  gridMobile: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  pinnedSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: theme.textDim,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: theme.fontBody,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 60,
    color: theme.textDim,
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: theme.textMuted,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    maxWidth: 300,
    lineHeight: 1.5,
  },
  bulkBar: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: theme.bgCard,
    border: `1px solid ${theme.accent}`,
    borderRadius: theme.borderRadiusSm,
    padding: "10px 16px",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    color: theme.text,
  },
  bulkBtn: {
    padding: "6px 14px",
    borderRadius: theme.borderRadiusXs,
    border: "none",
    background: theme.danger,
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: theme.fontBody,
    fontWeight: 600,
  },
  selectAllBtn: {
    padding: "6px 14px",
    borderRadius: theme.borderRadiusXs,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: theme.fontBody,
  },
  selectionToggle: {
    padding: "6px 12px",
    borderRadius: theme.borderRadiusXs,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: theme.fontBody,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
};

export default function NoteGrid({ notes, onOpen, onTogglePin, onDelete, isMobile }) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(notes.map((n) => n.id)));
  }, [notes]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected notes?`)) return;
    for (const id of selectedIds) {
      await onDelete(id);
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, onDelete]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const pinned = notes.filter((n) => n.pinned);
  const unpinned = notes.filter((n) => !n.pinned);

  if (notes.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📝</div>
        <div style={styles.emptyTitle}>No notes found</div>
        <div style={styles.emptySub}>
          Create a new note to get started, or adjust your search and filters.
        </div>
      </div>
    );
  }

  const renderCard = (note) => (
    <NoteCard
      key={note.id}
      note={note}
      onOpen={onOpen}
      onTogglePin={onTogglePin}
      onDelete={onDelete}
      selectionMode={selectionMode}
      selected={selectedIds.has(note.id)}
      onToggleSelect={toggleSelect}
      isMobile={isMobile}
    />
  );

  return (
    <div>
      {/* Selection mode toggle */}
      {!isMobile && notes.length > 0 && (
        <button
          style={{
            ...styles.selectionToggle,
            ...(selectionMode ? { borderColor: theme.accent, color: theme.accent } : {}),
          }}
          onClick={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
        >
          {selectionMode ? "✕ Exit Selection" : "☐ Select"}
        </button>
      )}

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div style={styles.bulkBar}>
          <span>{selectedIds.size} selected</span>
          <button style={styles.bulkBtn} onClick={handleBulkDelete}>
            🗑 Delete Selected
          </button>
          <button style={styles.selectAllBtn} onClick={selectAll}>
            Select All
          </button>
          <button style={styles.selectAllBtn} onClick={deselectAll}>
            Deselect All
          </button>
        </div>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div style={styles.pinnedSection}>
          <div style={styles.sectionLabel}>
            <span style={{ color: theme.gold }}>⭐</span> Pinned
          </div>
          <div style={isMobile ? styles.gridMobile : styles.grid}>
            {pinned.map(renderCard)}
          </div>
        </div>
      )}

      {/* Unpinned section */}
      {unpinned.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <div style={styles.sectionLabel}>
              <span style={{ color: theme.textDim }}>📄</span> Other Notes
            </div>
          )}
          <div style={isMobile ? styles.gridMobile : styles.grid}>
            {unpinned.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}
