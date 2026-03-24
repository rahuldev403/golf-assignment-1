import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PlanType = "monthly" | "yearly";

function normalizePlanType(value: unknown): PlanType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "monthly" || normalized === "month") {
    return "monthly";
  }

  if (
    normalized === "yearly" ||
    normalized === "year" ||
    normalized === "annual"
  ) {
    return "yearly";
  }

  return null;
}

async function resolvePlanType(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<PlanType> {
  const metadataPlan = normalizePlanType(session.metadata?.plan_type);
  if (metadataPlan) {
    return metadataPlan;
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!subscriptionId) {
    return "monthly";
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  return interval === "year" ? "yearly" : "monthly";
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 500 },
    );
  }

  if (!supabaseUrl || !supabaseServiceRole) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripeWebhookSecret,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const customerId =
      typeof session.customer === "string" ? session.customer : null;

    if (!userId || !customerId) {
      return NextResponse.json(
        {
          received: true,
          ignored: true,
          reason: "Missing user_id metadata or Stripe customer ID.",
        },
        { status: 200 },
      );
    }

    const planType = await resolvePlanType(stripe, session);

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);
    const { error } = await serviceClient.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        status: "active",
        plan_type: planType,
      },
      {
        onConflict: "user_id",
      },
    );

    if (error) {
      return NextResponse.json(
        { error: `Failed to upsert subscription: ${error.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
