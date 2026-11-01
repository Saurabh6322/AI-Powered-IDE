/**
 * OAuthCallback — handles the redirect from OAuth providers.
 *
 * Extracts access_token and refresh_token from URL query params,
 * stores them via AuthContext, then redirects to the IDE.
 */

import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function OAuthCallback() {
  const { loginWithOAuth } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      loginWithOAuth(accessToken, refreshToken).then(() => {
        window.history.replaceState({}, "", "/");
      });
    } else {
      window.location.href = "/";
    }
  }, [loginWithOAuth]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: "var(--text-muted)",
      fontSize: 14,
    }}>
      Signing you in...
    </div>
  );
}
