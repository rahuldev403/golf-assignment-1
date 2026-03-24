"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseClient } from "../../utils/supabase/client";

type SectionKey = "users" | "draws" | "winners";

type UserRow = {
  id: string;
  role: "user" | "admin";
  created_at: string;
};

type SubscriptionRow = {
  user_id: string;
  status: "active" | "inactive";
  plan_type: "monthly" | "yearly";
};

type ScoreRow = {
  id: string;
  score: number;
  date_played: string;
  created_at: string;
};

type DrawRow = {
  id: string;
  draw_date: string;
  status: "simulated" | "published";
  winning_numbers: number[];
  jackpot_amount: number;
};

type PendingWinner = {
  id: string;
  user_id: string;
  draw_id: string;
  match_type: number;
  prize_amount: number;
  payment_status: "pending" | "paid";
  proof_image_url: string | null;
};

type DrawSimulationResult = {
  draw: DrawRow;
  summary: {
    active_subscribers: number;
    total_prize_pool: number;
    winners_count: {
      match_5: number;
      match_4: number;
      match_3: number;
    };
    rollover: {
      enabled: boolean;
      amount: number;
    };
  };
};

const sections: { key: SectionKey; label: string }[] = [
  { key: "users", label: "User Management" },
  { key: "draws", label: "Draw Management" },
  { key: "winners", label: "Winner Verification" },
];

