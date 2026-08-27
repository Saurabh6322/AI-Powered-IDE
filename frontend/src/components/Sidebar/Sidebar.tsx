/**
 * Sidebar — file explorer panel on the left of the IDE.
 *
 * Connects to the backend file-watcher WebSocket so the tree
 * auto-refreshes when files are created/deleted (e.g. via terminal).
 */

import { useEffect, useRef, useCallback } from "react";
import {
  useWorkspaceState,
  useWorkspaceDispatch,
} from "../../contexts/WorkspaceContext";
import { useFileSystem } from "../../hooks/useFileSystem";
import FileTree from "../FileTree/FileTree";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
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
    </aside>
  );
}
