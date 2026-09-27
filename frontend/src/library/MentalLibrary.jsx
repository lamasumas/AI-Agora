import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as api from "./api.js";
import theme from "./theme.js";
import TreeSidebar from "./TreeSidebar.jsx";
import NoteGrid from "./NoteGrid.jsx";
import NoteDetail from "./NoteDetail.jsx";
import CreateNoteModal from "./CreateNoteModal.jsx";
import KnowledgeGraph from "./KnowledgeGraph.jsx";
import StatsPage from "./StatsPage.jsx";

const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    background: theme.bg,
    color: theme.text,
    fontFamily: theme.fontBody,
    paddingTop: 0, // nav bar is now handled by App.jsx shell
  },
  mainArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    transition: theme.transition,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 24px",
    borderBottom: `1px solid ${theme.border}`,
    background: theme.bgCard,
    flexWrap: "wrap",
  },
  searchInput: {
    flex: 1,
    minWidth: 200,
    maxWidth: 400,
    padding: "10px 14px",
    background: theme.bgSubtle,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.fontBody,
    outline: "none",
    transition: theme.transition,
  },
  btn: {
    padding: "8px 16px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    fontSize: 13,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  },
  btnAccent: {
    padding: "8px 16px",
    borderRadius: theme.borderRadiusSm,
    border: "none",
    background: theme.accent,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  },
  contentArea: {
    flex: 1,
    padding: 24,
    overflowY: "auto",
  },
  tagDropdown: {
    position: "relative",
  },
  tagMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    padding: 4,
    zIndex: theme.zModal,
    minWidth: 180,
    maxHeight: 240,
    overflowY: "auto",
  },
  tagMenuItem: {
    padding: "8px 12px",
    borderRadius: theme.borderRadiusXs,
    cursor: "pointer",
    fontSize: 13,
    color: theme.textMuted,
    transition: theme.transition,
  },
  mobileToggle: {
    padding: "8px 12px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.text,
    cursor: "pointer",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
  },
  spinner: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 60,
    color: theme.accent,
  },
  errorBanner: {
    padding: "12px 16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: `1px solid ${theme.danger}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.danger,
    fontSize: 13,
    marginBottom: 16,
  },
};

const Spinner = () => (
  <div style={styles.spinner}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3">
        <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite" />
      </path>
    </svg>
  </div>
);

