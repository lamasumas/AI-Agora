import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as api from "./api.js";
import theme from "./theme.js";

const modalStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: theme.zModal,
    padding: 16,
  },
  modal: {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadius,
    width: "100%",
    maxWidth: 600,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: theme.shadow,
  },
  header: {
    padding: "20px 24px 16px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: theme.heading,
    fontFamily: theme.fontHeading,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: theme.textDim,
    fontSize: 20,
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: 1,
  },
  body: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
    fontFamily: theme.fontBody,
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.fontBody,
    outline: "none",
    transition: theme.transition,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 200,
    padding: "14px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.fontMono,
    lineHeight: 1.6,
    resize: "vertical",
    outline: "none",
    transition: theme.transition,
    boxSizing: "border-box",
    position: "relative",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.fontBody,
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  footer: {
    padding: "16px 24px",
    borderTop: `1px solid ${theme.border}`,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  btnPrimary: {
    padding: "10px 24px",
    borderRadius: theme.borderRadiusSm,
    border: "none",
    background: theme.accent,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
  },
  btnSecondary: {
    padding: "10px 24px",
    borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`,
    background: theme.bgSubtle,
    color: theme.textMuted,
    fontSize: 14,
    fontFamily: theme.fontBody,
    cursor: "pointer",
    transition: theme.transition,
  },
  tagList: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 6,
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
    width: 100,
  },
  autocomplete: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    maxHeight: 150,
    overflowY: "auto",
    zIndex: 10,
    marginBottom: 4,
  },
  autocompleteItem: {
    padding: "8px 14px",
    fontSize: 13,
    color: theme.textMuted,
    cursor: "pointer",
    transition: theme.transition,
  },
  errorText: {
    color: theme.danger,
    fontSize: 13,
  },
  fieldGroup: {
    position: "relative",
  },
};

function flattenTree(nodes, depth = 0, result = []) {
  if (!nodes) return result;
  const entries = Array.isArray(nodes)
    ? nodes.map((n) => [n.id, n])
    : Object.entries(nodes);
  for (const [id, node] of entries) {
    result.push({ id, title: node.title, depth });
    if (node.children?.length) {
      flattenTree(node.children, depth + 1, result);
    }
  }
  return result;
}

export default function CreateNoteModal({ tree, tags, onSave, onClose, isMobile }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [parentId, setParentId] = useState("");
  const [noteTags, setNoteTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [wikilinkQuery, setWikilinkQuery] = useState("");
  const [wikilinkResults, setWikilinkResults] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const textareaRef = useRef(null);
  const titleRef = useRef(null);

  const flatNodes = useMemo(() => flattenTree(tree), [tree]);

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Wikilink autocomplete
  useEffect(() => {
    if (!wikilinkQuery || wikilinkQuery.length < 2) {
      setWikilinkResults([]);
      setShowAutocomplete(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchNotes(wikilinkQuery);
        setWikilinkResults(Array.isArray(results) ? results.slice(0, 8) : []);
        setShowAutocomplete(results.length > 0);
      } catch {
        setWikilinkResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [wikilinkQuery]);

  // Detect [[ being typed in body
  const handleBodyChange = useCallback((e) => {
    const val = e.target.value;
    setBody(val);

    // Check if user is typing a wikilink
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const wikilinkMatch = textBeforeCursor.match(/\[\[([^\]]*?)$/);
    if (wikilinkMatch) {
      setWikilinkQuery(wikilinkMatch[1]);
    } else {
      setShowAutocomplete(false);
      setWikilinkQuery("");
    }
  }, []);

  const handleWikilinkSelect = useCallback((selectedTitle) => {
    if (!textareaRef.current) return;
    const val = body;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const textAfterCursor = val.slice(cursorPos);

    // Replace the partial wikilink
    const newTextBefore = textBeforeCursor.replace(/\[\[([^\]]*?)$/, `[[${selectedTitle}]]`);
    const newBody = newTextBefore + textAfterCursor;
    setBody(newBody);
    setShowAutocomplete(false);
    setWikilinkQuery("");
  }, [body]);

  // Tag handling
  const handleAddTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (!trimmed || noteTags.includes(trimmed)) return;
    setNoteTags((prev) => [...prev, trimmed]);
    setNewTag("");
  }, [newTag, noteTags]);

  const handleTagKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  const handleRemoveTag = useCallback((tagName) => {
    setNoteTags((prev) => prev.filter((t) => t !== tagName));
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave({
        title: title.trim(),
        body,
        parent_id: parentId || null,
        tags: noteTags,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [title, body, parentId, noteTags, onSave]);

  return (
    <div style={modalStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        ...modalStyles.modal,
        ...(isMobile ? { maxWidth: "100%", maxHeight: "95vh", borderRadius: 12 } : {}),
      }}>
        {/* Header */}
        <div style={modalStyles.header}>
          <div style={modalStyles.title}>Create Note</div>
          <button style={modalStyles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div style={modalStyles.body}>
          {error && (
            <div style={modalStyles.errorText}>{error}</div>
          )}

          {/* Title */}
          <div>
            <div style={modalStyles.label}>Title</div>
            <input
              ref={titleRef}
              style={modalStyles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  textareaRef.current?.focus();
                }
              }}
            />
          </div>

          {/* Parent */}
          <div>
            <div style={modalStyles.label}>Parent Note</div>
            <select
              style={modalStyles.select}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— None —</option>
              {flatNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {"  ".repeat(n.depth)}{n.title}
                </option>
              ))}
            </select>
          </div>

          {/* Body */}
          <div style={modalStyles.fieldGroup}>
            <div style={modalStyles.label}>Content</div>
            {showAutocomplete && wikilinkResults.length > 0 && (
              <div style={modalStyles.autocomplete}>
                {wikilinkResults.map((r) => (
                  <div
                    key={r.id}
                    style={modalStyles.autocompleteItem}
                    onClick={() => handleWikilinkSelect(r.title)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.bgHover;
                      e.currentTarget.style.color = theme.accent;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.color = theme.textMuted;
                    }}
                  >
                    [[{r.title}]]
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              style={modalStyles.textarea}
              value={body}
              onChange={handleBodyChange}
              placeholder="Write in markdown... Use [[Title]] for wikilinks."
              spellCheck={false}
            />
          </div>

          {/* Tags */}
          <div>
            <div style={modalStyles.label}>Tags</div>
            <div style={modalStyles.tagList}>
              {noteTags.map((tag) => (
                <span key={tag} style={modalStyles.tagPill}>
                  {tag}
                  <button style={modalStyles.tagRemove} onClick={() => handleRemoveTag(tag)}>×</button>
                </span>
              ))}
              <input
                style={modalStyles.tagInput}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="+ tag"
              />
              <button
                style={{ ...modalStyles.btnSecondary, fontSize: 11, padding: "4px 10px" }}
                onClick={handleAddTag}
              >
                Add
              </button>
            </div>
            {/* Suggest existing tags */}
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                {tags
                  .filter((t) => {
                    const name = typeof t === "string" ? t : t.name;
                    return !noteTags.includes(name);
                  })
                  .slice(0, 8)
                  .map((t, i) => {
                    const name = typeof t === "string" ? t : t.name;
                    return (
                      <button
                        key={name || i}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: theme.bgSubtle,
                          border: `1px solid ${theme.border}`,
                          color: theme.textDim,
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: theme.fontBody,
                        }}
                        onClick={() => setNoteTags((prev) => [...prev, name])}
                      >
                        + {name}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={modalStyles.footer}>
          <button
            style={modalStyles.btnSecondary}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.btnPrimary,
              opacity: saving || !title.trim() ? 0.5 : 1,
            }}
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? "Creating..." : "Create Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
