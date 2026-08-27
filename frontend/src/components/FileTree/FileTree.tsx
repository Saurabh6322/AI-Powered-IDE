/**
 * FileTree — recursive tree view for the file explorer.
 *
 * Directories expand/collapse on click.  Files open in the editor.
 */

import { useState, useCallback } from "react";
import {
  useWorkspaceState,
  useWorkspaceDispatch,
  type TreeNode,
} from "../../contexts/WorkspaceContext";
import { useFileSystem, detectLanguage } from "../../hooks/useFileSystem";
import styles from "./FileTree.module.css";

interface FileTreeProps {
  nodes: TreeNode[];
  depth: number;
}

export default function FileTree({ nodes, depth }: FileTreeProps) {
  return (
    <ul className={styles.list} role="tree">
      {nodes.map((node) => (
        <TreeItem key={node.path} node={node} depth={depth} />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Individual tree item                                                */
/* ------------------------------------------------------------------ */

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { activeFilePath } = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();
  const { readFile } = useFileSystem();

  const isActive = activeFilePath === node.path;
  const isDir = node.type === "directory";

  const handleClick = useCallback(async () => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      try {
        const content = await readFile(node.path);
        dispatch({
          type: "OPEN_FILE",
          file: {
            path: node.path,
            name: node.name,
            content,
            language: detectLanguage(node.name),
            isDirty: false,
          },
        });
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    }
  }, [isDir, node, readFile, dispatch]);

  return (
    <li className={styles.item} role="treeitem" aria-expanded={isDir ? expanded : undefined}>
      <button
        className={`${styles.row} ${isActive ? styles.active : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        title={node.path}
      >
        {/* Chevron for directories */}
        {isDir ? (
          <svg
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : (
          <span className={styles.chevronSpacer} />
        )}

        {/* Icon */}
        {isDir ? (
          <svg
            className={styles.fileIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        ) : (
          <svg
            className={styles.fileIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}

        {/* Name */}
        <span className={styles.name}>{node.name}</span>
      </button>

      {/* Children (recursive) */}
      {isDir && expanded && node.children && (
        <FileTree nodes={node.children} depth={depth + 1} />
      )}
    </li>
  );
}
