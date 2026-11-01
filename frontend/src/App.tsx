import { Suspense, lazy } from "react";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CollaborationProvider } from "./contexts/CollaborationContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import LoadingSkeleton from "./components/LoadingSkeleton/LoadingSkeleton";

const IDELayout = lazy(() => import("./components/IDELayout/IDELayout"));
const AuthPage = lazy(() => import("./components/AuthPage/AuthPage"));
const OAuthCallback = lazy(() => import("./components/AuthPage/OAuthCallback"));

function AppContent() {
  const { user, loading } = useAuth();

  const path = window.location.pathname;
  if (path === "/auth/callback" || path === "/auth/google/callback" || path === "/auth/github/callback") {
    return (
      <Suspense fallback={<LoadingSkeleton lines={1} />}>
        <OAuthCallback />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-muted)",
        fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingSkeleton lines={5} />}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <CollaborationProvider>
      <WorkspaceProvider>
        <Suspense fallback={<LoadingSkeleton lines={8} />}>
          <IDELayout />
        </Suspense>
      </WorkspaceProvider>
    </CollaborationProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
