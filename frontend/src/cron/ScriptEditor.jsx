import { useRef, useEffect, useCallback, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import * as api from "./api.js";
import theme from "../library/theme.js";

function getLangExtension(filename) {
  if (filename.endsWith(".py")) return python();
  if (filename.endsWith(".js") || filename.endsWith(".mjs")) return javascript();
  return [];
}

export default function ScriptEditor({ filename, onBack }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [content, setContent] = useState(null);
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const latestDoc = useRef("");

  // Step 1: Fetch script content
  useEffect(() => {
    if (!filename) return;
    setContent(null);
    setModified(false);
    setError(null);
    api.readScript(filename)
      .then(data => {
        latestDoc.current = data.content;
        setContent(data.content);
      })
      .catch(err => setError(err.message));
  }, [filename]);

  // Step 2: Create editor when content is ready AND ref is mounted
  useEffect(() => {
    if (content === null || !editorRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        bracketMatching(),
        indentOnInput(),
        history(),
        getLangExtension(filename),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          { key: "Mod-s", run: () => { doSave(); return true; } },
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            latestDoc.current = update.state.doc.toString();
            setModified(true);
          }
        }),
        EditorView.theme({
          "&": { fontSize: "13px", height: "100%" },
          ".cm-scroller": { fontFamily: theme.fontMono, overflow: "auto" },
          ".cm-gutters": { background: theme.bg, borderRight: `1px solid ${theme.border}` },
          ".cm-activeLine": { background: theme.accentDim },
          ".cm-activeLineGutter": { background: theme.accentDim },
        }),
      ],
    });

    if (viewRef.current) viewRef.current.destroy();
    viewRef.current = new EditorView({ state, parent: editorRef.current });

    return () => {
      if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
    };
  }, [content, filename]);

  const doSave = useCallback(async () => {
    if (!modified || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveScript(filename, latestDoc.current);
      setModified(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [filename, modified, saving]);

  const iconStyle = {
    cursor: "pointer", padding: "8px 14px", borderRadius: theme.borderRadiusSm,
    border: `1px solid ${theme.border}`, background: theme.bgSubtle,
    color: theme.textDim, fontSize: 12, fontWeight: 600, fontFamily: theme.fontBody,
    transition: "all 0.15s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", borderBottom: `1px solid ${theme.border}`, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={iconStyle}>← Back</button>
        <span style={{ fontFamily: theme.fontMono, fontSize: 14, color: theme.accent, fontWeight: 600 }}>{filename}</span>
        {modified && <span style={{ color: theme.warning, fontSize: 12 }}>● modified</span>}
        <div style={{ flex: 1 }} />
        {error && <span style={{ color: theme.danger, fontSize: 12 }}>{error}</span>}
        <button
          onClick={doSave}
          disabled={!modified || saving}
          style={{
            ...iconStyle,
            background: modified ? theme.accent : theme.bgSubtle,
            color: modified ? theme.bg : theme.textDim,
            cursor: modified ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Save"} <span style={{ fontSize: 11, opacity: 0.7 }}>(Ctrl+S)</span>
        </button>
      </div>

      {/* Editor — always rendered once content is loaded */}
      {content !== null ? (
        <div ref={editorRef} style={{ flex: 1, minHeight: 200, border: `1px solid ${theme.border}`, borderRadius: theme.borderRadiusSm, overflow: "hidden" }} />
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: theme.danger }}>{error}</div>
      ) : (
        <div style={{ padding: 40, textAlign: "center", color: theme.textMuted }}>Loading…</div>
      )}
    </div>
  );
}
