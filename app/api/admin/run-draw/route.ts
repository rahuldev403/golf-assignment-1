import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ScoreRow = {
  user_id: string;
  score: number;
  date_played: string | null;
  created_at: string | null;
};

type WinnerTier = 3 | 4 | 5;

type WinnerCandidate = {
  user_id: string;
  match_type: WinnerTier;
};

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function generateUniqueDrawNumbers(
  total: number,
  min: number,
  max: number,
): number[] {
  const picked = new Set<number>();

  while (picked.size < total) {
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    picked.add(value);
  }

  return Array.from(picked).sort((a, b) => a - b);
}

function getCurrentMonthRange() {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );

  return {
    nowIso: now.toISOString(),
    monthStartIso: monthStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError(
        "Supabase environment variables are not configured.",
        500,
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).",
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header.", 401);
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonError("Missing bearer token.", 401);
    }

    const baseClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await baseClient.auth.getUser(accessToken);

    if (authError || !user) {
      return jsonError("User is not authenticated.", 401, authError?.message);
    }

    const authedDb = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: adminCheck, error: adminCheckError } = await authedDb
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminCheckError) {
      return jsonError(
        "Failed to verify admin role.",
        500,
        adminCheckError.message,
      );
    }

    if (adminCheck?.role !== "admin") {
      return jsonError("Forbidden. Admin access is required.", 403);
    }

    const { monthStartIso, nextMonthStartIso, nowIso } = getCurrentMonthRange();
    const { data: existingDrawInMonth, error: existingDrawError } =
      await authedDb
        .from("draws")
        .select("id, draw_date, status")
        .gte("draw_date", monthStartIso)
        .lt("draw_date", nextMonthStartIso)
        .order("draw_date", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingDrawError) {
      return jsonError(
        "Failed to validate existing monthly draw.",
        500,
        existingDrawError.message,
      );
    }

    if (existingDrawInMonth) {
      return jsonError(
        "A draw already exists for this month.",
        409,
        "Publish or remove the existing draw before running another one.",
      );
    }

    const subscriptionPrice = Math.max(
      0,
      parseEnvNumber("DRAW_SUBSCRIPTION_PRICE", 10),
    );
    const prizePoolPercentRaw = parseEnvNumber("DRAW_PRIZE_POOL_PERCENT", 0.5);
    const prizePoolPercent = Math.min(Math.max(prizePoolPercentRaw, 0), 1);

    const { data: activeSubscriptions, error: activeSubscriptionsError } =
      await authedDb
        .from("subscriptions")
        .select("user_id")
        .eq("status", "active");

    if (activeSubscriptionsError) {
      return jsonError(
        "Failed to fetch active subscriptions.",
        500,
        activeSubscriptionsError.message,
      );
    }

    const activeUserIds = Array.from(
      new Set(
        (activeSubscriptions ?? [])
          .map((row: { user_id: string | null }) => row.user_id)
          .filter(Boolean),
      ),
    ) as string[];

    const drawNumbers = generateUniqueDrawNumbers(5, 1, 45);
    const drawNumberSet = new Set(drawNumbers);

    let winnersByTier: Record<WinnerTier, WinnerCandidate[]> = {
      3: [],
      4: [],
      5: [],
    };

    if (activeUserIds.length > 0) {
      const { data: allScores, error: allScoresError } = await authedDb
        .from("scores")
        .select("user_id, score, date_played, created_at")
        .in("user_id", activeUserIds)
        .order("user_id", { ascending: true })
        .order("date_played", { ascending: false })
        .order("created_at", { ascending: false });

      if (allScoresError) {
        return jsonError(
          "Failed to fetch user scores.",
          500,
          allScoresError.message,
        );
      }

      const groupedScores = new Map<string, ScoreRow[]>();
      for (const row of (allScores ?? []) as ScoreRow[]) {
        const existing = groupedScores.get(row.user_id) ?? [];
        if (existing.length < 5) {
          existing.push(row);
          groupedScores.set(row.user_id, existing);
        }
      }

      for (const userId of activeUserIds) {
        const latestFiveRows = groupedScores.get(userId) ?? [];
        if (latestFiveRows.length < 5) {
          continue;
        }

        const uniqueUserNumbers = Array.from(
          new Set(latestFiveRows.map((entry) => entry.score)),
        );
        const matchCount = uniqueUserNumbers.reduce((count, value) => {
          return drawNumberSet.has(value) ? count + 1 : count;
        }, 0);

        if (matchCount === 3 || matchCount === 4 || matchCount === 5) {
          winnersByTier[matchCount].push({
            user_id: userId,
            match_type: matchCount,
          });
        }
      }
    }

    const activeSubscriberCount = activeUserIds.length;
    const grossSubscriptionRevenue = toMoney(
      activeSubscriberCount * subscriptionPrice,
    );
    const totalPrizePool = toMoney(grossSubscriptionRevenue * prizePoolPercent);

    const tierPool5 = toMoney(totalPrizePool * 0.4);
    const tierPool4 = toMoney(totalPrizePool * 0.35);
    const tierPool3 = toMoney(totalPrizePool * 0.25);

    const fiveMatchWinnerCount = winnersByTier[5].length;
    const fourMatchWinnerCount = winnersByTier[4].length;
    const threeMatchWinnerCount = winnersByTier[3].length;

    const fiveMatchPrizeEach =
      fiveMatchWinnerCount > 0 ? toMoney(tierPool5 / fiveMatchWinnerCount) : 0;
    const fourMatchPrizeEach =
      fourMatchWinnerCount > 0 ? toMoney(tierPool4 / fourMatchWinnerCount) : 0;
    const threeMatchPrizeEach =
      threeMatchWinnerCount > 0
        ? toMoney(tierPool3 / threeMatchWinnerCount)
        : 0;

    const rolloverAmount = fiveMatchWinnerCount === 0 ? tierPool5 : 0;

    const { data: insertedDraw, error: insertDrawError } = await authedDb
      .from("draws")
      .insert({
        draw_date: nowIso,
        status: "simulated",
        winning_numbers: drawNumbers,
        jackpot_amount: rolloverAmount,
      })
      .select("id, draw_date, status, winning_numbers, jackpot_amount")
      .single();

    if (insertDrawError || !insertedDraw) {
      return jsonError("Failed to insert draw.", 500, insertDrawError?.message);
    }

    const winnerRowsToInsert = [
      ...winnersByTier[5].map((winner) => ({
        draw_id: insertedDraw.id,
        user_id: winner.user_id,
        match_type: winner.match_type,
        prize_amount: fiveMatchPrizeEach,
        payment_status: "pending" as const,
      })),
      ...winnersByTier[4].map((winner) => ({
        draw_id: insertedDraw.id,
        user_id: winner.user_id,
        match_type: winner.match_type,
        prize_amount: fourMatchPrizeEach,
        payment_status: "pending" as const,
      })),
      ...winnersByTier[3].map((winner) => ({
        draw_id: insertedDraw.id,
        user_id: winner.user_id,
        match_type: winner.match_type,
        prize_amount: threeMatchPrizeEach,
        payment_status: "pending" as const,
      })),
    ];

    if (winnerRowsToInsert.length > 0) {
      const { error: insertWinnersError } = await authedDb
        .from("winners")
        .insert(winnerRowsToInsert);

      if (insertWinnersError) {
        await authedDb.from("draws").delete().eq("id", insertedDraw.id);
        return jsonError(
          "Failed to insert winners.",
          500,
          insertWinnersError.message,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        draw: insertedDraw,
        summary: {
          active_subscribers: activeSubscriberCount,
          subscription_price: subscriptionPrice,
          gross_subscription_revenue: grossSubscriptionRevenue,
          prize_pool_percent: prizePoolPercent,
          total_prize_pool: totalPrizePool,
          tier_pools: {
            match_5: tierPool5,
            match_4: tierPool4,
            match_3: tierPool3,
          },
          winners_count: {
            match_5: fiveMatchWinnerCount,
            match_4: fourMatchWinnerCount,
            match_3: threeMatchWinnerCount,
          },
          prize_each: {
            match_5: fiveMatchPrizeEach,
            match_4: fourMatchPrizeEach,
            match_3: threeMatchPrizeEach,
          },
          rollover: {
            enabled: fiveMatchWinnerCount === 0,
            amount: rolloverAmount,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return jsonError(
      "Unexpected error while running monthly draw.",
      500,
      message,
    );
  }
}
