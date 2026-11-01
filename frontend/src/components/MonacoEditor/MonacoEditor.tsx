/**
 * MonacoEditor — wraps @monaco-editor/react with IDE + Yjs integration.
 *
 * - Auto-detects language from file extension
 * - Binds to a shared Y.Text via y-monaco for real-time collaborative editing
 * - Shows remote cursors via Yjs awareness
 * - Ctrl+S / Cmd+S saves the file to the backend
 * - AI context menu: "AI: Explain Code" and "AI: Find Bugs"
 * - Listens for `ai-insert` custom events to insert AI-generated code at cursor
 */

import { useCallback, useRef, useEffect, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import {
  useWorkspaceDispatch,
  type OpenFile,
} from "../../contexts/WorkspaceContext";
import { useFileSystem } from "../../hooks/useFileSystem";
import { useTheme } from "../../contexts/ThemeContext";
import { useCollaboration } from "../../contexts/CollaborationContext";
import { useLSPMonaco } from "../../hooks/useLSPMonaco";
import styles from "./MonacoEditor.module.css";

interface MonacoEditorWrapperProps {
  file: OpenFile;
}

export default function MonacoEditorWrapper({ file }: MonacoEditorWrapperProps) {
  const dispatch = useWorkspaceDispatch();
  const { writeFile } = useFileSystem();
  const { theme } = useTheme();
  const { doc, provider } = useCollaboration();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const [monacoRef, setMonacoRef] = useState<typeof import("monaco-editor") | null>(null);

  // LSP integration
  const { sendDidChange } = useLSPMonaco(
    editorRef.current,
    monacoRef,
    file.language,
    file.path,
    file.content
  );

  // Map our theme names to Monaco theme identifiers
  const monacoTheme = theme === "light" ? "vs" : "vs-dark";

  const handleMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      setMonacoRef(monacoInstance);

      // Register Ctrl+S / Cmd+S to save
      editorInstance.addAction({
        id: "save-file",
        label: "Save File",
        keybindings: [
          monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        ],
        run: async () => {
          const content = editorInstance.getValue();
          try {
            await writeFile(file.path, content);
            dispatch({ type: "MARK_SAVED", path: file.path });
          } catch (err) {
            console.error("Save failed:", err);
          }
        },
      });

      // --- AI Context Menu Actions ---

      editorInstance.addAction({
        id: "ai-explain-code",
        label: "AI: Explain Code",
        contextMenuGroupId: "9_ai",
        contextMenuOrder: 1,
        run: () => {
          const selection = editorInstance.getSelection();
          const model = editorInstance.getModel();
          if (!selection || !model) return;
          const selectedText = model.getValueInRange(selection);
          if (!selectedText.trim()) return;

          const lang = file.language || "text";
          const prompt = `Explain this ${lang} code:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``;

          // Open the chat panel and send the prompt
          window.dispatchEvent(new CustomEvent("open-chat"));
          window.dispatchEvent(
            new CustomEvent("ai-prompt", { detail: { prompt } })
          );
        },
      });

      editorInstance.addAction({
        id: "ai-find-bugs",
        label: "AI: Find Bugs",
        contextMenuGroupId: "9_ai",
        contextMenuOrder: 2,
        run: () => {
          const selection = editorInstance.getSelection();
          const model = editorInstance.getModel();
          if (!selection || !model) return;
          const selectedText = model.getValueInRange(selection);
          if (!selectedText.trim()) return;

          const lang = file.language || "text";
          const prompt = `Find bugs and potential issues in this ${lang} code. Suggest fixes:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``;

          window.dispatchEvent(new CustomEvent("open-chat"));
          window.dispatchEvent(
            new CustomEvent("ai-prompt", { detail: { prompt } })
          );
        },
      });

      // --- Yjs / y-monaco binding ---
      // Get or create a Y.Text for this file path
      const ytext = doc.getText(`file:${file.path}`);

      // If this is the first client to open this file, seed the CRDT
      // with the file content loaded from disk.
      if (ytext.length === 0 && file.content) {
        doc.transact(() => {
          ytext.insert(0, file.content);
        });
      }

      // Bind the Y.Text to the Monaco editor model
      const model = editorInstance.getModel();
      if (model) {
        bindingRef.current = new MonacoBinding(
          ytext,
          model,
          new Set([editorInstance]),
          provider?.awareness ?? undefined
        );
      }

      // Emit cursor position for the StatusBar
      editorInstance.onDidChangeCursorPosition((e) => {
        window.dispatchEvent(
          new CustomEvent("cursor-position", {
            detail: { line: e.position.lineNumber, col: e.position.column },
          })
        );
      });

      editorInstance.focus();
    },
    [file.path, file.content, file.language, writeFile, dispatch, doc, provider]
  );

  // Listen for `ai-insert` events to insert code at the cursor
  useEffect(() => {
    const handleAiInsert = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const editor = editorRef.current;
      if (!editor || !detail?.code) return;

      const selection = editor.getSelection();
      if (!selection) return;

      editor.executeEdits("ai-assistant", [
        {
          range: selection,
          text: detail.code,
          forceMoveMarkers: true,
        },
      ]);
      editor.focus();
    };

    window.addEventListener("ai-insert", handleAiInsert);
    return () => window.removeEventListener("ai-insert", handleAiInsert);
  }, []);

  // Clean up the binding when the file changes or unmounts
  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [file.path]);

  // Track local changes for dirty state (Yjs drives the content now)
  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        dispatch({ type: "UPDATE_CONTENT", path: file.path, content: value });
        sendDidChange(value);
      }
    },
    [file.path, dispatch, sendDidChange]
  );

  return (
    <div className={styles.wrapper}>
      <Editor
        key={file.path}
        defaultValue={file.content}
        language={file.language}
        theme={monacoTheme}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          lineNumbers: "on",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 12 },
          renderLineHighlight: "gutter",
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
          wordWrap: "off",
          tabSize: 2,
        }}
      />
    </div>
  );
}

