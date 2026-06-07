import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";

const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";

// --- Monad Testnet Config ---
const MONAD_NETWORK: Network = "eip155:10143";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

if (!process.env.PAY_TO_ADDRESS) {
  throw new Error("PAY_TO_ADDRESS environment variable is required");
}
const PAY_TO = process.env.PAY_TO_ADDRESS;

// --- x402 Setup ---
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);

// Register custom money parser so x402 knows Monad's USDC address
const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    const tokenAmount = Math.floor(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: MONAD_USDC,
      extra: {
        name: "USDC",
        version: "2",
      },
    };
  }
  return null;
});

server.register(MONAD_NETWORK, monadScheme);

// --- Route Config ---
const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: PAY_TO,
    price: "$0.001",
  },
  description: "Pay 0.001 USDC to translate text using Sarvam AI",
};

// --- Translation Handler ---
async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, source_language, target_language } = body;

    if (!text || text.trim() === "") {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    if (!target_language) {
      return NextResponse.json(
        { error: "Target language is required" },
        { status: 400 }
      );
    }

    const sarvamResponse = await fetch(SARVAM_TRANSLATE_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        source_language_code: source_language ?? "auto",
        target_language_code: target_language,
        model: "mayura:v1",
        speaker_gender: "Male",
        mode: "formal",
      }),
    });

    if (!sarvamResponse.ok) {
      const errorData = await sarvamResponse.json();
      return NextResponse.json(
        { error: "Translation failed", details: errorData },
        { status: sarvamResponse.status }
      );
    }

    const data = await sarvamResponse.json();

    return NextResponse.json({
      success: true,
      translated_text: data.translated_text,
      source_language: source_language ?? "auto",
      target_language,
    });

  } catch (error) {
    console.error("Route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// --- Export with x402 Payment Gate ---
export const POST = withX402(handler, routeConfig, server);