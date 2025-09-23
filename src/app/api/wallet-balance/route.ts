import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Zod schema for request validation
const WalletBalanceRequestSchema = z.object({
  walletId: z.string().min(1, "Wallet ID is required"),
  asset: z.enum(['usdc', 'eth', 'pol', 'sol'], {
    errorMap: () => ({ message: "Asset must be one of: usdc, eth, pol, sol" })
  }),
  chain: z.enum([
    'ethereum', 
    'arbitrum', 
    'base', 
    'linea', 
    'optimism', 
    'polygon', 
    'solana', 
    'zksync_era'
  ], {
    errorMap: () => ({ message: "Invalid chain specified" })
  })
});

// Zod schema for Privy API response validation
const PrivyBalanceResponseSchema = z.object({
  balances: z.array(z.object({
    chain: z.string(),
    asset: z.string(),
    raw_value: z.string(),
    raw_value_decimals: z.number(),
    display_values: z.object({
      usdc: z.string().optional(),
      eth: z.string().optional(),
      sol: z.string().optional(),
      usd: z.string().optional(),
    }).optional()
  }))
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = WalletBalanceRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    const { walletId, asset, chain } = validationResult.data;

    // Get environment variables
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
      console.error("Missing Privy credentials");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create Basic Auth header
    const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    
    // Call Privy's balance API
    const privyApiUrl = `https://api.privy.io/v1/wallets/${walletId}/balance?asset=${asset}&chain=${chain}`;
    
    console.log(`Fetching balance from Privy API: ${privyApiUrl}`);
    
    const response = await fetch(privyApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Privy API error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Wallet not found or no balance data available" },
          { status: 404 }
        );
      }
      
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "Authentication failed with Privy API" },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: `Privy API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const rawData = await response.json();
    
    // Validate Privy API response
    const balanceValidation = PrivyBalanceResponseSchema.safeParse(rawData);
    
    if (!balanceValidation.success) {
      console.error("Invalid response from Privy API:", balanceValidation.error);
      return NextResponse.json(
        { error: "Invalid response format from balance API" },
        { status: 502 }
      );
    }

    const balanceData = balanceValidation.data;
    
    // Log for debugging
    console.log(`Balance data received for ${asset} on ${chain}:`, balanceData);
    
    // Return the validated balance data
    return NextResponse.json(balanceData);

  } catch (error) {
    console.error("Wallet balance API error:", error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
