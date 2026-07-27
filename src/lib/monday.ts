/**
 * Monday.com API Integration Layer
 * Handles GraphQL queries with pagination, error handling, and data normalization
 */

export interface MondayConfig {
  apiKey: string;
  apiVersion?: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  type: string;
}

export interface ColumnValue {
  id: string;
  text: string | null;
  value: string | null;
  type?: string;
  column?: {
    id: string;
    title: string;
    type: string;
  };
}

export interface BoardItem {
  id: string;
  name: string;
  group?: { id: string; title: string };
  column_values: ColumnValue[];
  created_at?: string;
  updated_at?: string;
}

export interface Board {
  id: string;
  name: string;
  columns: BoardColumn[];
  items: BoardItem[];
}

const MONDAY_API_URL = "https://api.monday.com/v2";

async function mondayQuery(
  config: MondayConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.apiKey,
      "API-Version": config.apiVersion || "2024-01",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Monday.com API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const result = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };

  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `Monday.com GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`
    );
  }

  return result.data;
}

export async function getBoards(config: MondayConfig): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query {
      boards(limit: 50, state: active) {
        id
        name
      }
    }
  `;

  const data = (await mondayQuery(config, query)) as {
    boards: Array<{ id: string; name: string }>;
  };

  return data.boards || [];
}

export async function getBoardData(
  config: MondayConfig,
  boardId: string
): Promise<Board> {
  // First get board metadata and columns
  const metaQuery = `
    query($boardId: [ID!]!) {
      boards(ids: $boardId) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const metaData = (await mondayQuery(config, metaQuery, {
    boardId: [boardId],
  })) as {
    boards: Array<{ id: string; name: string; columns: BoardColumn[] }>;
  };

  if (!metaData.boards || metaData.boards.length === 0) {
    throw new Error(`Board ${boardId} not found`);
  }

  const boardMeta = metaData.boards[0];
  const allItems: BoardItem[] = [];
  let cursor: string | null = null;

  // Paginate through all items
  do {
    const itemsQuery = cursor
      ? `
        query($boardId: [ID!]!, $cursor: String!) {
          boards(ids: $boardId) {
            items_page(limit: 100, cursor: $cursor) {
              cursor
              items {
                id
                name
                created_at
                updated_at
                group {
                  id
                  title
                }
                column_values {
                  id
                  text
                  value
                  column {
                    id
                    title
                    type
                  }
                }
              }
            }
          }
        }
      `
      : `
        query($boardId: [ID!]!) {
          boards(ids: $boardId) {
            items_page(limit: 100) {
              cursor
              items {
                id
                name
                created_at
                updated_at
                group {
                  id
                  title
                }
                column_values {
                  id
                  text
                  value
                  column {
                    id
                    title
                    type
                  }
                }
              }
            }
          }
        }
      `;

    const variables = cursor
      ? { boardId: [boardId], cursor }
      : { boardId: [boardId] };

    const itemsData = (await mondayQuery(config, itemsQuery, variables)) as {
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: BoardItem[];
        };
      }>;
    };

    const page = itemsData.boards[0]?.items_page;
    if (!page) break;

    allItems.push(...(page.items || []));
    cursor = page.cursor;
  } while (cursor);

  return {
    id: boardMeta.id,
    name: boardMeta.name,
    columns: boardMeta.columns,
    items: allItems,
  };
}

/**
 * Normalize raw Monday.com board data into a flat array of records
 */
export function normalizeBoard(board: Board): Record<string, string>[] {
  return board.items.map((item) => {
    const record: Record<string, string> = {
      _id: item.id,
      _name: item.name,
      _group: item.group?.title || "",
      _created_at: item.created_at || "",
      _updated_at: item.updated_at || "",
    };

    for (const cv of item.column_values) {
      const colTitle = cv.column?.title || cv.id;
      const key = colTitle.toLowerCase().replace(/[^a-z0-9]/g, "_");
      record[key] = cv.text || "";
    }

    return record;
  });
}

/**
 * Get board summary for AI context (column list + sample data)
 */
export function getBoardSummary(board: Board): string {
  const normalized = normalizeBoard(board);
  const columns = board.columns
    .map((c) => `${c.title} (${c.type})`)
    .join(", ");

  const sample = normalized.slice(0, 3);
  const sampleStr = sample
    .map((r) => JSON.stringify(r, null, 2))
    .join("\n");

  return `Board: "${board.name}"
Columns: ${columns}
Total items: ${normalized.length}
Sample records:
${sampleStr}`;
}
