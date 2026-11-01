/**
 * StatusBar — bottom bar showing line/col, language, encoding, and Git branch.
 */

import { useState, useEffect } from "react";
import { useWorkspaceState } from "../../contexts/WorkspaceContext";
import styles from "./StatusBar.module.css";

export default function StatusBar() {
  const { openFiles, activeFilePath } = useWorkspaceState();
  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const [gitBranch, setGitBranch] = useState<string>("");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  useEffect(() => {
    fetch("/api/git/status")
      .then((r) => r.json())
      .then((data) => setGitBranch(data.branch || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setCursorPos({ line: detail.line ?? 1, col: detail.col ?? 1 });
      }
    };
    window.addEventListener("cursor-position", handler);
    return () => window.removeEventListener("cursor-position", handler);
  }, []);

  const lang = activeFile?.language || "plaintext";
  const filePath = activeFile?.path || "";

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {gitBranch && (
          <span className={styles.item} title="Git Branch">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            {gitBranch}
          </span>
        )}
        {filePath && (
          <span className={styles.item} title={filePath}>
            {filePath}
          </span>
        )}
      </div>
      <div className={styles.right}>
        {activeFile && (
          <>
            <span className={styles.item}>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span className={styles.item}>{lang}</span>
            <span className={styles.item}>UTF-8</span>
          </>
        )}
      </div>
    </div>
  );
}
