import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import theme from "./theme.js";

// Add IDs to headings in rendered HTML (post-processing)
function addHeadingIds(html) {
  let counter = 0;
  return html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/g, (match, level, attrs, content) => {
    // Skip if already has an id
    if (/id="/.test(attrs)) return match;
    const plainText = content.replace(/<[^>]+>/g, "").trim();
    const slug = plainText
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const id = `${slug}-${counter++}`;
    return `<h${level} id="${id}"${attrs}>${content}</h${level}>`;
  });
}

// Process wikilinks [[Title]] and task checkboxes before marked
function preprocessMarkdown(text) {
  if (!text) return "";

  // Convert - [x] and - [ ] to html checkboxes before marked processes them
  let processed = text.replace(/^(\s*)- \[x\] (.*)$/gm, (match, indent, content) => {
    return `${indent}<input type="checkbox" checked disabled style="accent-color:${theme.accent};margin-right:8px;" />${content}`;
  });

  processed = processed.replace(/^(\s*)- \[ \] (.*)$/gm, (match, indent, content) => {
    return `${indent}<input type="checkbox" disabled style="accent-color:${theme.accent};margin-right:8px;" />${content}`;
  });

  // Convert wikilinks [[Title]] to special spans
  processed = processed.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    return `<span class="wikilink" data-title="${title}" style="color:${theme.accent};border-bottom:1px dashed ${theme.accent};cursor:pointer;text-decoration:none;">${title}</span>`;
  });

  return processed;
}

const previewStyles = {
  container: {
    fontSize: 15,
    lineHeight: 1.7,
    color: theme.textMuted,
    fontFamily: theme.fontBody,
  },
  empty: {
    color: theme.textDim,
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: 40,
  },
  toc: {
    padding: "12px 16px",
    background: theme.bgSubtle,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadiusSm,
    marginBottom: 20,
  },
  tocTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: theme.textDim,
    marginBottom: 8,
    fontWeight: 600,
  },
};

export default function MarkdownPreview({ body }) {
  const html = useMemo(() => {
    if (!body || !body.trim()) return "";

    const preprocessed = preprocessMarkdown(body);

    try {
      // Use marked with our custom renderer extensions
      const rawHtml = marked(preprocessed, {
        gfm: true,
        breaks: true,
      });

      // Apply post-processing to add inline styles to elements the renderer can't override
      let styled = rawHtml;

      // Style <ul> and <ol>
      styled = styled.replace(/<ul>/g, `<ul style="color:${theme.textMuted};padding-left:1.5em;margin-bottom:1em;">`);
      styled = styled.replace(/<ol>/g, `<ol style="color:${theme.textMuted};padding-left:1.5em;margin-bottom:1em;">`);
      styled = styled.replace(/<li>/g, `<li style="line-height:1.7;margin-bottom:0.25em;">`);

      // Style <table>
      styled = styled.replace(/<table>/g, `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:1em 0;">`);
      styled = styled.replace(/<thead>/g, `<thead style="background:${theme.bgSubtle};">`);
      styled = styled.replace(/<th>/g, `<th style="padding:8px 12px;text-align:left;font-weight:600;color:${theme.text};border-bottom:1px solid ${theme.border};">`);
      styled = styled.replace(/<td>/g, `<td style="padding:8px 12px;color:${theme.textMuted};border-bottom:1px solid ${theme.border};">`);
      styled = styled.replace(/<tr>/g, `<tr style="border-bottom:1px solid ${theme.border};">`);

      // Style <img>
      styled = styled.replace(/<img /g, `<img style="max-width:100%;border-radius:${theme.borderRadiusSm};margin:1em 0;" `);

      // Style <pre> and <code> blocks that weren't caught by renderer
      styled = styled.replace(/<pre>(?!.*style)/g, `<pre style="background:${theme.bg};border:1px solid ${theme.border};border-radius:${theme.borderRadiusSm};padding:16px;overflow-x:auto;">`);
      styled = styled.replace(/<blockquote>/g, `<blockquote style="border-left:3px solid ${theme.accent};padding-left:16px;margin:1em 0;color:${theme.textDim};">`);

      // Add IDs to headings so TOC links work
      styled = addHeadingIds(styled);

      const clean = DOMPurify.sanitize(styled, {
        ADD_TAGS: ["input", "span", "style"],
        ADD_ATTR: [
          "type", "checked", "disabled", "style", "class", "data-title",
          "target", "rel", "id",
        ],
      });
      return clean;
    } catch (err) {
      console.error("Markdown parse error:", err);
      return `<p style="color:${theme.danger};">Error rendering markdown: ${err.message}</p>`;
    }
  }, [body]);

  // Extract TOC headings
  const toc = useMemo(() => {
    if (!body) return [];
    // Strip fenced code blocks so headings inside them are ignored
    const stripped = body.replace(/```[\s\S]*?```/g, "");
    const headings = [];
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(stripped)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[*_`#[\]]/g, ""),
      });
    }
    return headings;
  }, [body]);

  if (!body || !body.trim()) {
    return <div style={previewStyles.empty}>No content yet. Start writing...</div>;
  }

  return (
    <div style={previewStyles.container}>
      {/* TOC */}
      {toc.length > 2 && (
        <div style={previewStyles.toc}>
          <div style={previewStyles.tocTitle}>Table of Contents</div>
          {toc.map((h, i) => {
            const slug = h.text
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .slice(0, 60);
            return (
              <a
                key={i}
                href={`#${slug}-${i}`}
                style={{
                  display: "block",
                  paddingLeft: (h.level - 1) * 16,
                  color: theme.accent,
                  textDecoration: "none",
                  fontSize: 12,
                  lineHeight: 2,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  const targetId = `${slug}-${i}`;
                  const el = document.getElementById(targetId);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {h.text}
              </a>
            );
          })}
        </div>
      )}

      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
