/**
 * TerminalPane — wraps xterm.js and manages the WebSocket connection to the backend Docker sandbox.
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTheme } from "../../contexts/ThemeContext";
import "@xterm/xterm/css/xterm.css";
import styles from "./TerminalPane.module.css";

interface TerminalPaneProps {
  isVisible: boolean;
}

const XTERM_THEMES: Record<string, any> = {
  dark: {
    background: "#0f1117",
    foreground: "#e2e8f0",
    cursor: "#7c3aed",
    selectionBackground: "rgba(124, 58, 237, 0.3)",
    black: "#1e2235",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#e2e8f0",
    brightBlack: "#64748b",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: "#f8fafc",
  },
  light: {
    background: "#ffffff",
    foreground: "#1a1d27",
    cursor: "#6d28d9",
    selectionBackground: "rgba(109, 40, 217, 0.2)",
    black: "#1a1d27",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#e2e5ea",
    brightBlack: "#5a6070",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff",
  },
  custom: {
    background: "#1a1a2e",
    foreground: "#f8f8f2",
    cursor: "#bd93f9",
    selectionBackground: "rgba(189, 147, 249, 0.3)",
    black: "#2d3a5e",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#8be9fd",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#7a80a0",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  }
};

export default function TerminalPane({ isVisible }: TerminalPaneProps) {
  const { theme } = useTheme();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = XTERM_THEMES[theme];
    }
  }, [theme]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      theme: XTERM_THEMES[theme], // Set initial theme
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial resize
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: xterm.cols, rows: xterm.rows }));
      }
    };

    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      xterm.write(data);
    };

    ws.onclose = () => {
      xterm.write("\r\n\x1b[31m[Terminal Connection Closed]\x1b[0m\r\n");
    };

    // Forward keystrokes to WebSocket
    const inputDisposable = xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", data }));
      }
    });

    // Forward resize events
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      inputDisposable.dispose();
      resizeDisposable.dispose();
      ws.close();
      xterm.dispose();
    };
  }, []);

  // Handle resizing when visibility or container size changes
  useEffect(() => {
    if (isVisible) {
      // Small timeout to allow DOM to layout before fitting
      const timeout = setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [isVisible]);

  // Handle window resize events
  useEffect(() => {
    const handleResize = () => {
      if (isVisible) fitAddonRef.current?.fit();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isVisible]);

  return (
    <div
      className={styles.container}
      style={{ display: isVisible ? "block" : "none" }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Terminal</span>
      </div>
      <div className={styles.terminalWrapper} ref={terminalRef} />
    </div>
  );
}
