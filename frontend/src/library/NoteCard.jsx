import React, { useState, useCallback } from "react";
import theme from "./theme.js";

const cardStyles = {
  card: {
    background: `linear-gradient(135deg, #161b27 0%, ${theme.bgCard} 100%)`,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadius,
    padding: 20,
    cursor: "pointer",
    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflow: "hidden",
  },
  cardPinned: {
    border: `1px solid ${theme.gold}`,
    background: `linear-gradient(135deg, rgba(251, 191, 36, 0.05) 0%, ${theme.bgCard} 100%)`,
  },
  cardSelected: {
    border: `1px solid ${theme.accent}`,
    background: theme.accentDim,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: theme.text,
    fontFamily: theme.fontHeading,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  excerpt: {
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontFamily: theme.fontBody,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 8,
    borderTop: `1px solid ${theme.border}`,
  },
  date: {
    fontSize: 11,
    color: theme.textDim,
    fontFamily: theme.fontMono,
  },
  tags: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    marginTop: 6,
  },
  tag: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    background: theme.accentDim,
    color: theme.accent,
    fontFamily: theme.fontBody,
  },
  actions: {
    display: "flex",
    gap: 2,
    opacity: 0,
    transition: "opacity 0.2s ease",
  },
  actionsVisible: {
    opacity: 1,
  },
  actionBtn: {
    background: "none",
    border: "none",
    padding: "4px 6px",
    cursor: "pointer",
    fontSize: 14,
    borderRadius: theme.borderRadiusXs,
    transition: theme.transition,
    lineHeight: 1,
  },
  checkbox: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 18,
    height: 18,
    borderRadius: 4,
    border: `2px solid ${theme.border}`,
    background: theme.bg,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    transition: theme.transition,
    zIndex: 2,
  },
  checkboxChecked: {
    border: `2px solid ${theme.accent}`,
    background: theme.accent,
    color: "#fff",
  },
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr * 1000);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export default React.memo(function NoteCard({ note, onOpen, onTogglePin, onDelete, selectionMode, selected, onToggleSelect, isMobile }) {
  const [hovered, setHovered] = useState(false);
  const tags = note.tags || [];
  const showActions = hovered || selectionMode;

  const handleClick = useCallback(() => {
    if (selectionMode) {
      onToggleSelect(note.id);
      return;
    }
    onOpen(note.id);
  }, [selectionMode, note.id, onToggleSelect, onOpen]);

  const handlePin = useCallback((e) => {
    e.stopPropagation();
    onTogglePin(note.id, note.pinned);
  }, [note.id, note.pinned, onTogglePin]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${note.title}"?`)) {
      onDelete(note.id);
    }
  }, [note.id, note.title, onDelete]);

  const handleCheckbox = useCallback((e) => {
    e.stopPropagation();
    onToggleSelect(note.id);
  }, [note.id, onToggleSelect]);

  const excerpt = note.summary || "";

  return (
    <div
      style={{
        ...cardStyles.card,
        ...(note.pinned ? cardStyles.cardPinned : {}),
        ...(selected ? cardStyles.cardSelected : {}),
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? theme.shadowHover : "none",
        borderColor: hovered ? theme.accent : undefined,
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Selection checkbox */}
      {(selectionMode || (hovered && !isMobile)) && (
        <div
          style={{
            ...cardStyles.checkbox,
            ...(selected ? cardStyles.checkboxChecked : {}),
          }}
          onClick={handleCheckbox}
        >
          {selected && "✓"}
        </div>
      )}

      {/* Header */}
      <div style={cardStyles.header}>
        <div style={{
          ...cardStyles.title,
          ...(selectionMode || hovered ? { paddingLeft: 22 } : {}),
        }}>
          {note.title || "Untitled"}
        </div>
        <div style={{
          ...cardStyles.actions,
          ...(showActions ? cardStyles.actionsVisible : {}),
        }}>
          <button
            style={{
              ...cardStyles.actionBtn,
              color: note.pinned ? theme.gold : theme.textDim,
            }}
            onClick={handlePin}
            title={note.pinned ? "Unpin" : "Pin"}
          >
            {note.pinned ? "★" : "☆"}
          </button>
          <button
            style={{ ...cardStyles.actionBtn, color: theme.textDim }}
            onClick={(e) => { e.stopPropagation(); onOpen(note.id); }}
            title="Edit"
          >
            ✎
          </button>
          <button
            style={{ ...cardStyles.actionBtn, color: theme.textDim }}
            onClick={handleDelete}
            title="Delete"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Excerpt */}
      {excerpt && (
        <div style={{
          ...cardStyles.excerpt,
          ...(selectionMode || hovered ? { paddingLeft: 22 } : {}),
        }}>
          {excerpt}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{
          ...cardStyles.tags,
          ...(selectionMode || hovered ? { paddingLeft: 22 } : {}),
        }}>
          {tags.slice(0, 4).map((tag, i) => (
            <span key={typeof tag === "string" ? tag : tag.name || i} style={cardStyles.tag}>
              {typeof tag === "string" ? tag : tag.name}
            </span>
          ))}
          {tags.length > 4 && (
            <span style={{ ...cardStyles.tag, background: theme.bgSubtle, color: theme.textDim }}>
              +{tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={cardStyles.footer}>
        <span style={cardStyles.date}>
          {formatDate(note.updated_at || note.created_at)}
        </span>
        {note.pinned && (
          <span style={{ fontSize: 10, color: theme.gold, fontWeight: 600, letterSpacing: "0.05em" }}>
            PINNED
          </span>
        )}
      </div>
    </div>
  );
});
