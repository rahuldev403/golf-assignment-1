"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
  const initError =
    "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!supabase) {
      setErrorMessage(
        "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    try {
      setIsSubmitting(true);

      if (mode === "signup") {
        await handleSignUp();
      } else {
        await handleLogin();
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.2),transparent_40%)]" />
      </div>

      <section className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/80 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            Welcome Back
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            {mode === "login" ? "Log In" : "Create Account"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Access your dashboard using your email and password.
          </p>
        </div>

        <div className="mb-5 flex rounded-lg border border-slate-700 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`w-1/2 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "login"
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`w-1/2 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "signup"
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              placeholder="Minimum 6 characters"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          ) : null}

          {!errorMessage && !supabase ? (
            <p className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {initError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-linear-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
                ? "Log In"
                : "Sign Up"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Back to home?{" "}
          <Link
            href="/"
            className="font-medium text-indigo-300 hover:text-indigo-200"
          >
            Go to landing page
          </Link>
        </p>
      </section>
    </main>
  );
}
