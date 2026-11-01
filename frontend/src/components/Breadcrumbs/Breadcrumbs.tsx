/**
 * Breadcrumbs — clickable file path navigation above the editor.
 */

import { useWorkspaceState } from "../../contexts/WorkspaceContext";
import styles from "./Breadcrumbs.module.css";

export default function Breadcrumbs() {
  const { activeFilePath } = useWorkspaceState();

  if (!activeFilePath) return null;

  const parts = activeFilePath.split("/");

  return (
    <nav className={styles.bar} aria-label="Breadcrumb">
      {parts.map((part, i) => (
        <span key={i} className={styles.segment}>
          {i > 0 && <span className={styles.sep}>/</span>}
          <span className={i === parts.length - 1 ? styles.current : styles.part}>
            {part}
          </span>
        </span>
      ))}
    </nav>
  );
}
