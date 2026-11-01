/**
 * ShortcutOverlay — Ctrl+? keyboard shortcut cheat sheet.
 */

import { useState, useEffect, useCallback } from "react";
import styles from "./ShortcutOverlay.module.css";

const SHORTCUTS = [
  { keys: "Ctrl+Shift+P", desc: "Command Palette" },
  { keys: "Ctrl+Shift+F", desc: "Find in Files" },
  { keys: "Ctrl+S", desc: "Save File" },
  { keys: "Ctrl+?", desc: "Keyboard Shortcuts" },
  { keys: "Ctrl+`", desc: "Toggle Terminal" },
  { keys: "Ctrl+B", desc: "Toggle Sidebar" },
  { keys: "Ctrl+J", desc: "Toggle AI Assistant" },
  { keys: "Ctrl+W", desc: "Close Current Tab" },
  { keys: "Ctrl+Tab", desc: "Next Tab" },
  { keys: "Ctrl+Shift+Tab", desc: "Previous Tab" },
  { keys: "Ctrl+F", desc: "Find in File (Monaco)" },
  { keys: "Ctrl+H", desc: "Find and Replace (Monaco)" },
  { keys: "Ctrl+G", desc: "Go to Line (Monaco)" },
];

export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, toggle]);

  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("open-shortcuts", handler);
    return () => window.removeEventListener("open-shortcuts", handler);
  }, [toggle]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Keyboard Shortcuts</h2>
        <div className={styles.grid}>
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className={styles.row}>
              <kbd className={styles.keys}>{s.keys}</kbd>
              <span className={styles.desc}>{s.desc}</span>
            </div>
          ))}
        </div>
        <p className={styles.hint}>Press Escape to close</p>
      </div>
    </div>
  );
}
