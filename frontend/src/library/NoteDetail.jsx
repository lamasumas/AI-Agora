import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as api from "./api.js";
import theme from "./theme.js";
import MarkdownPreview from "./MarkdownPreview.jsx";

const detailStyles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    minHeight: "100%",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBottom: 16,
    borderBottom: `1px solid ${theme.border}`,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  backBtn: {
    padding: "8px 14px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: theme.fontBody,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: theme.transition,
  },
  modeBtn: {
    padding: "6px 14px",
    borderRadius: theme.borderRadiusXs,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: theme.fontBody,
    transition: theme.transition,
  },
  modeBtnActive: {
    borderColor: theme.accent,
    color: theme.accent,
    background: theme.accentDim,
  },
  titleInput: {
    width: "100%",
    padding: "12px 0",
    fontSize: 28,
    fontWeight: 700,
    fontFamily: theme.fontHeading,
    color: theme.heading,
    background: "none",
    border: "none",
    outline: "none",
    borderBottom: `2px solid transparent`,
    marginBottom: 16,
    transition: theme.transition,
  },
  titleInputFocused: {
    borderBottom: `2px solid ${theme.accent}`,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  metaLabel: {
    fontSize: 11,
    color: theme.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: theme.fontBody,
  },
  metaValue: {
    fontSize: 12,
    color: theme.textMuted,
    fontFamily: theme.fontMono,
  },
  editorArea: {
    display: "flex",
    gap: 16,
    flex: 1,
    minHeight: 400,
  },
  textarea: {
    flex: 1,
    width: "100%",
    minHeight: 500,
    padding: 16,
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.fontMono,
    lineHeight: 1.7,
    resize: "vertical",
    outline: "none",
    tabSize: 2,
  },
  previewPane: {
    flex: 1,
    padding: 16,
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    overflow: "auto",
    minHeight: 500,
  },
  section: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: `1px solid ${theme.border}`,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.textMuted,
    fontFamily: theme.fontHeading,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tagList: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  tagPill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 12,
    background: theme.accentDim,
    color: theme.accent,
    fontSize: 12,
    fontFamily: theme.fontBody,
  },
  tagRemove: {
    background: "none",
    border: "none",
    color: theme.accent,
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
    marginLeft: 2,
  },
  tagInput: {
    padding: "4px 10px",
    borderRadius: 12,
    background: theme.bgSubtle,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: 12,
    fontFamily: theme.fontBody,
    outline: "none",
    width: 120,
  },
  parentSelect: {
    padding: "8px 12px",
    borderRadius: theme.borderRadiusSm,
    background: theme.bgSubtle,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: 13,
    fontFamily: theme.fontBody,
    outline: "none",
    cursor: "pointer",
    maxWidth: 300,
  },
  actionBtnPrimary: {
    padding: "10px 20px",
    borderRadius: theme.borderRadiusSm,
    border: "none",
    background: theme.accent,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
  },
  actionBtnDanger: {
    padding: "10px 20px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.danger}`,
    background: "rgba(239, 68, 68, 0.1)",
    color: theme.danger,
    fontWeight: 600,
    fontSize: 13,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
  },
  actionBtnSecondary: {
    padding: "10px 20px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    fontSize: 13,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
  },
  backlinkCard: {
    padding: "12px 16px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    cursor: "pointer",
    transition: theme.transition,
    marginBottom: 8,
  },
  attachmentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    marginBottom: 8,
    fontSize: 13,
    color: theme.textMuted,
  },
  attachBtn: {
    padding: "4px 8px",
    borderRadius: theme.borderRadiusXs,
    border: "none",
    background: "none",
    color: theme.textDim,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: theme.fontBody,
  },
  childNoteLink: {
    padding: "8px 14px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    cursor: "pointer",
    fontSize: 13,
    color: theme.textMuted,
    transition: theme.transition,
    display: "block",
    marginBottom: 6,
  },
  tocContainer: {
    padding: "12px 16px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    marginBottom: 20,
    fontSize: 12,
  },
  tocLink: {
    display: "block",
    padding: "3px 0",
    color: theme.accent,
    textDecoration: "none",
    fontSize: 12,
  },
  dropzone: {
    padding: "16px",
    border: `2px dashed ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    textAlign: "center",
    color: theme.textDim,
    fontSize: 13,
    cursor: "pointer",
    transition: theme.transition,
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
  saveIndicator: {
    fontSize: 12,
    color: theme.success,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
};

function ParentTreeNode({ id, node, depth, noteId, selectedId, expandedIds, toggleExpand, onSelect }) {
  const hasChildren = node.children && (
    Array.isArray(node.children) ? node.children.length > 0 : Object.keys(node.children).length > 0
  );
  const isExpanded = expandedIds.has(id);
  const isSelected = String(selectedId) === String(id);
  const isCurrent = String(noteId) === String(id);

  const children = hasChildren
    ? (Array.isArray(node.children)
      ? node.children.map(c => [c.id, c])
      : Object.entries(node.children))
    : [];

  return (
    <div>
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          paddingLeft: 12 + depth * 18,
          width: "100%",
          background: isSelected ? theme.accentDim : "none",
          border: "none",
          borderRadius: theme.borderRadiusXs,
          color: isCurrent ? theme.textFaint : (isSelected ? theme.accent : theme.textMuted),
          cursor: isCurrent ? "not-allowed" : "pointer",
          fontSize: 13,
          fontFamily: theme.fontBody,
          textAlign: "left",
          transition: theme.transition,
          opacity: isCurrent ? 0.4 : 1,
        }}
        onClick={() => {
          if (!isCurrent) onSelect(id);
        }}
        onMouseEnter={(e) => {
          if (!isCurrent && !isSelected) e.currentTarget.style.background = theme.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!isCurrent && !isSelected) e.currentTarget.style.background = "none";
        }}
      >
        {hasChildren ? (
          <span
            style={{
              fontSize: 9,
              width: 14,
              textAlign: "center",
              flexShrink: 0,
              color: theme.textDim,
              cursor: "pointer",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(id);
            }}
          >
            ▶
          </span>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 13, flexShrink: 0 }}>📄</span>
        <span style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: isSelected ? 600 : 400,
        }}>
          {node.title || id}
        </span>
        {isCurrent && (
          <span style={{ fontSize: 10, color: theme.textDim, flexShrink: 0 }}>current</span>
        )}
        {hasChildren && !isCurrent && (
          <span style={{ fontSize: 10, color: theme.textDim, flexShrink: 0 }}>
            {children.length}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && children.map(([cid, child]) => (
        String(cid) === String(noteId) ? null : (
          <ParentTreeNode
            key={cid}
            id={cid}
            node={child}
            depth={depth + 1}
            noteId={noteId}
            selectedId={selectedId}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            onSelect={onSelect}
          />
        )
      ))}
    </div>
  );
}

export default function NoteDetail({ noteId, onBack, onNavigate, tree, isMobile }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [parentInfo, setParentInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState("preview"); // "edit" | "split" | "preview"
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [parentId, setParentId] = useState("");
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [backlinks, setBacklinks] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [childNotes, setChildNotes] = useState([]);
  const [titleFocused, setTitleFocused] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Markdown toolbar helpers
  const insertMarkdown = useCallback((before, after = "", placeholder = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);
    const newText = body.substring(0, start) + before + (selected || placeholder) + after + body.substring(end);
    setBody(newText);
    setDirty(true);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + before.length + (selected || placeholder).length;
      textarea.setSelectionRange(
        selected ? cursorPos + after.length : start + before.length,
        selected ? cursorPos + after.length : cursorPos
      );
    });
  }, [body]);

  const mdActions = [
    { label: "B", title: "Bold", before: "**", after: "**", placeholder: "bold" },
    { label: "I", title: "Italic", before: "_", after: "_", placeholder: "italic" },
    { label: "S", title: "Strikethrough", before: "~~", after: "~~", placeholder: "strikethrough" },
    { label: "H1", title: "Heading 1", before: "# ", placeholder: "heading" },
    { label: "H2", title: "Heading 2", before: "## ", placeholder: "heading" },
    { label: "H3", title: "Heading 3", before: "### ", placeholder: "heading" },
    { label: "—", title: "Bullet list", before: "- ", placeholder: "list item" },
    { label: "1.", title: "Numbered list", before: "1. ", placeholder: "list item" },
    { label: "❝", title: "Blockquote", before: "> ", placeholder: "quote" },
    { label: "</>", title: "Inline code", before: "`", after: "`", placeholder: "code" },
    { label: "{ }", title: "Code block", before: "```\n", after: "\n```", placeholder: "code block" },
    { label: "🔗", title: "Link", before: "[", after: "](url)", placeholder: "link text" },
    { label: "[ ]", title: "Checkbox", before: "- [ ] ", placeholder: "task" },
    { label: "---", title: "Horizontal rule", before: "\n---\n" },
  ];

  // Load note data
  const loadNote = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getNote(noteId);
      setNote(data);
      setTitle(data.title || "");
      setBody(data.body || "");
      setParentId(data.parent_id || "");
      setPinned(!!data.pinned);
      // Fetch tags from dedicated endpoint
      const noteTags = await api.getNoteTags(noteId);
      setTags(Array.isArray(noteTags) ? noteTags.map(t => typeof t === "string" ? t : t.name) : []);

      // Load backlinks
      try {
        const bl = await api.getBacklinks(noteId);
        setBacklinks(Array.isArray(bl) ? bl : []);
      } catch {
        setBacklinks([]);
      }

      // Find parent note from tree (handles both array and object children)
      const findParent = (nodes, targetId, parent = null) => {
        if (!nodes) return null;
        const entries = Array.isArray(nodes)
          ? nodes.map((n) => [n.id, n])
          : Object.entries(nodes);
        for (const [nid, node] of entries) {
          if (String(nid) === String(targetId)) return parent ? { id: parent.id, title: parent.title } : null;
          if (node.children) {
            const found = findParent(node.children, targetId, { id: nid, title: node.title });
            if (found) return found;
          }
        }
        return null;
      };
      const parentNote = findParent(tree, noteId);
      setParentInfo(parentNote);

      // Find child notes from tree
      const findChildren = (nodes, targetId) => {
        if (!nodes) return [];
        for (const [nid, node] of Object.entries(nodes)) {
          if (String(nid) === String(targetId)) {
            if (!node.children) return [];
            // children can be an array [{id, title, ...}] or object {id: {title, ...}}
            if (Array.isArray(node.children)) {
              return node.children.map(c => ({ id: c.id, title: c.title }));
            }
            return Object.entries(node.children).map(([cid, c]) => ({ id: cid, title: c.title }));
          }
          if (node.children) {
            const found = findChildren(
              Array.isArray(node.children) ? Object.fromEntries(node.children.map(c => [c.id, c])) : node.children,
              targetId
            );
            if (found.length > 0) return found;
          }
        }
        return [];
      };
      setChildNotes(findChildren(tree, noteId));

      // Load attachments from dedicated endpoint
      try {
        const atts = await api.listAttachments(noteId);
        setAttachments(atts);
      } catch {
        setAttachments([]);
      }

      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [noteId, tree]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  // Parent tree selector state
  const [parentTreeOpen, setParentTreeOpen] = useState(false);
  const [parentTreeExpanded, setParentTreeExpanded] = useState(() => new Set());
  const parentTreeRef = useRef(null);

  // Find parent title for display
  const parentTitle = useMemo(() => {
    if (!parentId) return null;
    // Search tree for the title
    const findTitle = (nodes) => {
      if (!nodes) return null;
      const entries = Array.isArray(nodes)
        ? nodes.map(n => [n.id, n])
        : Object.entries(nodes);
      for (const [nid, node] of entries) {
        if (String(nid) === String(parentId)) return node.title;
        if (node.children) {
          const found = findTitle(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findTitle(tree);
  }, [parentId, tree]);

  // Close parent tree dropdown on outside click
  useEffect(() => {
    if (!parentTreeOpen) return;
    const handler = (e) => {
      if (parentTreeRef.current && !parentTreeRef.current.contains(e.target)) {
        setParentTreeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [parentTreeOpen]);

  const toggleParentTreeNode = useCallback((id) => {
    setParentTreeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Mark dirty when content changes
  const handleTitleChange = useCallback((e) => {
    setTitle(e.target.value);
    setDirty(true);
  }, []);

  const handleBodyChange = useCallback((e) => {
    setBody(e.target.value);
    setDirty(true);
  }, []);

  const handleParentChange = useCallback((e) => {
    setParentId(e.target.value);
    setDirty(true);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updateNote(noteId, {
        title,
        body,
        parent_id: parentId || null,
        tags,
      });
      setDirty(false);
      setLastSaved(new Date());
      // Reload to get fresh data
      await loadNote();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [noteId, title, body, parentId, tags, loadNote]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      await api.deleteNote(noteId);
      onBack();
    } catch (err) {
      setError(err.message);
    }
  }, [noteId, onBack]);

  const handleTogglePin = useCallback(async () => {
    try {
      setPinLoading(true);
      const newPinned = !pinned;
      await api.pinNote(noteId, newPinned);
      setPinned(newPinned);
      setNote(prev => prev ? { ...prev, pinned: newPinned } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setPinLoading(false);
    }
  }, [noteId, pinned]);

  // Tag management
  const handleAddTag = useCallback(async () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    try {
      await api.addTag(noteId, trimmed);
      setTags((prev) => [...prev, trimmed]);
      setNewTag("");
    } catch (err) {
      setError(err.message);
    }
  }, [noteId, newTag, tags]);

  const handleRemoveTag = useCallback(async (tagName) => {
    try {
      await api.removeTag(noteId, tagName);
      setTags((prev) => prev.filter((t) => t !== tagName));
    } catch (err) {
      setError(err.message);
    }
  }, [noteId]);

  const handleTagKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  // File upload (multiple files)
  const handleFileUpload = useCallback(async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      try {
        await api.uploadAttachment(noteId, files[i]);
      } catch (err) {
        setError(`Failed to upload ${files[i].name}: ${err.message}`);
      }
    }
    // Re-fetch the full list so format is always consistent
    try {
      const atts = await api.listAttachments(noteId);
      setAttachments(atts);
    } catch { /* ignore */ }
    e.target.value = "";
  }, [noteId]);

  const handleDeleteAttachment = useCallback(async (attId) => {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await api.deleteAttachment(attId);
      setAttachments((prev) => prev.filter((a) => (a.id || a.attachment_id) !== attId));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleDownloadAttachment = useCallback(async (attId, filename) => {
    try {
      const result = await api.downloadAttachment(attId);
      if (result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || result.filename || "download";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Navigate to backlink or child
  const handleNavigateNote = useCallback((id) => {
    if (onNavigate) {
      onNavigate(id);
    }
  }, [onNavigate]);

  const handleCopyNoteId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(noteId);
    } catch {
      // ponytail: fallback for older browsers
      const el = document.createElement("textarea");
      el.value = noteId;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  }, [noteId]);

  if (loading) {
    return (
      <div style={detailStyles.spinner}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
            <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite" />
        </circle>
        </svg>
      </div>
    );
  }

  if (error && !note) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={detailStyles.errorBanner}>{error}</div>
        <button style={detailStyles.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div style={detailStyles.container}>
      {/* Toolbar */}
      <div style={detailStyles.toolbar}>
        <button style={detailStyles.backBtn} onClick={onBack}>
          ← Back
        </button>
        {parentInfo && onNavigate && (
          <button
            style={{
              ...detailStyles.backBtn,
              color: theme.accent,
              border: `1px solid ${theme.accent}33`,
            }}
            onClick={() => onNavigate(parentInfo.id)}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.accentLight; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            ↑ {parentInfo.title}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Mode toggle */}
        {["edit", "split", "preview"].map((mode) => (
          <button
            key={mode}
            style={{
              ...detailStyles.modeBtn,
              ...(editMode === mode ? detailStyles.modeBtnActive : {}),
            }}
            onClick={() => setEditMode(mode)}
          >
            {mode === "edit" ? "✎ Edit" : mode === "split" ? "⬜ Split" : "👁 Preview"}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {dirty && (
          <span style={{ fontSize: 12, color: theme.warning }}>● Unsaved changes</span>
        )}
        {lastSaved && !dirty && (
          <span style={detailStyles.saveIndicator}>
            ✓ Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}

        <button
          style={{
            ...detailStyles.actionBtnPrimary,
            opacity: pinLoading ? 0.6 : 1,
            background: pinned ? theme.accentLight : "transparent",
            color: pinned ? theme.accent : theme.textMuted,
            border: `1px solid ${pinned ? theme.accent : theme.border}`,
          }}
          onClick={handleTogglePin}
          disabled={pinLoading}
        >
          {pinned ? "📌 Pinned" : "📍 Pin"}
        </button>
        <button
          style={{
            ...detailStyles.actionBtnPrimary,
            opacity: saving ? 0.6 : 1,
          }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button style={detailStyles.actionBtnDanger} onClick={handleDelete}>
          Delete
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={detailStyles.errorBanner}>
          {error}
          <button
            style={{ marginLeft: 12, background: "none", border: "none", color: theme.danger, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Title */}
      <input
        style={{
          ...detailStyles.titleInput,
          ...(titleFocused ? detailStyles.titleInputFocused : {}),
          ...(isMobile ? { fontSize: 22 } : {}),
        }}
        value={title}
        onChange={handleTitleChange}
        onFocus={() => setTitleFocused(true)}
        onBlur={() => setTitleFocused(false)}
        placeholder="Note title..."
      />

      {/* Meta row */}
      <div style={detailStyles.metaRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }} ref={parentTreeRef}>
          <span style={detailStyles.metaLabel}>Parent </span>
          <button
            style={{
              ...detailStyles.parentSelect,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 200,
              textAlign: "left",
            }}
            onClick={() => setParentTreeOpen(!parentTreeOpen)}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {parentTitle || "— None —"}
            </span>
            <span style={{ fontSize: 10, color: theme.textDim, flexShrink: 0 }}>
              {parentTreeOpen ? "▲" : "▼"}
            </span>
          </button>
          {parentTreeOpen && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.borderRadiusSm,
              boxShadow: theme.shadow,
              zIndex: theme.zModal,
              minWidth: 300,
              maxHeight: 360,
              overflowY: "auto",
              padding: 4,
            }}>
              {/* None option */}
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  width: "100%",
                  background: !parentId ? theme.accentDim : "none",
                  border: "none",
                  borderRadius: theme.borderRadiusXs,
                  color: !parentId ? theme.accent : theme.textMuted,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: theme.fontBody,
                  textAlign: "left",
                  transition: theme.transition,
                }}
                onClick={() => { handleParentChange({ target: { value: "" } }); setParentTreeOpen(false); }}
                onMouseEnter={(e) => { if (parentId) e.currentTarget.style.background = theme.bgHover; }}
                onMouseLeave={(e) => { if (parentId) e.currentTarget.style.background = "none"; }}
              >
                <span style={{ width: 16 }} />
                <span>— None —</span>
              </button>
              {/* Tree nodes */}
              {Object.entries(tree || {}).map(([id, node]) => (
                id === String(noteId) ? null : (
                  <ParentTreeNode
                    key={id}
                    id={id}
                    node={node}
                    depth={0}
                    noteId={noteId}
                    selectedId={parentId}
                    expandedIds={parentTreeExpanded}
                    toggleExpand={toggleParentTreeNode}
                    onSelect={(selectedId) => {
                      handleParentChange({ target: { value: selectedId } });
                      setParentTreeOpen(false);
                    }}
                  />
                )
              ))}
            </div>
          )}
          
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={detailStyles.metaLabel}>ID</span>
          <button
            onClick={handleCopyNoteId}
            style={{
              padding: "6px 10px",
              borderRadius: theme.borderRadiusSm,
              background: copiedId ? "rgba(74, 222, 128, 0.1)" : theme.bgSubtle,
              border: `1px solid ${copiedId ? theme.success : theme.border}`,
              color: theme.textMuted,
              fontSize: 12,
              fontFamily: theme.fontMono,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: theme.transition,
            }}
          >
            {noteId} {copiedId ? "✓" : "📋"}
          </button>
        </div>
        {note?.created_at && (
          <div>
            <span style={detailStyles.metaLabel}>Created </span>
            <span style={detailStyles.metaValue}>
              {new Date(note.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}
        {note?.updated_at && (
          <div>
            <span style={detailStyles.metaLabel}>Updated </span>
            <span style={detailStyles.metaValue}>
              {new Date(note.updated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={detailStyles.tagList}>
        {tags.map((tag) => (
          <span key={tag} style={detailStyles.tagPill}>
            {tag}
            <button style={detailStyles.tagRemove} onClick={() => handleRemoveTag(tag)}>×</button>
          </span>
        ))}
        <input
          style={detailStyles.tagInput}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="+ tag"
        />
        <button
          style={{ ...detailStyles.modeBtn, fontSize: 11, padding: "4px 8px" }}
          onClick={handleAddTag}
        >
          Add
        </button>
      </div>

      {/* Editor area */}
      <div style={{
        ...detailStyles.editorArea,
        ...(isMobile ? { flexDirection: "column" } : {}),
        marginTop: 20,
      }}>
        {(editMode === "edit" || editMode === "split") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Markdown toolbar */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              padding: "6px 8px",
              background: theme.bgSubtle,
              border: `1px solid ${theme.border}`,
              borderBottom: "none",
              borderRadius: `${theme.borderRadiusSm}px ${theme.borderRadiusSm}px 0 0`,
            }}>
              {mdActions.map((a) => (
                <button
                  key={a.label}
                  title={a.title}
                  onClick={() => insertMarkdown(a.before, a.after, a.placeholder)}
                  style={{
                    padding: isMobile ? "4px 6px" : "4px 8px",
                    background: "none",
                    border: `1px solid transparent`,
                    borderRadius: theme.borderRadiusXs,
                    color: theme.textMuted,
                    cursor: "pointer",
                    fontSize: a.label.length > 2 ? 11 : 12,
                    fontFamily: a.label.length <= 2 ? theme.fontMono : theme.fontBody,
                    fontWeight: a.label === "B" ? 700 : a.label === "I" ? 400 : 400,
                    fontStyle: a.label === "I" ? "italic" : "normal",
                    lineHeight: 1,
                    transition: theme.transition,
                    minWidth: 28,
                    textAlign: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = theme.accent;
                    e.currentTarget.style.color = theme.accent;
                    e.currentTarget.style.background = theme.accentDim;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.color = theme.textMuted;
                    e.currentTarget.style.background = "none";
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              style={{
                ...detailStyles.textarea,
                ...(isMobile ? { minHeight: 300 } : {}),
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
              }}
              value={body}
              onChange={handleBodyChange}
              placeholder="Write your note in markdown... Use [[Title]] for wikilinks."
              spellCheck={false}
            />
          </div>
        )}
        {(editMode === "preview" || editMode === "split") && (
          <div style={{
            ...detailStyles.previewPane,
            ...(isMobile ? { minHeight: 300 } : {}),
          }}
            onClick={async (e) => {
              const wikilink = e.target.closest(".wikilink");
              if (!wikilink) return;
              const title = wikilink.dataset.title;
              if (!title) return;
              try {
                const results = await api.searchNotes(title);
                const match = results.find((r) => r.title === title) || results[0];
                if (match && onNavigate) {
                  onNavigate(match.id);
                }
              } catch (err) {
                console.error("Wikilink lookup failed:", err);
              }
            }}
          >
            <MarkdownPreview body={body} />
          </div>
        )}
      </div>

      {/* Attachments section */}
      <div style={detailStyles.section}>
        <div style={detailStyles.sectionTitle}>
          <span>📎</span> Attachments
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <div
          style={detailStyles.dropzone}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.background = theme.accentDim; }}
          onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.background = "transparent"; }}
          onDrop={async (e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = theme.border;
            e.currentTarget.style.background = "transparent";
            const files = e.dataTransfer.files;
            if (!files || files.length === 0) return;
            for (let i = 0; i < files.length; i++) {
              try {
                await api.uploadAttachment(noteId, files[i]);
              } catch (err) {
                setError(`Failed to upload ${files[i].name}: ${err.message}`);
              }
            }
            try {
              const atts = await api.listAttachments(noteId);
              setAttachments(atts);
            } catch { /* ignore */ }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = theme.accent;
            e.currentTarget.style.color = theme.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme.border;
            e.currentTarget.style.color = theme.textDim;
          }}
        >
          Drop files here or click to upload
        </div>

        {attachments.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {attachments.map((att, i) => {
              const attId = att.id || att.attachment_id || i;
              const attName = att.filename || att.name || `Attachment ${i + 1}`;
              return (
                <div key={attId} style={detailStyles.attachmentRow}>
                  <span>📄</span>
                  <span style={{ flex: 1 }}>{attName}</span>
                  <button
                    style={detailStyles.attachBtn}
                    onClick={() => handleDownloadAttachment(attId, attName)}
                  >
                    ⬇
                  </button>
                  <button
                    style={{ ...detailStyles.attachBtn, color: theme.danger }}
                    onClick={() => handleDeleteAttachment(attId)}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <div style={detailStyles.section}>
          <div style={detailStyles.sectionTitle}>
            <span>🔗</span> Backlinks ({backlinks.length})
          </div>
          {backlinks.map((bl) => (
            <div
              key={bl.id}
              style={detailStyles.backlinkCard}
              onClick={() => handleNavigateNote(bl.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border;
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>
                {bl.title}
              </div>
              <div style={{ fontSize: 12, color: theme.textDim }}>
                {bl.updated_at ? new Date(bl.updated_at * 1000).toLocaleDateString() : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Child notes */}
      {childNotes.length > 0 && (
        <div style={detailStyles.section}>
          <div style={detailStyles.sectionTitle}>
            <span>📂</span> Child Notes ({childNotes.length})
          </div>
          {childNotes.map((child) => (
            <div
              key={child.id}
              style={detailStyles.childNoteLink}
              onClick={() => handleNavigateNote(child.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent;
                e.currentTarget.style.color = theme.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.color = theme.textMuted;
              }}
            >
              📄 {child.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
