/**
 * GitPanel — sidebar panel for Git operations.
 *
 * Features:
 *  - Current branch display + branch switcher
 *  - Changed files list with stage/unstage buttons
 *  - Commit message input + commit button
 *  - Recent commit history log
 *  - Initialize repo button if not yet a git repo
 */

import { useState, useEffect, useCallback } from "react";
import styles from "./GitPanel.module.css";

interface ChangedFile {
  path: string;
  change_type: string;
}

interface CommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export default function GitPanel() {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [staged, setStaged] = useState<ChangedFile[]>([]);
  const [unstaged, setUnstaged] = useState<ChangedFile[]>([]);
  const [untracked, setUntracked] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch("/api/git/status");
      const data = await resp.json();
      setIsRepo(data.is_repo);
      if (data.is_repo) {
        setBranch(data.branch || "");
        setStaged(data.staged || []);
        setUnstaged(data.unstaged || []);
        setUntracked(data.untracked || []);
        setError(data.error || "");
      }
    } catch {
      setError("Failed to fetch git status.");
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const resp = await fetch("/api/git/branches");
      const data = await resp.json();
      setBranches(data.branches || []);
    } catch {}
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      const resp = await fetch("/api/git/log?n=15");
      const data = await resp.json();
      setCommits(data.commits || []);
    } catch {}
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchBranches(), fetchLog()]);
  }, [fetchStatus, fetchBranches, fetchLog]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const initRepo = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/git/init", { method: "POST" });
      const data = await resp.json();
      if (data.success) {
        await refreshAll();
      } else {
        setError(data.error || "Failed to initialize.");
      }
    } catch {
      setError("Failed to initialize repository.");
    }
    setLoading(false);
  };

  const stageFile = async (path: string) => {
    await fetch("/api/git/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await fetchStatus();
  };

  const unstageFile = async (path: string) => {
    await fetch("/api/git/unstage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await fetchStatus();
  };

  const stageAll = async () => {
    await fetch("/api/git/stage-all", { method: "POST" });
    await fetchStatus();
  };

  const doCommit = async () => {
    if (!commitMsg.trim()) return;
    setLoading(true);
    const resp = await fetch("/api/git/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMsg }),
    });
    const data = await resp.json();
    if (data.success) {
      setCommitMsg("");
      await refreshAll();
    } else {
      setError(data.error || "Commit failed.");
    }
    setLoading(false);
  };

  const switchBranch = async (name: string) => {
    await fetch("/api/git/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: name }),
    });
    await refreshAll();
  };

  const changeTypeIcon = (type: string) => {
    switch (type) {
      case "A": return "A";
      case "M": return "M";
      case "D": return "D";
      case "R": return "R";
      default: return "?";
    }
  };

  const changeTypeClass = (type: string) => {
    switch (type) {
      case "A": return styles.added;
      case "M": return styles.modified;
      case "D": return styles.deleted;
      default: return "";
    }
  };

  // Not yet loaded
  if (isRepo === null) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  // Not a git repo — show init button
  if (!isRepo) {
    return (
      <div className={styles.panel}>
        <div className={styles.initContainer}>
          <svg className={styles.initIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="6" cy="6" r="2" />
            <circle cx="18" cy="18" r="2" />
            <path d="M9.5 9.5L7.5 7.5" />
            <path d="M14.5 14.5L16.5 16.5" />
          </svg>
          <p className={styles.initTitle}>No Git Repository</p>
          <p className={styles.initHint}>Initialize a repository to start tracking changes.</p>
          <button
            className={styles.initBtn}
            onClick={initRepo}
            disabled={loading}
          >
            {loading ? "Initializing..." : "Initialize Repository"}
          </button>
        </div>
      </div>
    );
  }

  const totalChanges = staged.length + unstaged.length + untracked.length;

  return (
    <div className={styles.panel}>
      {/* Branch Header */}
      <div className={styles.branchHeader}>
        <svg className={styles.branchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <select
          className={styles.branchSelect}
          value={branch}
          onChange={(e) => switchBranch(e.target.value)}
        >
          {branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Scrollable content */}
      <div className={styles.content}>
        {/* Changed Files */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Changes</span>
            <span className={styles.badge}>{totalChanges}</span>
            {totalChanges > 0 && (
              <button className={styles.stageAllBtn} onClick={stageAll} title="Stage All">
                +All
              </button>
            )}
          </div>

          {/* Staged */}
          {staged.length > 0 && (
            <div className={styles.fileGroup}>
              <div className={styles.groupLabel}>Staged</div>
              {staged.map((f) => (
                <div key={f.path} className={styles.fileItem}>
                  <span className={`${styles.changeType} ${changeTypeClass(f.change_type)}`}>
                    {changeTypeIcon(f.change_type)}
                  </span>
                  <span className={styles.fileName}>{f.path}</span>
                  <button
                    className={styles.fileAction}
                    onClick={() => unstageFile(f.path)}
                    title="Unstage"
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Unstaged */}
          {unstaged.length > 0 && (
            <div className={styles.fileGroup}>
              <div className={styles.groupLabel}>Modified</div>
              {unstaged.map((f) => (
                <div key={f.path} className={styles.fileItem}>
                  <span className={`${styles.changeType} ${changeTypeClass(f.change_type)}`}>
                    {changeTypeIcon(f.change_type)}
                  </span>
                  <span className={styles.fileName}>{f.path}</span>
                  <button
                    className={styles.fileAction}
                    onClick={() => stageFile(f.path)}
                    title="Stage"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Untracked */}
          {untracked.length > 0 && (
            <div className={styles.fileGroup}>
              <div className={styles.groupLabel}>Untracked</div>
              {untracked.map((f) => (
                <div key={f} className={styles.fileItem}>
                  <span className={`${styles.changeType} ${styles.added}`}>U</span>
                  <span className={styles.fileName}>{f}</span>
                  <button
                    className={styles.fileAction}
                    onClick={() => stageFile(f)}
                    title="Stage"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalChanges === 0 && (
            <p className={styles.noChanges}>No changes detected.</p>
          )}
        </div>

        {/* Commit */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Commit</span>
          </div>
          <textarea
            className={styles.commitInput}
            placeholder="Commit message..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            rows={2}
          />
          <button
            className={styles.commitBtn}
            onClick={doCommit}
            disabled={loading || !commitMsg.trim() || staged.length === 0}
          >
            {loading ? "Committing..." : `Commit (${staged.length} staged)`}
          </button>
        </div>

        {/* History */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>History</span>
          </div>
          {commits.length === 0 ? (
            <p className={styles.noChanges}>No commits yet.</p>
          ) : (
            <div className={styles.commitList}>
              {commits.map((c) => (
                <div key={c.hash} className={styles.commitItem}>
                  <div className={styles.commitTop}>
                    <span className={styles.commitHash}>{c.hash}</span>
                    <span className={styles.commitDate}>
                      {new Date(c.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.commitMessage}>{c.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
