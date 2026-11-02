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
                fill="currentColor"
              >
                <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
              </svg>
              <p className={styles.emptyTitle}>AI Powered IDE</p>
              <p className={styles.emptyHint}>
                Open a file from the explorer to start editing
              </p>
              <div className={styles.shortcuts}>
                <div className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>Ctrl+Shift+P</kbd>
                  <span>Command Palette</span>
                </div>
                <div className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>Ctrl+Shift+F</kbd>
                  <span>Find in Files</span>
                </div>
                <div className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>Ctrl+J</kbd>
                  <span>AI Assistant</span>
                </div>
                <div className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>Ctrl+B</kbd>
                  <span>Toggle Sidebar</span>
                </div>
              </div>
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