export default function AdminDashboardPage() {
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<SectionKey>("users");
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<
    Map<string, SubscriptionRow>
  >(new Map());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserScores, setSelectedUserScores] = useState<ScoreRow[]>([]);
  const [loadingScoresForUser, setLoadingScoresForUser] = useState<
    string | null
  >(null);

  const [latestDraw, setLatestDraw] = useState<DrawRow | null>(null);
  const [drawSimulationResult, setDrawSimulationResult] =
    useState<DrawSimulationResult | null>(null);
  const [isRunningDraw, setIsRunningDraw] = useState(false);
  const [isPublishingDraw, setIsPublishingDraw] = useState(false);

  const [pendingWinners, setPendingWinners] = useState<PendingWinner[]>([]);
  const [processingWinnerId, setProcessingWinnerId] = useState<string | null>(
    null,
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!supabase) {
      return null;
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      return null;
    }

    return session.access_token;
  };

  const loadUsersAndSubscriptions = async () => {
    if (!supabase) {
      return;
    }

    const [usersRes, subscriptionsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, role, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("user_id, status, plan_type"),
    ]);

    if (usersRes.error) {
      throw new Error(`Failed to load users: ${usersRes.error.message}`);
    }

    if (subscriptionsRes.error) {
      throw new Error(
        `Failed to load subscriptions: ${subscriptionsRes.error.message}`,
      );
    }

    const allUsers = (usersRes.data ?? []) as UserRow[];
    setUsers(allUsers);

    const latestSubscriptionByUser = new Map<string, SubscriptionRow>();
    for (const row of subscriptionsRes.data ?? []) {
      const subscription = row as SubscriptionRow;
      const existing = latestSubscriptionByUser.get(subscription.user_id);

      if (!existing || (existing.status !== "active" && subscription.status === "active")) {
        latestSubscriptionByUser.set(subscription.user_id, subscription);
      }
    }
    setSubscriptions(latestSubscriptionByUser);
  };

  const loadPendingWinners = async () => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("winners")
      .select(
        "id, user_id, draw_id, match_type, prize_amount, payment_status, proof_image_url",
      )
      .eq("payment_status", "pending")
      .order("id", { ascending: false });

    if (error) {
      throw new Error(`Failed to load pending winners: ${error.message}`);
    }

    setPendingWinners((data ?? []) as PendingWinner[]);
  };

  const loadLatestDraw = async () => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("draws")
      .select("id, draw_date, status, winning_numbers, jackpot_amount")
      .order("draw_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load latest draw: ${error.message}`);
    }

    setLatestDraw((data as DrawRow | null) ?? null);
  };

  useEffect(() => {
    const bootstrap = async () => {
      clearMessages();

      if (!supabase) {
        setErrorMessage(
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).",
        );
        setIsCheckingAccess(false);
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setIsAdmin(false);
          setErrorMessage(
            "You must be signed in as admin to access this page.",
          );
          router.replace("/");
          setIsCheckingAccess(false);
          return;
        }

        const { data: userProfile, error: profileError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError) {
          throw new Error(`Failed to verify role: ${profileError.message}`);
        }

        if (userProfile?.role !== "admin") {
          setIsAdmin(false);
          setErrorMessage("Access denied. Admin role required.");
          router.replace("/");
          setIsCheckingAccess(false);
          return;
        }

        setIsAdmin(true);

        await Promise.all([
          loadUsersAndSubscriptions(),
          loadPendingWinners(),
          loadLatestDraw(),
        ]);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load admin dashboard.";
        setErrorMessage(message);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    void bootstrap();
  }, [router, supabase]);

  const handleViewScores = async (userId: string) => {
    clearMessages();

    if (!supabase) {
      setErrorMessage("Supabase client is unavailable.");
      return;
    }

    try {
      setLoadingScoresForUser(userId);
      setSelectedUserId(userId);

      const { data, error } = await supabase
        .from("scores")
        .select("id, score, date_played, created_at")
        .eq("user_id", userId)
        .order("date_played", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        throw new Error(error.message);
      }

      setSelectedUserScores((data ?? []) as ScoreRow[]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load user scores.";
      setErrorMessage(message);
    } finally {
      setLoadingScoresForUser(null);
    }
  };

  const handleRunDraw = async () => {
    clearMessages();

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage("Admin session expired. Please sign in again.");
      return;
    }

    try {
      setIsRunningDraw(true);

      const response = await fetch("/api/admin/run-draw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
        draw?: DrawRow;
        summary?: DrawSimulationResult["summary"];
      };

      if (
        !response.ok ||
        !payload.success ||
        !payload.draw ||
        !payload.summary
      ) {
        const details = payload.details ? ` (${payload.details})` : "";
        throw new Error(
          (payload.error ?? "Failed to run draw simulation.") + details,
        );
      }

      setDrawSimulationResult({
        draw: payload.draw,
        summary: payload.summary,
      });
      setLatestDraw(payload.draw);
      setSuccessMessage("Draw simulation completed successfully.");
      await loadPendingWinners();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run draw.";
      setErrorMessage(message);
    } finally {
      setIsRunningDraw(false);
    }
  };

  const handlePublishDraw = async () => {
    clearMessages();

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage("Admin session expired. Please sign in again.");
      return;
    }

    try {
      setIsPublishingDraw(true);

      const response = await fetch("/api/admin/publish-draw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draw_id: latestDraw?.id,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
        draw?: DrawRow;
        message?: string;
      };

      if (!response.ok || !payload.success || !payload.draw) {
        const details = payload.details ? ` (${payload.details})` : "";
        throw new Error((payload.error ?? "Failed to publish draw.") + details);
      }

      setLatestDraw(payload.draw);
      setDrawSimulationResult((previous: DrawSimulationResult | null) =>
        previous ? { ...previous, draw: payload.draw as DrawRow } : previous,
      );
      setSuccessMessage(payload.message ?? "Draw published successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish draw.";
      setErrorMessage(message);
    } finally {
      setIsPublishingDraw(false);
    }
  };

  const handleWinnerDecision = async (
    winnerId: string,
    action: "approve" | "reject",
  ) => {
    clearMessages();

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage("Admin session expired. Please sign in again.");
      return;
    }

    try {
      setProcessingWinnerId(winnerId);

      const response = await fetch("/api/admin/winner-decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          winner_id: winnerId,
          action,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
        message?: string;
      };

      if (!response.ok || !payload.success) {
        const details = payload.details ? ` (${payload.details})` : "";
        throw new Error(
          (payload.error ?? "Failed to process winner decision.") + details,
        );
      }

      setSuccessMessage(payload.message ?? "Winner decision processed.");
      await loadPendingWinners();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process winner decision.";
      setErrorMessage(message);
    } finally {
      setProcessingWinnerId(null);
    }
  };

  if (isCheckingAccess) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-6xl rounded-2xl border border-border bg-card p-6">
          Checking admin access...
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-6xl rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-destructive">
          Access denied. This page is only available to admins.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-4">
          <h1 className="px-2 text-lg font-semibold">Admin Panel</h1>
          <nav className="mt-4 space-y-2">
            {sections.map((section: { key: SectionKey; label: string }) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  activeSection === section.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted"
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-4">
          {errorMessage ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-chart-3/40 bg-chart-3/15 p-4 text-sm text-chart-3">
              {successMessage}
            </div>
          ) : null}

          {activeSection === "users" ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xl font-semibold">User Management</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage users and inspect their latest scores.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">User ID</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Subscription</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user: UserRow) => {
                      const subscription = subscriptions.get(user.id);
                      const status = subscription?.status ?? "inactive";

                      return (
                        <tr key={user.id} className="border-b border-border/70">
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {user.id}
                          </td>
                          <td className="px-3 py-3 capitalize text-muted-foreground">
                            {user.role}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs ${
                                status === "active"
                                  ? "bg-chart-3/15 text-chart-3"
                                  : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => handleViewScores(user.id)}
                              disabled={loadingScoresForUser === user.id}
                              className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:brightness-110 disabled:opacity-60"
                            >
                              {loadingScoresForUser === user.id
                                ? "Loading..."
                                : "View Scores"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedUserId ? (
                <div className="mt-5 rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Latest 5 Scores for {selectedUserId}
                  </h3>
                  {selectedUserScores.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No scores found.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {selectedUserScores.map((score: ScoreRow) => (
                        <li
                          key={score.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2 text-sm"
                        >
                          <span>Score: {score.score}</span>
                          <span className="text-muted-foreground">
                            {score.date_played}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSection === "draws" ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xl font-semibold">Draw Management</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Run and publish monthly draw simulations.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleRunDraw}
                  disabled={isRunningDraw}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                >
                  {isRunningDraw ? "Running Draw..." : "Run Draw"}
                </button>

                <button
                  type="button"
                  onClick={handlePublishDraw}
                  disabled={
                    isPublishingDraw ||
                    !latestDraw ||
                    latestDraw.status === "published"
                  }
                  className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:brightness-110 disabled:opacity-60"
                >
                  {isPublishingDraw ? "Publishing..." : "Publish Draw"}
                </button>
              </div>

              {latestDraw ? (
                <div className="mt-5 rounded-xl border border-border bg-background/70 p-4 text-sm">
                  <p className="text-muted-foreground">
                    Latest Draw ID: {latestDraw.id}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Status: {latestDraw.status}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Winning Numbers:{" "}
                    {Array.isArray(latestDraw.winning_numbers)
                      ? latestDraw.winning_numbers.join(", ")
                      : "N/A"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Rollover/Jackpot Amount: ${latestDraw.jackpot_amount}
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">
                  No draw has been created yet.
                </p>
              )}

              {drawSimulationResult ? (
                <div className="mt-5 rounded-xl border border-accent/40 bg-accent/20 p-4 text-sm">
                  <h3 className="font-medium text-accent-foreground">
                    Latest Simulation Results
                  </h3>
                  <p className="mt-2 text-accent-foreground">
                    Active Subscribers:{" "}
                    {drawSimulationResult.summary.active_subscribers}
                  </p>
                  <p className="mt-1 text-accent-foreground">
                    Total Prize Pool: $
                    {drawSimulationResult.summary.total_prize_pool}
                  </p>
                  <p className="mt-1 text-accent-foreground">
                    Winners (5/4/3):{" "}
                    {drawSimulationResult.summary.winners_count.match_5}/
                    {drawSimulationResult.summary.winners_count.match_4}/
                    {drawSimulationResult.summary.winners_count.match_3}
                  </p>
                  <p className="mt-1 text-accent-foreground">
                    Rollover:{" "}
                    {drawSimulationResult.summary.rollover.enabled
                      ? "Yes"
                      : "No"}{" "}
                    (${drawSimulationResult.summary.rollover.amount})
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSection === "winners" ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xl font-semibold">Winner Verification</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review pending winners and validate uploaded proof images.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Winner ID</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Match</th>
                      <th className="px-3 py-2 font-medium">Prize</th>
                      <th className="px-3 py-2 font-medium">Proof</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingWinners.map((winner: PendingWinner) => (
                      <tr
                        key={winner.id}
                        className="border-b border-border/70 align-top"
                      >
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {winner.id}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {winner.user_id}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {winner.match_type}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          ${winner.prize_amount}
                        </td>
                        <td className="px-3 py-3">
                          {winner.proof_image_url ? (
                            <a
                              href={winner.proof_image_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex text-primary hover:text-primary/80"
                            >
                              View Image
                            </a>
                          ) : (
                            <span className="text-muted-foreground">
                              Not uploaded
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={processingWinnerId === winner.id}
                              onClick={() =>
                                handleWinnerDecision(winner.id, "approve")
                              }
                              className="rounded-md bg-chart-3 px-3 py-1.5 text-xs font-semibold text-foreground hover:brightness-110 disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={processingWinnerId === winner.id}
                              onClick={() =>
                                handleWinnerDecision(winner.id, "reject")
                              }
                              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-foreground hover:brightness-110 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pendingWinners.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No pending winners to verify.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
