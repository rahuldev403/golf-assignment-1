import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type WinnerTier = 3 | 4 | 5;

type ScoreRow = {
  user_id: string;
  score: number;
  date_played: string | null;
  created_at: string | null;
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

function getCurrentMonthRangeUtc() {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );

  return {
    nowIso: now.toISOString(),
    monthStartIso: monthStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
  };
}

function generateUniqueDrawNumbers(
  total: number,
  min: number,
  max: number,
): number[] {
  if (total > max - min + 1) {
    throw new Error(
      `Cannot generate ${total} unique numbers between ${min} and ${max}`,
    );
  }

  const values = new Set<number>();

  while (values.size < total) {
    values.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }

  return Array.from(values).sort((a, b) => a - b);
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return jsonError(
        "Supabase environment variables are not configured.",
        500,
        "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY), and SUPABASE_SERVICE_ROLE_KEY.",
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

    const serviceDb = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userProfile, error: roleError } = await serviceDb
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (roleError) {
      return jsonError("Failed to verify admin role.", 500, roleError.message);
    }

    if (userProfile?.role !== "admin") {
      return jsonError("Forbidden. Admin access is required.", 403);
    }

    const { nowIso, monthStartIso, nextMonthStartIso } =
      getCurrentMonthRangeUtc();

    // ============================================================
    // STEP 1: Delete existing simulated draws for this month
    // ============================================================
    const { data: existingSimulatedDraws, error: drawLookupError } =
      await serviceDb
        .from("draws")
        .select("id")
        .eq("status", "simulated")
        .gte("draw_date", monthStartIso)
        .lt("draw_date", nextMonthStartIso);

    if (drawLookupError) {
      return jsonError(
        "Failed to check existing simulated draw for this month.",
        500,
        drawLookupError.message,
      );
    }

    const existingDrawIds = (existingSimulatedDraws ?? []).map(
      (row) => row.id as string,
    );

    if (existingDrawIds.length > 0) {
      const { error: deleteWinnersError } = await serviceDb
        .from("winners")
        .delete()
        .in("draw_id", existingDrawIds);

      if (deleteWinnersError) {
        return jsonError(
          "Failed to delete winners for existing simulated draw.",
          500,
          deleteWinnersError.message,
        );
      }

      const { error: deleteDrawsError } = await serviceDb
        .from("draws")
        .delete()
        .in("id", existingDrawIds);

      if (deleteDrawsError) {
        return jsonError(
          "Failed to delete existing simulated draw.",
          500,
          deleteDrawsError.message,
        );
      }
    }

    // ============================================================
    // STEP 2: Generate winning numbers and validate
    // ============================================================
    let winningNumbers: number[];
    try {
      winningNumbers = generateUniqueDrawNumbers(5, 1, 45);
    } catch (error) {
      return jsonError(
        "Failed to generate winning numbers.",
        500,
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    if (
      !Array.isArray(winningNumbers) ||
      winningNumbers.length !== 5 ||
      !winningNumbers.every((n) => typeof n === "number" && n >= 1 && n <= 45)
    ) {
      return jsonError(
        "Generated winning numbers are invalid.",
        500,
        `Expected 5 unique numbers between 1-45, got: ${JSON.stringify(winningNumbers)}`,
      );
    }

    const winningSet = new Set(winningNumbers);

    // ============================================================
    // STEP 3: Fetch active subscriptions
    // ============================================================
    const { data: activeSubscriptions, error: activeSubsError } =
      await serviceDb
        .from("subscriptions")
        .select("user_id")
        .eq("status", "active");

    if (activeSubsError) {
      return jsonError(
        "Failed to fetch active subscriptions.",
        500,
        activeSubsError.message,
      );
    }

    const activeUserIds = Array.from(
      new Set(
        (activeSubscriptions ?? [])
          .map((row) => row.user_id as string | null)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    // ============================================================
    // STEP 4: Calculate prize pools with rollover
    // ============================================================
    const { data: settingsRow, error: settingsError } = await serviceDb
      .from("system_settings")
      .select("id, current_jackpot_rollover")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError) {
      return jsonError(
        "Failed to fetch system settings.",
        500,
        settingsError.message,
      );
    }

    const currentRollover = toMoney(
      Number(settingsRow?.current_jackpot_rollover ?? 0),
    );

    if (!Number.isFinite(currentRollover) || currentRollover < 0) {
      return jsonError(
        "Invalid jackpot rollover value in system settings.",
        500,
        `Expected non-negative finite number, got: ${currentRollover}`,
      );
    }

    const monthlySubscriptionPrice = 10;
    const prizePoolPercent = 0.5;

    const totalPool = toMoney(
      activeUserIds.length * monthlySubscriptionPrice * prizePoolPercent +
        currentRollover,
    );

    if (!Number.isFinite(totalPool)) {
      return jsonError(
        "Calculated total pool is invalid.",
        500,
        `Expected finite number, got: ${totalPool}`,
      );
    }

    const tierPool5 = toMoney(totalPool * 0.4);
    const tierPool4 = toMoney(totalPool * 0.35);
    const tierPool3 = toMoney(totalPool * 0.25);

    // Validate pools sum to total (within rounding tolerance)
    const poolSum = toMoney(tierPool5 + tierPool4 + tierPool3);
    if (Math.abs(poolSum - totalPool) > 0.01) {
      return jsonError(
        "Prize pool allocation math error.",
        500,
        `Pools (${tierPool5} + ${tierPool4} + ${tierPool3} = ${poolSum}) don't sum to total (${totalPool})`,
      );
    }

    // ============================================================
    // STEP 5: Determine winners by tier
    // ============================================================
    const winnersByTier: Record<WinnerTier, string[]> = {
      3: [],
      4: [],
      5: [],
    };

    if (activeUserIds.length > 0) {
      const { data: scoreRows, error: scoreError } = await serviceDb
        .from("scores")
        .select("user_id, score, date_played, created_at")
        .in("user_id", activeUserIds)
        .order("user_id", { ascending: true })
        .order("date_played", { ascending: false })
        .order("created_at", { ascending: false });

      if (scoreError) {
        return jsonError("Failed to fetch scores.", 500, scoreError.message);
      }

      const latestFiveByUser = new Map<string, ScoreRow[]>();
      for (const row of (scoreRows ?? []) as ScoreRow[]) {
        const list = latestFiveByUser.get(row.user_id) ?? [];
        if (list.length < 5) {
          list.push(row);
          latestFiveByUser.set(row.user_id, list);
        }
      }

      for (const userId of activeUserIds) {
        const latestFive = latestFiveByUser.get(userId) ?? [];
        const userNumbers = Array.from(
          new Set(latestFive.map((row) => row.score)),
        );

        const matchCount = userNumbers.reduce((count, number) => {
          return winningSet.has(number) ? count + 1 : count;
        }, 0);

        if (matchCount === 3 || matchCount === 4 || matchCount === 5) {
          winnersByTier[matchCount].push(userId);
        }
      }
    }

    // ============================================================
    // STEP 6: Calculate individual prizes with division-by-zero protection
    // ============================================================
    const prizeEach5 =
      winnersByTier[5].length > 0
        ? toMoney(tierPool5 / winnersByTier[5].length)
        : 0;
    const prizeEach4 =
      winnersByTier[4].length > 0
        ? toMoney(tierPool4 / winnersByTier[4].length)
        : 0;
    const prizeEach3 =
      winnersByTier[3].length > 0
        ? toMoney(tierPool3 / winnersByTier[3].length)
        : 0;

    // ============================================================
    // STEP 7: Calculate rollover for UNCLAIMED tiers
    // BUGFIX: Roll over ALL tiers with 0 winners, not just tier 5
    // ============================================================
    const rolloverAmountGenerated = toMoney(
      (winnersByTier[5].length === 0 ? tierPool5 : 0) +
        (winnersByTier[4].length === 0 ? tierPool4 : 0) +
        (winnersByTier[3].length === 0 ? tierPool3 : 0),
    );

    if (
      !Number.isFinite(rolloverAmountGenerated) ||
      rolloverAmountGenerated < 0
    ) {
      return jsonError(
        "Invalid rollover calculation.",
        500,
        `Expected non-negative finite number, got: ${rolloverAmountGenerated}`,
      );
    }

    // ============================================================
    // STEP 8: Insert draw with validation
    // ============================================================
    const { data: insertedDraw, error: drawInsertError } = await serviceDb
      .from("draws")
      .insert({
        draw_date: nowIso,
        status: "simulated",
        winning_numbers: winningNumbers,
        total_prize_pool: totalPool,
        rollover_amount_generated: rolloverAmountGenerated,
        jackpot_amount: 0,
      })
      .select(
        "id, draw_date, status, winning_numbers, total_prize_pool, rollover_amount_generated",
      )
      .single();

    if (drawInsertError || !insertedDraw) {
      return jsonError(
        "Failed to insert simulated draw.",
        500,
        drawInsertError?.message,
      );
    }

    // Validate returned draw ID
    if (!insertedDraw.id || typeof insertedDraw.id !== "string") {
      return jsonError(
        "Draw inserted but returned invalid ID.",
        500,
        JSON.stringify(insertedDraw),
      );
    }

    // ============================================================
    // STEP 9: Insert winners
    // ============================================================
    const winnersToInsert = [
      ...winnersByTier[5].map((userId) => ({
        draw_id: insertedDraw.id,
        user_id: userId,
        match_type: 5,
        prize_amount: prizeEach5,
        payment_status: "pending" as const,
      })),
      ...winnersByTier[4].map((userId) => ({
        draw_id: insertedDraw.id,
        user_id: userId,
        match_type: 4,
        prize_amount: prizeEach4,
        payment_status: "pending" as const,
      })),
      ...winnersByTier[3].map((userId) => ({
        draw_id: insertedDraw.id,
        user_id: userId,
        match_type: 3,
        prize_amount: prizeEach3,
        payment_status: "pending" as const,
      })),
    ];

    if (winnersToInsert.length > 0) {
      const { error: winnersInsertError } = await serviceDb
        .from("winners")
        .insert(winnersToInsert);

      if (winnersInsertError) {
        // Rollback: delete draw on winner insertion failure
        await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
        return jsonError(
          "Failed to insert winners.",
          500,
          winnersInsertError.message,
        );
      }

      // Verify winner count matches expected
      const { count: insertedWinnerCount, error: countError } = await serviceDb
        .from("winners")
        .select("id", { count: "exact", head: true })
        .eq("draw_id", insertedDraw.id);

      if (
        countError ||
        insertedWinnerCount === null ||
        insertedWinnerCount !== winnersToInsert.length
      ) {
        await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
        await serviceDb.from("winners").delete().eq("draw_id", insertedDraw.id);
        return jsonError(
          "Winner insertion verification failed.",
          500,
          `Expected ${winnersToInsert.length} winners, verified ${insertedWinnerCount}`,
        );
      }
    }

    // ============================================================
    // STEP 10: Update system settings with new rollover
    // ============================================================
    const { error: settingsUpsertError } = await serviceDb
      .from("system_settings")
      .upsert(
        {
          id: 1,
          current_jackpot_rollover: rolloverAmountGenerated,
        },
        { onConflict: "id" },
      );

    if (settingsUpsertError) {
      return jsonError(
        "Simulation created but failed to update system settings rollover.",
        500,
        settingsUpsertError.message,
      );
    }

    // ============================================================
    // STEP 11: Return success response with full audit trail
    // ============================================================
    return NextResponse.json(
      {
        success: true,
        draw: insertedDraw,
        summary: {
          winning_numbers: winningNumbers,
          total_pool: totalPool,
          winners_count: {
            match_5: winnersByTier[5].length,
            match_4: winnersByTier[4].length,
            match_3: winnersByTier[3].length,
            total: winnersToInsert.length,
          },
          tier_pools: {
            match_5: tierPool5,
            match_4: tierPool4,
            match_3: tierPool3,
          },
          unclaimed_tiers: {
            match_5: winnersByTier[5].length === 0 ? tierPool5 : 0,
            match_4: winnersByTier[4].length === 0 ? tierPool4 : 0,
            match_3: winnersByTier[3].length === 0 ? tierPool3 : 0,
          },
          payouts_each: {
            match_5: prizeEach5,
            match_4: prizeEach4,
            match_3: prizeEach3,
          },
          rollover: {
            previous: currentRollover,
            generated: rolloverAmountGenerated,
            next: rolloverAmountGenerated,
            note: "Rollover includes all unclaimed tier pools (5, 4, and 3-match)",
          },
          accounting: {
            pool_sum: poolSum,
            total_payouts: toMoney(
              prizeEach5 * winnersByTier[5].length +
                prizeEach4 * winnersByTier[4].length +
                prizeEach3 * winnersByTier[3].length,
            ),
            total_distributed_plus_rollover: toMoney(
              prizeEach5 * winnersByTier[5].length +
                prizeEach4 * winnersByTier[4].length +
                prizeEach3 * winnersByTier[3].length +
                rolloverAmountGenerated,
            ),
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return jsonError(
      "Unexpected error while simulating monthly draw.",
      500,
      message,
    );
  }
}
