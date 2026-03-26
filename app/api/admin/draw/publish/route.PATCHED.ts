import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

    // ============================================================
    // STEP 1: Authenticate admin user
    // ============================================================
    const baseClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await baseClient.auth.getUser(accessToken);

    if (authError || !user) {
      return jsonError("User is not authenticated.", 401, authError?.message);
    }

    // Use service-role client for admin operations to bypass RLS.
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

    // ============================================================
    // STEP 2: Fetch the most recent simulated draw
    // ============================================================
    const { data: simulatedDraw, error: drawFetchError } = await serviceDb
      .from("draws")
      .select(
        "id, status, draw_date, winning_numbers, total_prize_pool, rollover_amount_generated",
      )
      .eq("status", "simulated")
      .order("draw_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (drawFetchError) {
      return jsonError(
        "Failed to fetch simulated draw.",
        500,
        drawFetchError.message,
      );
    }

    if (!simulatedDraw) {
      return jsonError("No simulated draw found to publish.", 404);
    }

    // ============================================================
    // STEP 3: Validate draw data completeness
    // ============================================================
    if (!simulatedDraw.id || typeof simulatedDraw.id !== "string") {
      return jsonError(
        "Simulated draw has invalid ID.",
        500,
        JSON.stringify(simulatedDraw),
      );
    }

    if (
      !Array.isArray(simulatedDraw.winning_numbers) ||
      simulatedDraw.winning_numbers.length !== 5
    ) {
      return jsonError(
        "Simulated draw has invalid winning_numbers.",
        500,
        `Expected array of 5 numbers, got: ${JSON.stringify(simulatedDraw.winning_numbers)}`,
      );
    }

    if (
      !Number.isFinite(simulatedDraw.total_prize_pool) ||
      simulatedDraw.total_prize_pool < 0
    ) {
      return jsonError(
        "Simulated draw has invalid total_prize_pool.",
        500,
        `Expected non-negative finite number, got: ${simulatedDraw.total_prize_pool}`,
      );
    }

    if (
      !Number.isFinite(simulatedDraw.rollover_amount_generated) ||
      simulatedDraw.rollover_amount_generated < 0
    ) {
      return jsonError(
        "Simulated draw has invalid rollover_amount_generated.",
        500,
        `Expected non-negative finite number, got: ${simulatedDraw.rollover_amount_generated}`,
      );
    }

    // ============================================================
    // STEP 4: Verify winners exist for this draw
    // ============================================================
    const { count: winnerCount, error: winnerCountError } = await serviceDb
      .from("winners")
      .select("id", { count: "exact", head: true })
      .eq("draw_id", simulatedDraw.id);

    if (winnerCountError) {
      return jsonError(
        "Failed to verify winners for draw.",
        500,
        winnerCountError.message,
      );
    }

    // Note: It's valid to have 0 winners (full rollover), so we don't error

    // ============================================================
    // STEP 5: Publish the draw by changing status to "published"
    // ============================================================
    const { data: publishedDraw, error: publishError } = await serviceDb
      .from("draws")
      .update({ status: "published" })
      .eq("id", simulatedDraw.id)
      .select(
        "id, status, draw_date, winning_numbers, total_prize_pool, rollover_amount_generated",
      )
      .single();

    if (publishError || !publishedDraw) {
      return jsonError("Failed to publish draw.", 500, publishError?.message);
    }

    // Validate that status was actually updated
    if (publishedDraw.status !== "published") {
      return jsonError(
        "Draw status was not updated to 'published'.",
        500,
        `Status is: ${publishedDraw.status}`,
      );
    }

    // ============================================================
    // STEP 6: Extract and validate rollover amount
    // ============================================================
    const rolloverAmount = toMoney(
      Number(publishedDraw.rollover_amount_generated ?? 0),
    );

    if (!Number.isFinite(rolloverAmount) || rolloverAmount < 0) {
      return jsonError(
        "Invalid rollover amount from published draw.",
        500,
        `Expected non-negative finite number, got: ${rolloverAmount}`,
      );
    }

    // ============================================================
    // STEP 7: Update system settings with the rollover for next month
    // ============================================================
    const { error: settingsError } = await serviceDb
      .from("system_settings")
      .upsert(
        {
          id: 1,
          current_jackpot_rollover: rolloverAmount,
        },
        {
          onConflict: "id",
        },
      );

    if (settingsError) {
      return jsonError(
        "Draw published but failed to update system settings rollover.",
        500,
        settingsError.message,
      );
    }

    // ============================================================
    // STEP 8: Verify settings were actually updated
    // ============================================================
    const { data: updatedSettings, error: settingsVerifyError } =
      await serviceDb
        .from("system_settings")
        .select("current_jackpot_rollover")
        .eq("id", 1)
        .single();

    if (
      settingsVerifyError ||
      !updatedSettings ||
      Number(updatedSettings.current_jackpot_rollover) !== rolloverAmount
    ) {
      return jsonError(
        "Draw published but system settings rollover verification failed.",
        500,
        `Expected rollover ${rolloverAmount}, got ${updatedSettings?.current_jackpot_rollover}`,
      );
    }

    // ============================================================
    // STEP 9: Return success response with full audit trail
    // ============================================================
    return NextResponse.json(
      {
        success: true,
        message: "Draw published successfully.",
        draw: publishedDraw,
        winners_published: winnerCount ?? 0,
        rollover_applied_for_next_month: rolloverAmount,
        audit_trail: {
          published_at: new Date().toISOString(),
          admin_user_id: user.id,
          draw_id: publishedDraw.id,
          draw_date: publishedDraw.draw_date,
          status_changed_from: "simulated",
          status_changed_to: "published",
          total_prize_pool: publishedDraw.total_prize_pool,
          jackpot_rollover_to_next_month: rolloverAmount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return jsonError("Unexpected error while publishing draw.", 500, message);
  }
}
