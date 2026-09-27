import { useState, useCallback, useMemo } from "react";
import theme from "./theme.js";

const sidebarStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    zIndex: theme.zSidebar - 1,
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: theme.sidebarWidth,
    background: theme.bgCard,
    borderRight: `1px solid ${theme.border}`,
    display: "flex",
    flexDirection: "column",
    zIndex: theme.zSidebar,
    overflow: "hidden",
  },
  sidebarDesktop: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: theme.sidebarWidth,
    background: theme.bgCard,
    borderRight: `1px solid ${theme.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${theme.border}`,
  },
  title: {
    fontFamily: theme.fontHeading,
    fontSize: 16,
    fontWeight: 700,
    color: theme.heading,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 0",
  },
  treeItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13,
    color: theme.textMuted,
    transition: theme.transition,
    userSelect: "none",
    borderRadius: 0,
    border: "none",
    background: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: theme.fontBody,
  },
  treeItemActive: {
    color: theme.accent,
    background: theme.accentDim,
  },
  treeItemHover: {},
  expandArrow: {
    fontSize: 10,
    color: theme.textDim,
    width: 16,
    textAlign: "center",
    flexShrink: 0,
    transition: "transform 0.2s ease",
  },
  noteIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  itemTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  childCount: {
    fontSize: 10,
    color: theme.textDim,
    flexShrink: 0,
  },
  footer: {
    padding: "12px 16px",
    borderTop: `1px solid ${theme.border}`,
    fontSize: 11,
    color: theme.textDim,
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: theme.textDim,
    padding: "12px 20px 4px",
    fontWeight: 600,
  },
  specialItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    cursor: "pointer",
    fontSize: 13,
    color: theme.textMuted,
    transition: theme.transition,
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: theme.fontBody,
  },
};

function TreeNode({ node, depth, activeParentId, onSelect, expandedIds, toggleExpand }) {
  const hasChildren = node.children && Object.keys(node.children).length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isActive = String(activeParentId) === String(node.id);

  return (
    <div>
      <button
        style={{
          ...sidebarStyles.treeItem,
          paddingLeft: 16 + depth * 16,
          ...(isActive ? sidebarStyles.treeItemActive : {}),
        }}
        onClick={() => {
          if (hasChildren) {
            onSelect(node.id, "note");
            toggleExpand(node.id);
          } else {
            onSelect(node.id, "leaf");
          }
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = theme.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "none";
        }}
      >
        {hasChildren ? (
          <span style={{
            ...sidebarStyles.expandArrow,
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          }}>
            ▶
          </span>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}
        <span style={sidebarStyles.noteIcon}>📄</span>
        <span style={sidebarStyles.itemTitle}>{node.title}</span>
        {hasChildren && (
          <span style={sidebarStyles.childCount}>
            {Object.keys(node.children).length}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && (
        <div>
          {(Array.isArray(node.children) ? node.children : Object.values(node.children)).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeParentId={activeParentId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeSidebar({ tree, isMobile, open, onClose, onSelect, activeParentId, showPinned }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const topLevelNodes = useMemo(() => {
    if (!tree || typeof tree !== "object") return [];
    // The tree is {id: {id, title, children}, ...}
    return Object.entries(tree).map(([id, node]) => ({ ...node, id }));
  }, [tree]);

  const sidebar = (
    <div style={isMobile ? sidebarStyles.sidebar : sidebarStyles.sidebarDesktop}>
      <div style={sidebarStyles.header}>
        <div style={sidebarStyles.title}>
          <span style={{ color: theme.accent }}>◆</span>
          Mental Library
        </div>
      </div>

      <div style={sidebarStyles.scrollArea}>
        {/* Special items */}
        <button
          style={{
            ...sidebarStyles.specialItem,
            ...(!activeParentId && !showPinned ? { color: theme.accent, background: theme.accentDim } : {}),
          }}
          onClick={() => onSelect(null, "root")}
          onMouseEnter={(e) => {
            if (activeParentId || showPinned) e.currentTarget.style.background = theme.bgHover;
          }}
          onMouseLeave={(e) => {
            if (activeParentId || showPinned) e.currentTarget.style.background = "none";
          }}
        >
          <span>📚</span>
          <span>All Notes</span>
        </button>

        <button
          style={{
            ...sidebarStyles.specialItem,
            ...(showPinned ? { color: theme.gold, background: "rgba(251, 191, 36, 0.1)" } : {}),
          }}
          onClick={() => onSelect(null, "pinned")}
          onMouseEnter={(e) => {
            if (!showPinned) e.currentTarget.style.background = theme.bgHover;
          }}
          onMouseLeave={(e) => {
            if (!showPinned) e.currentTarget.style.background = "none";
          }}
        >
          <span>⭐</span>
          <span>Favorites</span>
        </button>

        <div style={sidebarStyles.sectionLabel}>Notes</div>

        {topLevelNodes.length === 0 && (
          <div style={{ padding: "12px 20px", fontSize: 12, color: theme.textDim }}>
            No notes yet
          </div>
        )}

        {topLevelNodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            activeParentId={activeParentId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
          />
        ))}
      </div>

      <div style={sidebarStyles.footer}>
        {topLevelNodes.length} top-level notes
      </div>
    </div>
  );

  if (isMobile) {
    if (!open) return null;
    return (
      <>
        <div style={sidebarStyles.overlay} onClick={onClose} />
        {sidebar}
      </>
    );
  }

  return sidebar;
}
