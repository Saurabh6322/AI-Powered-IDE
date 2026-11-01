/**
 * FindInFiles — Ctrl+Shift+F workspace-wide text search panel.
 *
 * Queries the backend /api/files/search/text endpoint and displays
 * matching results grouped by file.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspaceDispatch } from "../../contexts/WorkspaceContext";
import { useFileSystem } from "../../hooks/useFileSystem";
import styles from "./FindInFiles.module.css";

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export default function FindInFiles() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useWorkspaceDispatch();
  const { readFile } = useFileSystem();

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        setQuery("");
        setResults([]);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, toggle]);

  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("open-find-in-files", handler);
    return () => window.removeEventListener("open-find-in-files", handler);
  }, [toggle]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const doSearch = useCallback(async () => {
    if (!query || query.length < 2) return;
    setSearching(true);
    try {
      const resp = await fetch(
        `/api/files/search/text?q=${encodeURIComponent(query)}`
      );
      const data = await resp.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  };

  const openResult = async (result: SearchResult) => {
    const ext = result.file.split(".").pop() || "";
    const langMap: Record<string, string> = {
      py: "python", ts: "typescript", tsx: "typescriptreact",
      js: "javascript", jsx: "javascriptreact", css: "css",
      html: "html", json: "json", md: "markdown",
      yaml: "yaml", yml: "yaml", sql: "sql",
      sh: "shellscript", go: "go", rs: "rust",
      java: "java", c: "c", cpp: "cpp",
    };
    try {
      const content = await readFile(result.file);
      dispatch({
        type: "OPEN_FILE",
        file: {
          path: result.file,
          name: result.file.split("/").pop() || result.file,
          content,
          language: langMap[ext] || "plaintext",
          isDirty: false,
        },
      });
      setOpen(false);
    } catch {
      // file might not exist
    }
  };

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.file] ||= []).push(r);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchRow}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search in workspace..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.searchBtn} onClick={doSearch} disabled={searching}>
            {searching ? "..." : "Search"}
          </button>
        </div>

        <div className={styles.results}>
          {results.length === 0 && !searching && query.length >= 2 && (
            <div className={styles.empty}>No results found</div>
          )}
          {Object.entries(grouped).map(([file, matches]) => (
            <div key={file} className={styles.fileGroup}>
              <div className={styles.fileName}>{file}</div>
              {matches.map((m, i) => (
                <button
                  key={i}
                  className={styles.resultItem}
                  onClick={() => openResult(m)}
                >
                  <span className={styles.lineNum}>:{m.line}</span>
                  <span className={styles.lineText}>{m.text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
