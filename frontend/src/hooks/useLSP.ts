/**
 * useLSP — lightweight LSP client over WebSocket.
 *
 * Connects to the backend /ws/lsp/{language} endpoint and manages
 * the JSON-RPC lifecycle for one language server. Provides methods
 * to send requests and notifications, and a way to register handlers
 * for server-to-client messages (diagnostics, etc.).
 *
 * This is intentionally minimal — no dependency on monaco-languageclient
 * or vscode-languageserver-protocol. We wire Monaco providers manually
 * from the component that uses this hook.
 */

import { useRef, useCallback, useEffect, useState } from "react";

export interface LSPMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

type MessageHandler = (msg: LSPMessage) => void;

export function useLSP(language: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(1);
  const pendingRef = useRef<Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>>(
    new Map()
  );
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!language || wsRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/lsp/${language}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: LSPMessage = JSON.parse(event.data);

        // Response to a request we sent
        if (msg.id !== undefined && pendingRef.current.has(msg.id)) {
          const { resolve, reject } = pendingRef.current.get(msg.id)!;
          pendingRef.current.delete(msg.id);
          if (msg.error) {
            reject(msg.error);
          } else {
            resolve(msg.result);
          }
          return;
        }

        // Server notification or request
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setConnected(false);
      // Reject all pending requests
      for (const [, { reject }] of pendingRef.current) {
        reject(new Error("LSP connection closed"));
      }
      pendingRef.current.clear();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [language]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const sendRequest = useCallback(
    (method: string, params?: any): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error("LSP not connected"));
          return;
        }
        const id = idRef.current++;
        pendingRef.current.set(id, { resolve, reject });
        wsRef.current.send(
          JSON.stringify({ jsonrpc: "2.0", id, method, params })
        );
      });
    },
    []
  );

  const sendNotification = useCallback((method: string, params?: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ jsonrpc: "2.0", method, params })
    );
  }, []);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { connected, connect, disconnect, sendRequest, sendNotification, onMessage };
}
