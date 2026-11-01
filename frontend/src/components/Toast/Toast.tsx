/**
 * Toast — notification system for save confirmations, errors, etc.
 *
 * Usage from anywhere:
 *   window.dispatchEvent(new CustomEvent("toast", {
 *     detail: { message: "File saved!", type: "success", duration: 3000 }
 *   }));
 */

import { useState, useEffect, useCallback } from "react";
import styles from "./Toast.module.css";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

let nextId = 0;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastItem["type"] = "info", duration = 3000) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        addToast(detail.message, detail.type || "info", detail.duration || 3000);
      }
    };
    window.addEventListener("toast", handler);
    return () => window.removeEventListener("toast", handler);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
          onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
