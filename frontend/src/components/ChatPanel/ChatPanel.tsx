/**
 * ChatPanel — AI assistant slide-out panel.
 *
 * Features:
 *  - Streaming SSE responses from Ollama via the backend
 *  - Markdown rendering with syntax-highlighted code blocks
 *  - Copy button on code blocks
 *  - Apply to Editor button on code blocks (dispatches ai-insert event)
 *  - Model picker dropdown
 *  - Ollama online/offline status indicator
 *  - Listens for `ai-prompt` custom events from the editor's context menu
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import styles from "./ChatPanel.module.css";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
}

interface OllamaModel {
  name: string;
  size: number;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // We use a ref for the streaming function so the event listener
  // always calls the latest version without re-registering.
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | undefined>(undefined);

  // Check Ollama status & load models on mount
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((data) => setOllamaOnline(data.online))
      .catch(() => setOllamaOnline(false));

    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        setSelectedModel(data.default || "");
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      if (!overrideText) setInput("");
      setIsStreaming(true);

      // Add empty assistant message that we'll stream into
      const assistantMsg: ChatMessage = { role: "assistant", content: "" };
      setMessages([...updatedMessages, assistantMsg]);

      try {
        const resp = await fetch("/api/agents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => {
              const msg: any = { role: m.role, content: m.content };
              if (m.tool_calls) msg.tool_calls = m.tool_calls;
              return msg;
            }),
            model: selectedModel || undefined,
            use_context: useContext,
          }),
        });

        if (!resp.ok || !resp.body) {
          throw new Error("Failed to connect to AI backend");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let accumulatedToolCalls: any[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.error) {
                accumulated += `\n\n⚠️ ${payload.error}`;
                break;
              }
              if (payload.token) {
                accumulated += payload.token;
              }
              if (payload.tool_calls) {
                accumulatedToolCalls = payload.tool_calls;
              }
            } catch {
              // skip malformed SSE lines
            }
          }

          // Update the last (assistant) message with accumulated content
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              role: "assistant",
              content: accumulated,
              tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
            };
            return copy;
          });
        }
      } catch (err: any) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `⚠️ Error: ${err.message || "Could not reach AI backend."}`,
          };
          return copy;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, messages, selectedModel]
  );

  // Keep sendMessageRef in sync
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Listen for `ai-prompt` events from the editor's context menu
  useEffect(() => {
    const handleAiPrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.prompt) return;
      // Use a short delay to ensure the chat panel has mounted
      setTimeout(() => {
        sendMessageRef.current?.(detail.prompt);
      }, 100);
    };

    window.addEventListener("ai-prompt", handleAiPrompt);
    return () => window.removeEventListener("ai-prompt", handleAiPrompt);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const applyToEditor = (code: string) => {
    window.dispatchEvent(
      new CustomEvent("ai-insert", { detail: { code } })
    );
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <svg className={styles.sparkle} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
          </svg>
          <span className={styles.headerTitle}>AI Assistant</span>
        </div>
        <div className={styles.headerRight}>
          <span
            className={`${styles.statusDot} ${
              ollamaOnline === true
                ? styles.online
                : ollamaOnline === false
                ? styles.offline
                : styles.checking
            }`}
            title={
              ollamaOnline === true
                ? "Ollama Online"
                : ollamaOnline === false
                ? "Ollama Offline"
                : "Checking..."
            }
          />
          {models.length > 0 && (
            <select
              className={styles.modelSelect}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
            <p className={styles.emptyTitle}>How can I help?</p>
            <p className={styles.emptyHint}>
              Ask me to write code, explain concepts, or debug issues.
            </p>
            <p className={styles.emptyHint}>
              💡 Select code in the editor → right-click → <strong>AI: Explain Code</strong>
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${
              msg.role === "user" ? styles.userMsg : styles.assistantMsg
            }`}
          >
            <div className={styles.msgBubble}>
              {msg.role === "user" ? (
                <p className={styles.userText}>{msg.content}</p>
              ) : msg.role === "tool" ? (
                <div className={styles.toolResult}>
                  <span className={styles.toolIcon}>🛠️</span>
                  <span className={styles.toolText}>Tool result: {msg.content.substring(0, 100)}{msg.content.length > 100 ? "..." : ""}</span>
                </div>
              ) : (
                <div className={styles.markdown}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeString = String(children).replace(/\n$/, "");
                        const blockId = `code-${i}-${match?.[1] || "txt"}`;
                        if (match) {
                          return (
                            <div className={styles.codeBlock}>
                              <div className={styles.codeHeader}>
                                <span className={styles.codeLang}>
                                  {match[1]}
                                </span>
                                <div className={styles.codeActions}>
                                  <button
                                    className={styles.applyBtn}
                                    onClick={() => applyToEditor(codeString)}
                                    title="Apply to Editor"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    className={styles.copyBtn}
                                    onClick={() =>
                                      copyToClipboard(codeString, blockId)
                                    }
                                    title="Copy code"
                                  >
                                    {copiedIndex === blockId ? "✓" : "📋"}
                                  </button>
                                </div>
                              </div>
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  margin: 0,
                                  borderRadius: "0 0 8px 8px",
                                  fontSize: "13px",
                                }}
                              >
                                {codeString}
                              </SyntaxHighlighter>
                            </div>
                          );
                        }
                        return (
                          <code className={styles.inlineCode} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {msg.content ||
                      (isStreaming && i === messages.length - 1 && !msg.tool_calls ? "●" : "")}
                  </ReactMarkdown>

                  {/* Tool Calls Rendering */}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className={styles.toolCalls}>
                      <div className={styles.toolCallsTitle}>Planned Actions:</div>
                      {msg.tool_calls.map((tc, idx) => (
                        <div key={idx} className={styles.toolCallItem}>
                          <strong>{tc.function?.name}</strong>(
                          <span className={styles.toolCallArgs}>
                            {typeof tc.function?.arguments === 'string' 
                              ? tc.function?.arguments 
                              : JSON.stringify(tc.function?.arguments)}
                          </span>
                          )
                        </div>
                      ))}
                      {i === messages.length - 1 && !isStreaming && (
                        <button 
                          className={styles.approveBtn}
                          onClick={() => sendMessage("Looks good, proceed.")}
                        >
                          ✅ Approve & Execute
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className={styles.streamingIndicator}>
            <span className={styles.dot1} />
            <span className={styles.dot2} />
            <span className={styles.dot3} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className={styles.contextToggle}>
        <label>
          <input
            type="checkbox"
            checked={useContext}
            onChange={(e) => setUseContext(e.target.checked)}
          />
          <span className={styles.toggleText}>🔍 Use Codebase Context</span>
        </label>
      </div>
      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isStreaming}
        />
        <button
          className={styles.sendBtn}
          onClick={() => sendMessage()}
          disabled={isStreaming || !input.trim()}
          title="Send message"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
