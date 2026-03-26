import Stripe from "stripe";
import { NextResponse } from "next/server";

type DonationRequestBody = {
  amount?: number;
  charityName?: string;
};

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const body = ((await request.json().catch(() => ({}))) ??
      {}) as DonationRequestBody;
    const { amount, charityName } = body;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
        { status: 500 },
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0." },
        { status: 400 },
      );
    }

    if (!charityName || charityName.trim().length === 0) {
      return NextResponse.json(
        { error: "Charity name is required." },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `One-Time Donation: ${charityName}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/charities?donation=success`,
      cancel_url: `${siteUrl}/charities?donation=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create donation checkout session.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
