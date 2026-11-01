/**
 * LoadingSkeleton — shimmer placeholder for loading states.
 */

import styles from "./LoadingSkeleton.module.css";

interface Props {
  lines?: number;
  height?: string;
}

export default function LoadingSkeleton({ lines = 3, height = "14px" }: Props) {
  return (
    <div className={styles.skeleton}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={styles.line}
          style={{
            height,
            width: `${60 + Math.random() * 40}%`,
          }}
        />
      ))}
    </div>
  );
}
