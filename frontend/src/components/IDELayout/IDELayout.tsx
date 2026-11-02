/**
 * IDELayout — top-level shell.
 *
 * Structure:
 *   [TitleBar]                                           ← full width
 *   [Sidebar] [ResizeHandle] [EditorPane] [ChatPanel?]   ← grid row
 *   [StatusBar]                                          ← full width
 *   [CommandPalette]  [FindInFiles]  [ShortcutOverlay]   ← overlays
 *   [ToastContainer]                                     ← fixed position
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import Sidebar from "../Sidebar/Sidebar";
import ResizeHandle from "../ResizeHandle/ResizeHandle";
import EditorPane from "../EditorPane/EditorPane";
import ThemeSwitcher from "../ThemeSwitcher/ThemeSwitcher";
import ChatPanel from "../ChatPanel/ChatPanel";
import StatusBar from "../StatusBar/StatusBar";
import CommandPalette, { type Command } from "../CommandPalette/CommandPalette";
import FindInFiles from "../FindInFiles/FindInFiles";
import ShortcutOverlay from "../ShortcutOverlay/ShortcutOverlay";
import ToastContainer from "../Toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import styles from "./IDELayout.module.css";

export default function IDELayout() {
  const { user, logout } = useAuth();
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const handleResize = useCallback((newWidth: number) => {
    const clamped = Math.min(480, Math.max(180, newWidth));
    setSidebarWidth(clamped);
  }, []);

  // Listen for `open-chat` events from the editor's AI actions
  useEffect(() => {
    const handleOpenChat = () => setChatOpen(true);
    window.addEventListener("open-chat", handleOpenChat);
    return () => window.removeEventListener("open-chat", handleOpenChat);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+B: toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarVisible((prev) => !prev);
      }
      // Ctrl+J: toggle AI panel
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Command palette commands
  const commands: Command[] = useMemo(
    () => [
      {
        id: "toggle-ai",
        label: "Toggle AI Assistant",
        shortcut: "Ctrl+J",
        category: "View",
        action: () => setChatOpen((prev) => !prev),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        shortcut: "Ctrl+B",
        category: "View",
        action: () => setSidebarVisible((prev) => !prev),
      },
      {
        id: "find-in-files",
        label: "Find in Files",
        shortcut: "Ctrl+Shift+F",
        category: "Search",
        action: () =>
          window.dispatchEvent(new CustomEvent("open-find-in-files")),
      },
      {
        id: "shortcuts",
        label: "Keyboard Shortcuts",
        shortcut: "Ctrl+/",
        category: "Help",
        action: () =>
          window.dispatchEvent(new CustomEvent("open-shortcuts")),
      },
      {
        id: "toggle-terminal",
        label: "Toggle Terminal",
        shortcut: "Ctrl+`",
        category: "View",
        action: () =>
          window.dispatchEvent(new CustomEvent("toggle-terminal")),
      },
    ],
    []
  );

  const gridCols = [
    sidebarVisible ? `${sidebarWidth}px` : "",
    sidebarVisible ? "auto" : "",
    "1fr",
    chatOpen ? "360px" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <header className={styles.titleBar}>
        <span className={styles.titleText}>
          <svg className={styles.titleLogo} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
          </svg>
          AI Powered IDE
        </span>
        <div className={styles.titleActions}>
          <button
            className={`${styles.iconBtn} ${chatOpen ? styles.iconBtnActive : ""}`}
            onClick={() => setChatOpen((prev) => !prev)}
            title={chatOpen ? "Close AI Assistant (Ctrl+J)" : "Open AI Assistant (Ctrl+J)"}
            aria-label="Toggle AI Assistant"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </button>
          <ThemeSwitcher />
          {user && (
            <div className={styles.userInfo}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className={styles.avatar} />
              ) : (
                <span className={styles.avatarFallback}>
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className={styles.userName}>{user.name}</span>
              <button className={styles.logoutBtn} onClick={logout} title="Sign out">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content grid */}
      <div
        className={styles.layout}
        style={{ gridTemplateColumns: gridCols }}
      >
        {sidebarVisible && <Sidebar />}
        {sidebarVisible && <ResizeHandle onResize={handleResize} />}
        <EditorPane />
        {chatOpen && <ChatPanel />}
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Overlays */}
      <CommandPalette commands={commands} />
      <FindInFiles />
      <ShortcutOverlay />
      <ToastContainer />
    </div>
  );
}
