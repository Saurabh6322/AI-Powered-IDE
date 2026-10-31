/**
 * Sidebar — file explorer + git panel with tab switching.
 *
 * Connects to the backend file-watcher WebSocket so the tree
 * auto-refreshes when files are created/deleted (e.g. via terminal).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useWorkspaceState,
  useWorkspaceDispatch,
} from "../../contexts/WorkspaceContext";
import { useFileSystem } from "../../hooks/useFileSystem";
import FileTree from "../FileTree/FileTree";
import GitPanel from "../GitPanel/GitPanel";
import styles from "./Sidebar.module.css";

type SidebarTab = "files" | "git";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("files");
  const { fileTree } = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();
  const { fetchTree } = useFileSystem();
  const wsRef = useRef<WebSocket | null>(null);

  const refreshTree = useCallback(() => {
    fetchTree().then((tree) => dispatch({ type: "SET_TREE", tree }));
  }, [fetchTree, dispatch]);

  // Initial fetch
  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  // Connect to file-watcher WebSocket for live updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/files/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "fs_change") {
          refreshTree();
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      // Reconnect after a short delay
      setTimeout(() => {
        // Component might have unmounted; check ref
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [refreshTree]);

  return (
    <aside className={styles.sidebar}>
      {/* Tab switcher */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "files" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("files")}
          title="Explorer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          className={`${styles.tab} ${activeTab === "git" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("git")}
          title="Source Control"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {activeTab === "files" ? (
        <>
          <header className={styles.header}>
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className={styles.title}>Explorer</span>
          </header>

          <div className={styles.treeContainer}>
            {fileTree.length === 0 ? (
              <p className={styles.empty}>No files found</p>
            ) : (
              <FileTree nodes={fileTree} depth={0} />
            )}
          </div>
        </>
      ) : (
        <>
          <header className={styles.header}>
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span className={styles.title}>Source Control</span>
          </header>

          <GitPanel />
        </>
      )}
    </aside>
  );
}
