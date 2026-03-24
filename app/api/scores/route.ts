import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ExistingScoreRow = {
  id: string;
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

function parseScore(value: unknown): number | null {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue)) {
    return null;
  }

  if (numericValue < 1 || numericValue > 45) {
    return null;
  }

  return numericValue;
}

function parseDatePlayed(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return jsonError("User is not authenticated.", 401, authError?.message);
    }

    let body: { score?: unknown; date_played?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const score = parseScore(body?.score);
    if (score === null) {
      return jsonError("score must be an integer between 1 and 45.", 400);
    }

    const datePlayed = parseDatePlayed(body?.date_played);
    if (!datePlayed) {
      return jsonError("date_played must be a valid date string.", 400);
    }

    const authedDb = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: existingScores, error: existingScoresError } = await authedDb
      .from("scores")
      .select("id, date_played, created_at")
      .eq("user_id", user.id)
      .order("date_played", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(50);

    if (existingScoresError) {
      return jsonError(
        "Failed to fetch existing scores.",
        500,
        existingScoresError.message,
      );
    }

    const currentScores = (existingScores ?? []) as ExistingScoreRow[];

    if (currentScores.length >= 5) {
      const deleteCount = currentScores.length - 4;
      const oldestIds = currentScores
        .slice(0, deleteCount)
        .map((row) => row.id);

      if (oldestIds.length > 0) {
        const { error: deleteError } = await authedDb
          .from("scores")
          .delete()
          .in("id", oldestIds)
          .eq("user_id", user.id);

        if (deleteError) {
          return jsonError(
            "Failed to remove oldest score.",
            500,
            deleteError.message,
          );
        }
      }
    }

    const { error: insertError } = await authedDb.from("scores").insert({
      user_id: user.id,
      score,
      date_played: datePlayed,
    });

    if (insertError) {
      const status = insertError.code === "23514" ? 400 : 500;
      return jsonError("Failed to insert score.", status, insertError.message);
    }

    const { data: latestScores, error: latestScoresError } = await authedDb
      .from("scores")
      .select("id, user_id, score, date_played, created_at")
      .eq("user_id", user.id)
      .order("date_played", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    if (latestScoresError) {
      return jsonError(
        "Score saved, but failed to fetch latest scores.",
        500,
        latestScoresError.message,
      );
    }

    return NextResponse.json(
      {
        success: true,
        scores: latestScores ?? [],
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return jsonError("Unexpected error while submitting score.", 500, message);
  }
}
