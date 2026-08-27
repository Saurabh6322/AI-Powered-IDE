/**
 * TabBar — horizontal bar of open file tabs.
 */

import { useWorkspaceState, useWorkspaceDispatch } from "../../contexts/WorkspaceContext";
import styles from "./TabBar.module.css";

export default function TabBar() {
  const { openFiles, activeFilePath } = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();

  if (openFiles.length === 0) return null;

  return (
    <div className={styles.tabBar} role="tablist">
      {openFiles.map((file) => {
        const isActive = file.path === activeFilePath;
        return (
          <button
            key={file.path}
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE", path: file.path })}
            onAuxClick={(e) => {
              // Middle-click to close
              if (e.button === 1) {
                dispatch({ type: "CLOSE_FILE", path: file.path });
              }
            }}
            title={file.path}
          >
            <span className={styles.tabName}>
              {file.isDirty && <span className={styles.dirty}>●</span>}
              {file.name}
            </span>
            <span
              className={styles.closeBtn}
              role="button"
              aria-label={`Close ${file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "CLOSE_FILE", path: file.path });
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
