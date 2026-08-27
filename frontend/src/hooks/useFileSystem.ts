/**
 * useFileSystem — thin fetch wrapper around the backend file-system API.
 */

import { useCallback } from "react";
import type { TreeNode } from "../contexts/WorkspaceContext";

const LANG_MAP: Record<string, string> = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  css: "css",
  html: "html",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  toml: "toml",
  xml: "xml",
  txt: "plaintext",
};

export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "plaintext";
}

export function useFileSystem() {
  const fetchTree = useCallback(async (): Promise<TreeNode[]> => {
    const res = await fetch("/api/files/tree");
    if (!res.ok) throw new Error("Failed to fetch file tree");
    return res.json();
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    const res = await fetch(`/api/files/${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to read file: ${path}`);
    return res.text();
  }, []);

  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    const res = await fetch(`/api/files/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: content,
    });
    if (!res.ok) throw new Error(`Failed to write file: ${path}`);
  }, []);

  return { fetchTree, readFile, writeFile };
}
