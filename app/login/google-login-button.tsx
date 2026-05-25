"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function callbackUrl() {
  return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
}

export function GoogleLoginButton() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl()
        }
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google sign-in.");
      setLoading(false);
    }
  }

  return (
    <div className="form-grid" style={{ marginBottom: 18 }}>
      <button disabled={loading} onClick={signInWithGoogle} type="button">
        {loading ? "Redirecting..." : "Continue with Google"}
      </button>
      {message ? <p className="setup-warning">{message}</p> : null}
    </div>
  );
}
