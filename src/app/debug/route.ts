import { NextResponse } from "next/server";

// Simple endpoint to prevent 404 errors from Privy security checks
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  });
}
