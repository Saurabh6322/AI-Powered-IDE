/**
 * EditorPane — hosts the tab bar and the Monaco editor.
 *
 * Shows an empty-state when no files are open.
 */

import { useState, useCallback } from "react";
import { useWorkspaceState } from "../../contexts/WorkspaceContext";
import TabBar from "../TabBar/TabBar";
import Breadcrumbs from "../Breadcrumbs/Breadcrumbs";
import MonacoEditorWrapper from "../MonacoEditor/MonacoEditor";
import TerminalPane from "../Terminal/TerminalPane";
import HorizontalResizeHandle from "../ResizeHandle/HorizontalResizeHandle";
import styles from "./EditorPane.module.css";

export default function EditorPane() {
  const { openFiles, activeFilePath } = useWorkspaceState();
  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(250);

  const handleTerminalResize = useCallback((newHeight: number) => {
    // Clamp terminal height between 100px and 80% of window height
    const max = window.innerHeight * 0.8;
    const clamped = Math.min(max, Math.max(100, newHeight));
    setTerminalHeight(clamped);
    if (clamped > 100 && !terminalOpen) {
      setTerminalOpen(true);
    }
  }, [terminalOpen]);

  const toggleTerminal = () => setTerminalOpen((prev) => !prev);

  return (
    <div className={styles.pane}>
      {/* Top half: Tab bar and Editor */}
      <div className={styles.editorSection}>
        <TabBar />
        <Breadcrumbs />

        {activeFile ? (
          <MonacoEditorWrapper file={activeFile} />
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyContent}>
              <svg
                className={styles.emptyIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p className={styles.emptyTitle}>No file open</p>
              <p className={styles.emptyHint}>
                Select a file from the explorer to start editing
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Footer Actions */}
      <div className={styles.footer}>
        <button className={styles.footerBtn} onClick={toggleTerminal} title="Toggle Terminal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Terminal
        </button>
      </div>

      {/* Bottom half: Terminal Pane */}
      {terminalOpen && (
        <>
          <HorizontalResizeHandle onResize={handleTerminalResize} />
          <div className={styles.terminalSection} style={{ height: terminalHeight }}>
            <TerminalPane isVisible={terminalOpen} />
          </div>
        </>
      )}
    </div>
  );
}
