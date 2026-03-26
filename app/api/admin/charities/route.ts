import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CharityRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_featured: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

type CreateCharityBody = {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  is_featured?: unknown;
  image_url?: unknown;
};

type UpdateCharityBody = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  is_featured?: unknown;
  image_url?: unknown;
};

type DeleteCharityBody = {
  id?: unknown;
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

function jsonSuccess(data: unknown) {
  return NextResponse.json({
    success: true,
    data,
  });
}

async function verifyAdminRole(
  accessToken: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<{ valid: boolean; error?: string; userId?: string }> {
  try {
    const baseClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await baseClient.auth.getUser(accessToken);

    if (authError || !user) {
      return { valid: false, error: "User is not authenticated." };
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
      return { valid: false, error: "Failed to verify admin role." };
    }

    if (adminCheck?.role !== "admin") {
      return { valid: false, error: "Forbidden. Admin access is required." };
    }

    return { valid: true, userId: user.id };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function getServiceRoleClient(supabaseUrl: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY environment variable is not set.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
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
      );
    }

    // Verify authorization header
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header.", 401);
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonError("Missing bearer token.", 401);
    }

    // Verify admin role
    const adminCheck = await verifyAdminRole(
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
    );
    if (!adminCheck.valid) {
      return jsonError(adminCheck.error || "Admin verification failed.", 403);
    }

    // Parse request body
    let body: CreateCharityBody = {};
    try {
      body = (await request.json()) as CreateCharityBody;
    } catch {
      return jsonError("Invalid JSON in request body.", 400);
    }

    // Validate required fields
    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : null;
    if (!name) {
      return jsonError("Missing required field: name", 400);
    }

    // Prepare charity data
    const charityData = {
      name,
      description:
        typeof body.description === "string" ? body.description : null,
      category: typeof body.category === "string" ? body.category : null,
      is_featured:
        typeof body.is_featured === "boolean" ? body.is_featured : false,
      image_url: typeof body.image_url === "string" ? body.image_url : null,
    };

    // Use service role client to bypass RLS
    const serviceDb = getServiceRoleClient(supabaseUrl);

    const { data, error } = await serviceDb
      .from("charities")
      .insert([charityData])
      .select();

    if (error) {
      return jsonError("Failed to create charity.", 500, error.message);
    }

    if (!data || data.length === 0) {
      return jsonError("Charity created but no data returned.", 500);
    }

    return jsonSuccess(data[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Internal server error.", 500, message);
  }
}

export async function PUT(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError(
        "Supabase environment variables are not configured.",
        500,
      );
    }

    // Verify authorization header
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header.", 401);
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonError("Missing bearer token.", 401);
    }

    // Verify admin role
    const adminCheck = await verifyAdminRole(
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
    );
    if (!adminCheck.valid) {
      return jsonError(adminCheck.error || "Admin verification failed.", 403);
    }

    // Parse request body
    let body: UpdateCharityBody = {};
    try {
      body = (await request.json()) as UpdateCharityBody;
    } catch {
      return jsonError("Invalid JSON in request body.", 400);
    }

    // Validate charity ID
    const charityId =
      typeof body.id === "string" && body.id.trim().length > 0
        ? body.id.trim()
        : null;
    if (!charityId) {
      return jsonError("Missing required field: id", 400);
    }

    // Build update data (only include fields that are provided)
    const updateData: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim().length > 0) {
      updateData.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      updateData.description = body.description;
    }
    if (typeof body.category === "string") {
      updateData.category = body.category;
    }
    if (typeof body.is_featured === "boolean") {
      updateData.is_featured = body.is_featured;
    }
    if (typeof body.image_url === "string") {
      updateData.image_url = body.image_url;
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError("No fields to update provided.", 400);
    }

    // Use service role client to bypass RLS
    const serviceDb = getServiceRoleClient(supabaseUrl);

    const { data, error } = await serviceDb
      .from("charities")
      .update(updateData)
      .eq("id", charityId)
      .select();

    if (error) {
      return jsonError("Failed to update charity.", 500, error.message);
    }

    if (!data || data.length === 0) {
      return jsonError("Charity not found.", 404);
    }

    return jsonSuccess(data[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Internal server error.", 500, message);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError(
        "Supabase environment variables are not configured.",
        500,
      );
    }

    // Verify authorization header
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header.", 401);
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonError("Missing bearer token.", 401);
    }

    // Verify admin role
    const adminCheck = await verifyAdminRole(
      accessToken,
      supabaseUrl,
      supabaseAnonKey,
    );
    if (!adminCheck.valid) {
      return jsonError(adminCheck.error || "Admin verification failed.", 403);
    }

    // Parse request body
    let body: DeleteCharityBody = {};
    try {
      body = (await request.json()) as DeleteCharityBody;
    } catch {
      return jsonError("Invalid JSON in request body.", 400);
    }

    // Validate charity ID
    const charityId =
      typeof body.id === "string" && body.id.trim().length > 0
        ? body.id.trim()
        : null;
    if (!charityId) {
      return jsonError("Missing required field: id", 400);
    }

    // Use service role client to bypass RLS
    const serviceDb = getServiceRoleClient(supabaseUrl);

    const { data, error } = await serviceDb
      .from("charities")
      .delete()
      .eq("id", charityId)
      .select();

    if (error) {
      return jsonError("Failed to delete charity.", 500, error.message);
    }

    if (!data || data.length === 0) {
      return jsonError("Charity not found.", 404);
    }

    return jsonSuccess({ deleted: true, id: charityId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Internal server error.", 500, message);
  }
}
