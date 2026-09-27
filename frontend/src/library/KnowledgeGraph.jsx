import { useState, useEffect, useCallback } from "react";
import { DataSet, Network } from "vis-network/standalone";
import theme from "./theme";

export default function KnowledgeGraph({ onNavigate, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error("Failed to load graph data");
      const data = await res.json();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let destroyed = false;

    const init = async () => {
      const data = await fetchGraph();
      if (destroyed || !data) {
        setLoading(false);
        return;
      }

      // vis-network is bundled, so the graph works offline and no third party
      // script is pulled into the page.
      try {
        const container = document.getElementById("graph-container");
        if (!container || destroyed) {
          setLoading(false);
          return;
        }

        const nodes = new DataSet(data.nodes);
        const edges = new DataSet(data.edges);

        const options = {
          nodes: {
            shape: "dot",
            size: 16,
            font: { size: 12, face: "Inter, sans-serif", color: "#f1f5f9" },
            borderWidth: 1,
            borderWidthSelected: 2,
          },
          edges: {
            smooth: { type: "continuous" },
            width: 1.5,
          },
          physics: {
            barnesHut: {
              gravitationalConstant: -3000,
              centralGravity: 0.3,
              springLength: 150,
              springConstant: 0.04,
            },
            stabilization: { iterations: 100 },
          },
          interaction: {
            hover: true,
            tooltipDelay: 200,
            navigationButtons: true,
            keyboard: true,
          },
        };

        const network = new Network(container, { nodes, edges }, options);

        network.on("doubleClick", (params) => {
          if (params.nodes.length > 0 && onNavigate) {
            onNavigate(params.nodes[0]);
          }
        });

        // Store network for search
        window._graphNetwork = network;
        window._graphNodes = nodes;
      } catch (err) {
        console.error("graph render error:", err);
        setError("Failed to render the graph.");
      }
      setLoading(false);
    };

    init();
    return () => { destroyed = true; };
  }, [fetchGraph, onNavigate]);

  const handleSearch = (term) => {
    setSearchTerm(term);
    if (window._graphNetwork && window._graphNodes) {
      const network = window._graphNetwork;
      const nodes = window._graphNodes;
      if (!term.trim()) {
        network.selectNodes([]);
        return;
      }
      const allNodes = nodes.get();
      const matches = allNodes.filter(
        (n) => n.label && n.label.toLowerCase().includes(term.toLowerCase())
      );
      if (matches.length > 0) {
        network.selectNodes(matches.map((m) => m.id));
        network.focus(matches[0].id, { scale: 1.5, animation: true });
      }
    }
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
      display: "flex",
      flexDirection: "column",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "12px 20px",
      background: theme.bgCard,
      borderBottom: `1px solid ${theme.border}`,
      zIndex: 10,
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
      fontSize: 18,
      fontWeight: 700,
      color: theme.heading,
      fontFamily: theme.fontHeading,
      margin: 0,
    },
    searchInput: {
      background: theme.bgSubtle,
      border: `1px solid ${theme.border}`,
      borderRadius: theme.borderRadiusSm,
      color: theme.text,
      padding: "6px 12px",
      fontSize: 13,
      width: 200,
      outline: "none",
    },
    container: {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      minHeight: 0, // Allow flex shrinking
    },
    legend: {
      position: "absolute",
      bottom: 20,
      left: 20,
      background: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: theme.borderRadiusSm,
      padding: 16,
      zIndex: 10,
    },
    legendItem: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
      fontSize: 12,
      color: theme.textMuted,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: "50%",
      display: "inline-block",
    },
    loading: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
      color: theme.textMuted,
      fontSize: 14,
    },
    error: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
      color: theme.danger,
      fontSize: 14,
    },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} onMouseEnter={(e) => { e.target.style.borderColor = theme.accent; e.target.style.color = theme.accent; }} onMouseLeave={(e) => { e.target.style.borderColor = theme.border; e.target.style.color = theme.textMuted; }}>
          ← Back
        </button>
        <h1 style={styles.title}>🕸️ Knowledge Graph</h1>
        <div style={{ flex: 1 }} />
        <input
          style={styles.searchInput}
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div style={styles.container}>
        <div
          id="graph-container"
          style={{ width: "100%", height: "100%" }}
        />
        {loading && (
          <div style={{ ...styles.loading, position: "absolute", inset: 0, background: theme.bg }}>
            Loading graph...
          </div>
        )}
        {error && (
          <div style={{ ...styles.error, position: "absolute", inset: 0, background: theme.bg }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <div style={styles.legend}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: "#06b6d4" }} />
              Parent note (has children)
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: "#94a3b8" }} />
              Leaf note
            </div>
            <div style={{ ...styles.legendItem, marginTop: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
              <span style={{ color: "#475569" }}>━━</span> Parent → Child
            </div>
            <div style={styles.legendItem}>
              <span style={{ color: "#06b6d4" }}>╌╌</span> Wikilink
            </div>
            <div style={{ ...styles.legendItem, marginTop: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 8, color: theme.textDim }}>
              Double-click a node to open note
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
