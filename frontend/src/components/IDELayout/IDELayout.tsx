/**
 * IDELayout — top-level shell.
 *
 * Structure:
 *   [TitleBar]                                          ← full width, theme dot + AI toggle top-right
 *   [Sidebar] [ResizeHandle] [EditorPane] [ChatPanel?]  ← grid row
 */

import { useState, useCallback, useEffect } from "react";
import Sidebar from "../Sidebar/Sidebar";
import ResizeHandle from "../ResizeHandle/ResizeHandle";
import EditorPane from "../EditorPane/EditorPane";
import ThemeSwitcher from "../ThemeSwitcher/ThemeSwitcher";
import ChatPanel from "../ChatPanel/ChatPanel";
import styles from "./IDELayout.module.css";

export default function IDELayout() {
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatOpen, setChatOpen] = useState(false);

  const handleResize = useCallback((newWidth: number) => {
    const clamped = Math.min(480, Math.max(180, newWidth));
    setSidebarWidth(clamped);
  }, []);

  // Listen for `open-chat` events dispatched from the editor's AI actions
  useEffect(() => {
    const handleOpenChat = () => setChatOpen(true);
    window.addEventListener("open-chat", handleOpenChat);
    return () => window.removeEventListener("open-chat", handleOpenChat);
  }, []);

  const gridCols = chatOpen
    ? `${sidebarWidth}px auto 1fr 360px`
    : `${sidebarWidth}px auto 1fr`;

  return (
    <div className={styles.shell}>
      {/* Title bar */}
      <header className={styles.titleBar}>
        <span className={styles.titleText}>Antigravity IDE</span>
        <div className={styles.titleActions}>
          <button
            className={`${styles.aiToggle} ${chatOpen ? styles.aiToggleActive : ""}`}
            onClick={() => setChatOpen((prev) => !prev)}
            title={chatOpen ? "Close AI Assistant" : "Open AI Assistant"}
            aria-label="Toggle AI Assistant"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </button>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Main content grid */}
      <div
        className={styles.layout}
        style={{ gridTemplateColumns: gridCols }}
      >
        <Sidebar />
        <ResizeHandle onResize={handleResize} />
        <EditorPane />
        {chatOpen && <ChatPanel />}
      </div>
    </div>
  );
}

