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

type PublishBody = {
  draw_id?: unknown;
};

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

    let body: PublishBody = {};
    try {
      body = (await request.json()) as PublishBody;
    } catch {
      body = {};
    }

    const requestedDrawId =
      typeof body.draw_id === "string" && body.draw_id.trim().length > 0
        ? body.draw_id.trim()
        : null;

    const drawQuery = authedDb
      .from("draws")
      .select("id, draw_date, status, winning_numbers, jackpot_amount");

    const { data: drawToPublish, error: drawFetchError } = requestedDrawId
      ? await drawQuery.eq("id", requestedDrawId).maybeSingle()
      : await drawQuery
          .eq("status", "simulated")
          .order("draw_date", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (drawFetchError) {
      return jsonError("Failed to fetch draw.", 500, drawFetchError.message);
    }

    if (!drawToPublish) {
      return jsonError("No draw found to publish.", 404);
    }

    if (drawToPublish.status === "published") {
      return NextResponse.json(
        {
          success: true,
          message: "Draw is already published.",
          draw: drawToPublish,
        },
        { status: 200 },
      );
    }

    const { data: updatedDraw, error: updateError } = await authedDb
      .from("draws")
      .update({ status: "published" })
      .eq("id", drawToPublish.id)
      .select("id, draw_date, status, winning_numbers, jackpot_amount")
      .single();

    if (updateError || !updatedDraw) {
      return jsonError("Failed to publish draw.", 500, updateError?.message);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Draw published successfully.",
        draw: updatedDraw,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return jsonError("Unexpected error while publishing draw.", 500, message);
  }
}