export default function MentalLibrary() {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notes, setNotes] = useState([]);
  const [tree, setTree] = useState({});
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimerRef = useRef(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [activeView, setActiveView] = useState(null); // null | "graph" | "stats"
  const tagMenuRef = useRef(null);

  // Responsive detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Debounce search: update actual search state after user stops typing
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchInput]);

  // Close tag menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target)) {
        setShowTagMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load initial data
  const loadNotes = useCallback(async () => {
    try {
      setError(null);
      const params = {};
      if (search) params.search = search;
      if (selectedTag) params.tag = selectedTag;
      if (selectedParentId) params.parent_id = selectedParentId;
      if (showPinnedOnly) params.pinned = "true";
      const data = await api.getNotes(params);
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }, [search, selectedTag, selectedParentId, showPinnedOnly]);

  const loadTree = useCallback(async () => {
    try {
      const data = await api.getTree();
      setTree(data || {});
    } catch (err) {
      console.error("Failed to load tree:", err);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await api.getTags();
      setTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadNotes(), loadTree(), loadTags()]).finally(() => setLoading(false));
  }, [loadNotes, loadTree, loadTags]);

  const refreshAll = useCallback(() => {
    Promise.all([loadNotes(), loadTree(), loadTags()]);
  }, [loadNotes, loadTree, loadTags]);

  // Sidebar tree item selection
  const handleTreeSelect = useCallback((id, type) => {
    if (type === "pinned") {
      setShowPinnedOnly(true);
      setSelectedParentId("");
    } else if (type === "root") {
      setShowPinnedOnly(false);
      setSelectedParentId("");
      setSearch("");
      setSearchInput("");
      setSelectedTag("");
    } else if (type === "note") {
      // Parent note — filter grid to show its children
      setShowPinnedOnly(false);
      setSelectedParentId(id);
    } else if (type === "leaf") {
      // Leaf note — open it directly
      setSelectedNoteId(id);
    }
    if (type !== "leaf") setSelectedNoteId(null);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Open a note
  const handleOpenNote = useCallback((id) => {
    setSelectedNoteId(id);
  }, []);

  // Back to grid
  const handleBackToGrid = useCallback(() => {
    setSelectedNoteId(null);
    refreshAll();
  }, [refreshAll]);

  // Delete note from grid
  const handleDeleteNote = useCallback(async (id) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.deleteNote(id);
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  }, [refreshAll]);

  // Toggle pin
  const handleTogglePin = useCallback(async (id, currentPinned) => {
    try {
      await api.pinNote(id, !currentPinned);
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  }, [refreshAll]);

  // Create note
  const handleCreateNote = useCallback(async (data) => {
    try {
      await api.createNote(data);
      setShowCreateModal(false);
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  }, [refreshAll]);

  // Export
  const handleExport = useCallback(async () => {
    try {
      const result = await api.exportNotes();
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mental-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Build breadcrumb path for selected parent
  const breadcrumbPath = useMemo(() => {
    if (!selectedParentId || !tree) return [];
    const path = [];
    const findPath = (nodes, target, current = []) => {
      if (!nodes) return false;
      for (const [nid, node] of Object.entries(nodes)) {
        const newPath = [...current, { id: nid, title: node.title }];
        if (String(nid) === String(target)) {
          path.push(...newPath);
          return true;
        }
        if (node.children && findPath(node.children, target, newPath)) return true;
      }
      return false;
    };
    findPath(tree, selectedParentId);
    return path;
  }, [selectedParentId, tree]);

  const currentTitle = useMemo(() => {
    if (showPinnedOnly) return "Pinned Notes";
    if (selectedTag) return `Tag: ${selectedTag}`;
    if (search) return `Search: "${search}"`;
    if (selectedParentId && breadcrumbPath.length > 0) {
      return breadcrumbPath[breadcrumbPath.length - 1].title;
    }
    return "All Notes";
  }, [showPinnedOnly, selectedTag, search, selectedParentId, breadcrumbPath]);

  return (
    <div style={styles.container}>
      {!sidebarCollapsed && (
        <TreeSidebar
          tree={tree}
          isMobile={isMobile}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelect={handleTreeSelect}
          activeParentId={selectedParentId}
          showPinned={showPinnedOnly}
        />
      )}

      <div style={{
        ...styles.mainArea,
        marginLeft: isMobile ? 0 : (sidebarCollapsed ? 0 : theme.sidebarWidth),
      }}>
        {/* Toolbar */}
        <div style={{
          ...styles.toolbar,
          ...(isMobile ? { padding: "12px 16px", gap: 8 } : {}),
        }}>
          {/* Sidebar toggle — always visible */}
          <button
            style={{
              ...styles.mobileToggle,
              ...(sidebarCollapsed ? { background: theme.accentDim, borderColor: theme.accent, color: theme.accent } : {}),
            }}
            onClick={() => {
              if (isMobile) {
                setSidebarOpen(true);
              } else {
                setSidebarCollapsed(!sidebarCollapsed);
              }
            }}
            aria-label="Toggle sidebar"
            title={isMobile ? "Open sidebar" : (sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar")}
          >
            {sidebarCollapsed ? "▶" : "◀"}
          </button>

          <input
            style={{
              ...styles.searchInput,
              ...(isMobile ? { minWidth: 120, maxWidth: "none", flex: 1, fontSize: 13, padding: "8px 12px" } : {}),
            }}
            type="text"
            placeholder="Search notes..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          {/* Tag filter */}
          <div style={styles.tagDropdown} ref={tagMenuRef}>
            <button
              style={{
                ...styles.btn,
                ...(selectedTag ? { borderColor: theme.accent, color: theme.accent } : {}),
              }}
              onClick={() => setShowTagMenu(!showTagMenu)}
            >
              🏷 {selectedTag || "All Tags"}
            </button>
            {showTagMenu && (
              <div style={styles.tagMenu}>
                <div
                  style={{
                    ...styles.tagMenuItem,
                    ...(!selectedTag ? { color: theme.accent, background: theme.accentDim } : {}),
                  }}
                  onClick={() => { setSelectedTag(""); setShowTagMenu(false); }}
                >
                  All Tags
                </div>
                {tags.map((t) => (
                  <div
                    key={t.id || t.name}
                    style={{
                      ...styles.tagMenuItem,
                      ...(selectedTag === t.name ? { color: theme.accent, background: theme.accentDim } : {}),
                    }}
                    onClick={() => { setSelectedTag(t.name); setShowTagMenu(false); }}
                  >
                    {t.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pin filter toggle */}
          <button
            style={{
              ...styles.btn,
              ...(showPinnedOnly ? { borderColor: theme.gold, color: theme.gold } : {}),
            }}
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
          >
            ★ Pinned
          </button>

          <div style={{ flex: 1 }} />

          <button
            style={{
              ...styles.btn,
              ...(activeView === "graph" ? { borderColor: theme.accent, color: theme.accent } : {}),
            }}
            onClick={() => setActiveView(activeView === "graph" ? null : "graph")}
            title="Knowledge Graph"
          >
            🕸️ Graph
          </button>
          <button
            style={{
              ...styles.btn,
              ...(activeView === "stats" ? { borderColor: theme.accent, color: theme.accent } : {}),
            }}
            onClick={() => setActiveView(activeView === "stats" ? null : "stats")}
            title="Activity Stats"
          >
            📊 Stats
          </button>

          <button style={styles.btn} onClick={handleExport} title="Export backup">
            ⬇ Export
          </button>
          <button
            style={{
              ...styles.btnAccent,
              ...(isMobile ? { padding: "8px 12px", fontSize: 12 } : {}),
            }}
            onClick={() => setShowCreateModal(true)}
          >
            + New Note
          </button>
        </div>

        {/* Breadcrumb */}
        {(breadcrumbPath.length > 0 || showPinnedOnly || selectedTag || search) && (
          <div style={{
            padding: "10px 24px",
            fontSize: 12,
            color: theme.textDim,
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: `1px solid ${theme.border}`,
            background: theme.bg,
            flexWrap: "wrap",
          }}>
            <span
              style={{ cursor: "pointer", color: theme.textMuted }}
              onClick={() => { setSelectedParentId(""); setShowPinnedOnly(false); setSelectedTag(""); setSearch(""); setSearchInput(""); }}
            >
              All Notes
            </span>
            {breadcrumbPath.map((item, i) => (
              <span key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: theme.textDim }}>›</span>
                <span
                  style={{
                    cursor: i < breadcrumbPath.length - 1 ? "pointer" : "default",
                    color: i < breadcrumbPath.length - 1 ? theme.textMuted : theme.text,
                  }}
                  onClick={() => i < breadcrumbPath.length - 1 && setSelectedParentId(item.id)}
                >
                  {item.title}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ margin: "16px 24px 0", ...styles.errorBanner }}>
            {error}
            <button
              style={{ marginLeft: 12, background: "none", border: "none", color: theme.danger, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main content */}
        <div style={{
          ...styles.contentArea,
          ...(isMobile ? { padding: 16 } : {}),
        }}>
          {loading ? (
            <Spinner />
          ) : selectedNoteId ? (
            <NoteDetail
              key={selectedNoteId}
              noteId={selectedNoteId}
              onBack={handleBackToGrid}
              onNavigate={handleOpenNote}
              tree={tree}
              onDelete={handleDeleteNote}
              isMobile={isMobile}
            />
          ) : (
            <>
              <h1 style={{
                fontFamily: theme.fontHeading,
                fontSize: isMobile ? 20 : 26,
                fontWeight: 700,
                color: theme.heading,
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <span style={{ display: "inline-block", width: 28, height: 3, background: theme.accent, borderRadius: 2 }} />
                {currentTitle}
              </h1>
              <NoteGrid
                notes={notes}
                onOpen={handleOpenNote}
                onTogglePin={handleTogglePin}
                onDelete={handleDeleteNote}
                isMobile={isMobile}
              />
            </>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateNoteModal
          tree={tree}
          tags={tags}
          onSave={handleCreateNote}
          onClose={() => setShowCreateModal(false)}
          isMobile={isMobile}
        />
      )}

      {/* Graph overlay */}
      {activeView === "graph" && (
        <KnowledgeGraph
          onNavigate={(id) => { setActiveView(null); handleOpenNote(id); }}
          onBack={() => setActiveView(null)}
        />
      )}

      {/* Stats overlay */}
      {activeView === "stats" && (
        <StatsPage
          onBack={() => setActiveView(null)}
        />
      )}
    </div>
  );
}
