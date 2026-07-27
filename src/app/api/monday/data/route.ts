import { NextRequest, NextResponse } from "next/server";
import { getBoardData } from "@/lib/monday";
import { detectBoardType } from "@/lib/dataAnalysis";
import { prepareBoardData } from "@/lib/biAgent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      apiKey?: string;
      boardIds?: string[];
      boardTypes?: Record<string, "work_orders" | "deals" | "unknown">;
    };

    const { boardIds, boardTypes } = body;
    const apiKey = body.apiKey || process.env.MONDAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Monday.com API key is required" },
        { status: 400 }
      );
    }

    if (!boardIds || boardIds.length === 0) {
      return NextResponse.json(
        { error: "At least one board ID is required" },
        { status: 400 }
      );
    }

    const boardsData = await Promise.all(
      boardIds.map(async (boardId) => {
        try {
          const board = await getBoardData({ apiKey }, boardId);
          const requestedType = boardTypes?.[boardId];
          // "unknown" means the user chose Auto-detect, so fall through to detection.
          const detectedType =
            requestedType && requestedType !== "unknown"
              ? requestedType
              : detectBoardType(
                  board.name,
                  board.columns.map((c) => c.title)
                );
          return prepareBoardData(board, detectedType);
        } catch (err) {
          const message = err instanceof Error ? err.message : `Failed to load board ${boardId}`;
          return {
            boardId,
            error: message,
            name: `Board ${boardId}`,
            type: "unknown" as const,
            columns: [],
            records: [],
          };
        }
      })
    );

    return NextResponse.json({ boards: boardsData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch board data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
