/**
 * ChatPanel — AI assistant slide-out panel.
 *
 * Features:
 *  - Multi-provider support: Ollama (local), Groq (cloud), Gemini (cloud)
 *  - Streaming SSE responses via the backend
 *  - Markdown rendering with syntax-highlighted code blocks
 *  - Copy / Apply-to-Editor buttons on code blocks
 *  - Provider + model picker with status indicators
 *  - Agent persona selector
 *  - Persists last-selected provider+model in localStorage
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

const API_BASE = "/api";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
}

interface ProviderModel {
  name: string;
  [key: string]: any;
}

interface ProviderInfo {
  id: string;
  display_name: string;
  type: "local" | "cloud";
  online: boolean;
  error?: string;
  models: ProviderModel[];
  default_model: string;
}

interface AgentPersona {
  name: string;
  display_name: string;
  icon: string;
}

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(false);

  // Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(
    () => loadSaved("ide-ai-provider", "ollama")
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => loadSaved("ide-ai-model", "")
  );

  // Persona state
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("general");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | undefined>(undefined);

  // Fetch providers + personas on mount
  useEffect(() => {
    fetch(`${API_BASE}/ai/providers`)
      .then((r) => r.json())
      .then((data) => {
        const provs: ProviderInfo[] = data.providers || [];
        setProviders(provs);

        // If the saved provider doesn't exist or is offline, fall back to first online
        const saved = provs.find((p) => p.id === selectedProvider);
        if (!saved || !saved.online) {
          const fallback = provs.find((p) => p.online);
          if (fallback) {
            setSelectedProvider(fallback.id);
            setSelectedModel(fallback.default_model);
          }
        } else if (!selectedModel) {
          setSelectedModel(saved.default_model);
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/agents/personas`)
      .then((r) => r.json())
      .then((data) => setPersonas(data.personas || []))
      .catch(() => {});
  }, []);

  // Persist selection
  useEffect(() => {
    try {
      localStorage.setItem("ide-ai-provider", JSON.stringify(selectedProvider));
      localStorage.setItem("ide-ai-model", JSON.stringify(selectedModel));
    } catch {}
  }, [selectedProvider, selectedModel]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const availableModels = currentProvider?.models || [];

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const prov = providers.find((p) => p.id === providerId);
    if (prov) {
      setSelectedModel(prov.default_model);
    }
  };

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      if (!overrideText) setInput("");
      setIsStreaming(true);

      const assistantMsg: ChatMessage = { role: "assistant", content: "" };
      setMessages([...updatedMessages, assistantMsg]);

      try {
        const resp = await fetch(`${API_BASE}/agents/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => {
              const msg: any = { role: m.role, content: m.content };
              if (m.tool_calls) msg.tool_calls = m.tool_calls;
              return msg;
            }),
            model: selectedModel || undefined,
            provider: selectedProvider,
            use_context: useContext,
            persona: selectedPersona,
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
    [input, isStreaming, messages, selectedModel, selectedProvider, selectedPersona, useContext]
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Listen for `ai-prompt` events from the editor context menu
  useEffect(() => {
    const handleAiPrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.prompt) return;
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
    window.dispatchEvent(new CustomEvent("ai-insert", { detail: { code } }));
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
          {/* Provider picker */}
          <select
            className={styles.providerSelect}
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.online}>
                {p.online ? "●" : "○"} {p.display_name}
              </option>
            ))}
          </select>

          {/* Model picker */}
          {availableModels.length > 0 && (
            <select
              className={styles.modelSelect}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* Persona picker */}
          {personas.length > 0 && (
            <select
              className={styles.personaSelect}
              value={selectedPersona}
              onChange={(e) => setSelectedPersona(e.target.value)}
            >
              {personas.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.icon} {p.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Provider status banner */}
      {currentProvider && !currentProvider.online && (
        <div className={styles.statusBanner}>
          ⚠️ {currentProvider.display_name} is offline
          {currentProvider.error && `: ${currentProvider.error}`}
        </div>
      )}

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
              Select code in the editor → right-click → <strong>AI: Explain Code</strong>
            </p>
            {providers.filter((p) => p.type === "cloud" && p.online).length > 0 && (
              <p className={styles.emptyHint}>
                Cloud models available — switch providers in the header dropdown.
              </p>
            )}
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
                  <span className={styles.toolText}>
                    Tool result: {msg.content.substring(0, 100)}
                    {msg.content.length > 100 ? "..." : ""}
                  </span>
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
                                <span className={styles.codeLang}>{match[1]}</span>
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
                                    onClick={() => copyToClipboard(codeString, blockId)}
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

                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className={styles.toolCalls}>
                      <div className={styles.toolCallsTitle}>Planned Actions:</div>
                      {msg.tool_calls.map((tc, idx) => (
                        <div key={idx} className={styles.toolCallItem}>
                          <strong>{tc.function?.name}</strong>(
                          <span className={styles.toolCallArgs}>
                            {typeof tc.function?.arguments === "string"
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

      {/* Input area */}
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
