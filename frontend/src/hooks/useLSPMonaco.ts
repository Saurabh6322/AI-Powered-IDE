/**
 * useLSPMonaco — connects an LSP session to a Monaco editor instance.
 *
 * Handles:
 *  - Initializing the LSP with textDocument/didOpen
 *  - Sending textDocument/didChange on edits
 *  - Registering a CompletionItemProvider for autocomplete
 *  - Registering a HoverProvider for hover info
 *  - Listening for textDocument/publishDiagnostics and setting Monaco markers
 */

import { useRef, useEffect, useCallback } from "react";
import type { editor, IDisposable } from "monaco-editor";
import { useLSP, type LSPMessage } from "./useLSP";

const LSP_LANGUAGES = new Set(["python", "typescript", "typescriptreact", "javascript", "javascriptreact"]);

function languageToLSPId(monacoLang: string): string | null {
  if (monacoLang === "python") return "python";
  if (["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(monacoLang))
    return "typescript";
  return null;
}

function fileUri(path: string): string {
  return `file:///${path.replace(/\\/g, "/")}`;
}

// LSP CompletionItemKind → Monaco CompletionItemKind
function mapCompletionKind(kind: number | undefined): number {
  const map: Record<number, number> = {
    1: 18, // Text
    2: 1,  // Method
    3: 1,  // Function
    4: 8,  // Constructor
    5: 4,  // Field
    6: 5,  // Variable
    7: 7,  // Class
    8: 7,  // Interface
    9: 8,  // Module
    10: 9, // Property
    13: 14, // Enum
    14: 0,  // Keyword
    15: 17, // Snippet
  };
  return map[kind ?? 1] ?? 18;
}

export function useLSPMonaco(
  editorInstance: editor.IStandaloneCodeEditor | null,
  monacoInstance: typeof import("monaco-editor") | null,
  language: string,
  filePath: string,
  content: string
) {
  const lspLang = languageToLSPId(language);
  const { connected, connect, disconnect, sendRequest, sendNotification, onMessage } =
    useLSP(lspLang);
  const initializedRef = useRef(false);
  const disposablesRef = useRef<IDisposable[]>([]);
  const versionRef = useRef(0);

  // Connect when a supported language file is opened
  useEffect(() => {
    if (!lspLang || !LSP_LANGUAGES.has(language)) return;
    connect();
    return () => {
      disconnect();
      initializedRef.current = false;
    };
  }, [lspLang, language, connect, disconnect]);

  // Initialize LSP session once connected
  useEffect(() => {
    if (!connected || initializedRef.current || !lspLang) return;

    (async () => {
      try {
        await sendRequest("initialize", {
          processId: null,
          capabilities: {
            textDocument: {
              completion: { completionItem: { snippetSupport: true } },
              hover: { contentFormat: ["markdown", "plaintext"] },
              publishDiagnostics: { relatedInformation: true },
            },
          },
          rootUri: fileUri("workspace"),
          workspaceFolders: [{ uri: fileUri("workspace"), name: "workspace" }],
        });
        sendNotification("initialized", {});
        initializedRef.current = true;

        // Send didOpen for the current file
        versionRef.current = 1;
        sendNotification("textDocument/didOpen", {
          textDocument: {
            uri: fileUri(filePath),
            languageId: lspLang === "typescript" ? language : lspLang,
            version: versionRef.current,
            text: content,
          },
        });
      } catch (e) {
        console.warn("[LSP] Initialize failed:", e);
      }
    })();
  }, [connected, lspLang, language, filePath, content, sendRequest, sendNotification]);

  // Send didChange on content edits
  const sendDidChange = useCallback(
    (newContent: string) => {
      if (!connected || !initializedRef.current) return;
      versionRef.current++;
      sendNotification("textDocument/didChange", {
        textDocument: { uri: fileUri(filePath), version: versionRef.current },
        contentChanges: [{ text: newContent }],
      });
    },
    [connected, filePath, sendNotification]
  );

  // Register Monaco providers + diagnostics listener
  useEffect(() => {
    if (!editorInstance || !monacoInstance || !connected || !initializedRef.current || !lspLang)
      return;

    const monaco = monacoInstance;

    // Completion provider
    const completionDisp = monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: [".", "/", "@", "<"],
      provideCompletionItems: async (_model, position) => {
        try {
          const result = await sendRequest("textDocument/completion", {
            textDocument: { uri: fileUri(filePath) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          });
          const items = Array.isArray(result) ? result : result?.items ?? [];
          return {
            suggestions: items.map((item: any) => ({
              label: item.label,
              kind: mapCompletionKind(item.kind),
              insertText: item.insertText || item.label,
              detail: item.detail || "",
              documentation: item.documentation
                ? typeof item.documentation === "string"
                  ? item.documentation
                  : item.documentation.value
                : undefined,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            })),
          };
        } catch {
          return { suggestions: [] };
        }
      },
    });

    // Hover provider
    const hoverDisp = monaco.languages.registerHoverProvider(language, {
      provideHover: async (_model, position) => {
        try {
          const result = await sendRequest("textDocument/hover", {
            textDocument: { uri: fileUri(filePath) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          });
          if (!result?.contents) return null;
          const contents = Array.isArray(result.contents)
            ? result.contents
            : [result.contents];
          return {
            contents: contents.map((c: any) =>
              typeof c === "string"
                ? { value: c }
                : { value: c.value || String(c) }
            ),
          };
        } catch {
          return null;
        }
      },
    });

    disposablesRef.current = [completionDisp, hoverDisp];

    // Listen for diagnostics
    const unsubscribe = onMessage((msg: LSPMessage) => {
      if (msg.method === "textDocument/publishDiagnostics" && msg.params) {
        const { diagnostics } = msg.params;
        const model = editorInstance.getModel();
        if (!model) return;

        const markers = (diagnostics || []).map((d: any) => ({
          severity:
            d.severity === 1
              ? monaco.MarkerSeverity.Error
              : d.severity === 2
              ? monaco.MarkerSeverity.Warning
              : d.severity === 3
              ? monaco.MarkerSeverity.Info
              : monaco.MarkerSeverity.Hint,
          message: d.message,
          startLineNumber: (d.range?.start?.line ?? 0) + 1,
          startColumn: (d.range?.start?.character ?? 0) + 1,
          endLineNumber: (d.range?.end?.line ?? 0) + 1,
          endColumn: (d.range?.end?.character ?? 0) + 1,
          source: "lsp",
        }));
        monaco.editor.setModelMarkers(model, "lsp", markers);
      }
    });

    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
      unsubscribe();
    };
  }, [editorInstance, monacoInstance, connected, lspLang, language, filePath, sendRequest, onMessage]);

  return { connected: connected && initializedRef.current, sendDidChange };
}
