/**
 * CollaborationContext — initializes a global Yjs document and WebSocket provider.
 *
 * Provides:
 *  - A shared Y.Doc for CRDT-based collaborative editing
 *  - A WebsocketProvider connected to the FastAPI relay
 *  - Awareness with random user color for remote cursors
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

interface CollabContextValue {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  connected: boolean;
}

const CollabCtx = createContext<CollabContextValue>({
  doc: new Y.Doc(),
  provider: null,
  connected: false,
});

// Generate a random hex color for cursor differentiation
function randomColor(): string {
  const colors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
    "#f43f5e", "#14b8a6", "#a855f7", "#6366f1",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const docRef = useRef(new Y.Doc());
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const doc = docRef.current;

    // Build the WebSocket URL dynamically
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/collab`;

    // "default-room" is the room name. In a multi-project setup,
    // this would be the project ID.
    const wsProvider = new WebsocketProvider(wsUrl, "default-room", doc);

    // Set up awareness for remote cursors
    const userColor = randomColor();
    wsProvider.awareness.setLocalStateField("user", {
      name: "Anonymous User",
      color: userColor,
      colorLight: userColor + "40", // 25% opacity for selection highlight
    });

    wsProvider.on("status", (event: { status: string }) => {
      setConnected(event.status === "connected");
      console.log(`[Collab] WebSocket ${event.status}`);
    });

    setProvider(wsProvider);

    return () => {
      wsProvider.disconnect();
      wsProvider.destroy();
    };
  }, []);

  return (
    <CollabCtx.Provider value={{ doc: docRef.current, provider, connected }}>
      {children}
    </CollabCtx.Provider>
  );
}

export function useCollaboration() {
  return useContext(CollabCtx);
}
