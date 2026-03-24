"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { createClient as createSupabaseClient } from "../../../utils/supabase/client";

type ScoreRow = {
  id: string;
  score: number;
  date_played: string;
  created_at: string;
};

type ScoreApiResponse = {
  success?: boolean;
  error?: string;
  details?: string;
  scores?: ScoreRow[];
};

const todayIso = new Date().toISOString().slice(0, 10);

export default function ScoresPage() {
  const [scoreInput, setScoreInput] = useState(25);
  const [dateInput, setDateInput] = useState(todayIso);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const loadScores = async () => {
      if (!supabase) {
        setErrorMessage("Supabase client is unavailable.");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("You must be signed in to manage scores.");
        return;
      }

      const { data, error } = await supabase
        .from("scores")
        .select("id, score, date_played, created_at")
        .eq("user_id", user.id)
        .order("date_played", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        setErrorMessage(`Failed to load scores: ${error.message}`);
        return;
      }

      setScores((data ?? []) as ScoreRow[]);
    };

    void loadScores();
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supabase) {
      setErrorMessage("Supabase client is unavailable.");
      return;
    }

    const parsedScore = scoreInput;
    if (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 45) {
      setErrorMessage("Score must be an integer between 1 and 45.");
      return;
    }

    try {
      setIsSubmitting(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setErrorMessage("You must be signed in to submit a score.");
        return;
      }

      const response = await fetch("/api/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ score: parsedScore, date_played: dateInput }),
      });

      const payload = (await response.json()) as ScoreApiResponse;
      if (!response.ok || !payload.success) {
        setErrorMessage(payload.error ?? "Failed to submit score.");
        return;
      }

      setScores(Array.isArray(payload.scores) ? payload.scores : []);
      setSuccessMessage("Score submitted successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while submitting score.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const incrementScore = () => {
    setScoreInput((prev) => Math.min(prev + 1, 45));
  };

  const decrementScore = () => {
    setScoreInput((prev) => Math.max(prev - 1, 1));
  };

  const scoreProgress = Math.round((scoreInput / 45) * 100);
  const scoreMilestones = [1, 10, 20, 30, 40, 45];

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-linear-to-r from-primary/10 via-background to-chart-2/10 p-6 shadow-sm">
        <div
          className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-16 left-1/4 h-40 w-40 rounded-full bg-chart-2/10 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Enter Score
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Log each round quickly and keep your latest performance timeline up
            to date.
          </p>
        </div>
      </header>

      {errorMessage ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {errorMessage}
        </motion.div>
      ) : null}
      {successMessage ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-chart-3/40 bg-chart-3/15 p-4 text-sm text-chart-3"
        >
          {successMessage}
        </motion.div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-7">
            <div className="space-y-7">
              <div className="text-center">
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  Your Score
                </p>
                <motion.div
                  key={scoreInput}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-8xl font-black tracking-tighter text-primary"
                >
                  {scoreInput}
                </motion.div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {scoreProgress}% of max score range
                </p>
              </div>

              <div className="flex justify-center gap-4">
                <motion.button
                  type="button"
                  onClick={decrementScore}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow transition hover:brightness-110"
                >
                  <Minus size={28} />
                </motion.button>

                <motion.button
                  type="button"
                  onClick={incrementScore}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow transition hover:brightness-110"
                >
                  <Plus size={28} />
                </motion.button>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <progress
                  value={scoreInput - 1}
                  max={44}
                  aria-label="Score progress"
                  className="h-3 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-linear-to-r [&::-webkit-progress-value]:from-primary/70 [&::-webkit-progress-value]:via-primary [&::-webkit-progress-value]:to-chart-2 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary"
                />

                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  {scoreMilestones.map((value) => (
                    <span
                      key={value}
                      className={
                        value <= scoreInput
                          ? "font-semibold text-foreground"
                          : ""
                      }
                    >
                      {value}
                    </span>
                  ))}
                </div>

                <input
                  type="range"
                  aria-label="Select golf score"
                  min="1"
                  max="45"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(Number(e.target.value))}
                  className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                />

                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>45</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Date Played
              </span>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/50"
              />
            </label>
          </div>

          <motion.button
            type="submit"
            disabled={isSubmitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit Score"}
          </motion.button>
        </form>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold">Recent Performance</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Your five latest rounds in timeline view.
          </p>

          {scores.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-background/60 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No scores yet. Submit your first score above!
              </p>
            </div>
          ) : (
            <div className="relative space-y-6">
              <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-primary/35" />

              {scores.map((score, idx) => (
                <motion.div
                  key={score.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className="relative pl-16"
                >
                  <motion.div className="absolute left-0 top-1.5 h-10 w-10 rounded-full border border-border/50 bg-primary/95">
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-primary-foreground">
                      {score.score}
                    </div>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 4 }}
                    className="cursor-pointer rounded-lg border border-border/70 bg-background/70 p-4 transition hover:border-primary/35"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(score.date_played).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Logged score: {score.score}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Golf Score
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
