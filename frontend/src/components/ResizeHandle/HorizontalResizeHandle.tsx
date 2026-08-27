/**
 * HorizontalResizeHandle — draggable horizontal divider.
 */

import { useCallback, useRef } from "react";
import styles from "./HorizontalResizeHandle.module.css";

interface HorizontalResizeHandleProps {
  onResize: (newHeight: number) => void;
}

export default function HorizontalResizeHandle({ onResize }: HorizontalResizeHandleProps) {
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        // Calculate height from the bottom of the screen (or from a fixed container height)
        // Since we want the terminal at the bottom, we can pass window.innerHeight - ev.clientY 
        // to get the terminal height.
        onResize(window.innerHeight - ev.clientY);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [onResize]
  );

  return (
    <div
      className={styles.handle}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize terminal"
    />
  );
}
