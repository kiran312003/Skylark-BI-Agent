import { NextRequest, NextResponse } from "next/server";
import { getBoards } from "@/lib/monday";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { apiKey?: string };
    const { apiKey } = body;

    const key = apiKey || process.env.MONDAY_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Monday.com API key is required" },
        { status: 400 }
      );
    }

    const boards = await getBoards({ apiKey: key });
    return NextResponse.json({ boards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch boards";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
