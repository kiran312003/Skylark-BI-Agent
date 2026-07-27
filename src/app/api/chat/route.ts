import { NextRequest, NextResponse } from "next/server";
import { processQuery, generateLeadershipUpdate, type BoardData } from "@/lib/biAgent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      message?: string;
      boards?: BoardData[];
      history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
      openaiKey?: string;
      baseURL?: string;
      model?: string;
      action?: "leadership_update";
    };

    const { message, boards, history = [], action } = body;

    const openaiKey = body.openaiKey || process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OpenAI API key is required" },
        { status: 400 }
      );
    }

    if (!boards || boards.length === 0) {
      return NextResponse.json(
        { error: "Board data is required. Please connect your Monday.com boards first." },
        { status: 400 }
      );
    }

    const config = {
      openaiKey,
      model: body.model || process.env.OPENAI_MODEL || "gpt-4o",
      baseURL: body.baseURL || process.env.OPENAI_BASE_URL || undefined,
    };

    if (action === "leadership_update") {
      const update = await generateLeadershipUpdate(config, boards);
      return NextResponse.json({
        message: update,
        dataUsed: boards.map((b: BoardData) => b.name),
        suggestedFollowUps: [
          "Drill down into specific sector performance",
          "Show me deals closing this month",
          "Which projects are at risk?",
        ],
      });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const response = await processQuery(config, boards, history, message);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process query";
    console.error("Chat API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
