/**
 * WorkspaceContext — global state for the IDE workspace.
 *
 * Manages:
 *  - fileTree: recursive directory structure from the backend
 *  - openFiles: array of files currently open in editor tabs
 *  - activeFilePath: which tab is focused
 */

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface WorkspaceState {
  fileTree: TreeNode[];
  openFiles: OpenFile[];
  activeFilePath: string | null;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

type Action =
  | { type: "SET_TREE"; tree: TreeNode[] }
  | { type: "OPEN_FILE"; file: OpenFile }
  | { type: "CLOSE_FILE"; path: string }
  | { type: "SET_ACTIVE"; path: string }
  | { type: "UPDATE_CONTENT"; path: string; content: string }
  | { type: "MARK_SAVED"; path: string };

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

const initialState: WorkspaceState = {
  fileTree: [],
  openFiles: [],
  activeFilePath: null,
};

function workspaceReducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "SET_TREE":
      return { ...state, fileTree: action.tree };

    case "OPEN_FILE": {
      const exists = state.openFiles.find((f) => f.path === action.file.path);
      if (exists) {
        // Already open — just switch to it
        return { ...state, activeFilePath: action.file.path };
      }
      return {
        ...state,
        openFiles: [...state.openFiles, action.file],
        activeFilePath: action.file.path,
      };
    }

    case "CLOSE_FILE": {
      const remaining = state.openFiles.filter((f) => f.path !== action.path);
      let nextActive = state.activeFilePath;
      if (state.activeFilePath === action.path) {
        // Activate the previous tab, or the first remaining, or null
        const closedIdx = state.openFiles.findIndex((f) => f.path === action.path);
        nextActive =
          remaining[Math.min(closedIdx, remaining.length - 1)]?.path ?? null;
      }
      return { ...state, openFiles: remaining, activeFilePath: nextActive };
    }

    case "SET_ACTIVE":
      return { ...state, activeFilePath: action.path };

    case "UPDATE_CONTENT":
      return {
        ...state,
        openFiles: state.openFiles.map((f) =>
          f.path === action.path ? { ...f, content: action.content, isDirty: true } : f
        ),
      };

    case "MARK_SAVED":
      return {
        ...state,
        openFiles: state.openFiles.map((f) =>
          f.path === action.path ? { ...f, isDirty: false } : f
        ),
      };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const WorkspaceStateCtx = createContext<WorkspaceState>(initialState);
const WorkspaceDispatchCtx = createContext<Dispatch<Action>>(() => {});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  return (
    <WorkspaceStateCtx.Provider value={state}>
      <WorkspaceDispatchCtx.Provider value={dispatch}>
        {children}
      </WorkspaceDispatchCtx.Provider>
    </WorkspaceStateCtx.Provider>
  );
}

export function useWorkspaceState() {
  return useContext(WorkspaceStateCtx);
}

export function useWorkspaceDispatch() {
  return useContext(WorkspaceDispatchCtx);
}
