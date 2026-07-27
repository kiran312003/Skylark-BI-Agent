/**
 * Business Intelligence Agent
 * Processes natural language queries against Monday.com data
 * Uses OpenAI for query understanding and response generation
 */

import OpenAI from "openai";
import {
  normalizeAmount,
  normalizeDate,
  normalizeStatus,
  normalizeSector,
  normalizeDealStage,
  normalizeProbability,
  groupBy,
  sum,
  average,
  formatCurrency,
  formatNumber,
  formatDateLocal,
  findField,
} from "./dataAnalysis";
import { normalizeBoard, type Board } from "./monday";

export interface AgentConfig {
  openaiKey: string;
  model?: string;
  /** Optional OpenAI-compatible base URL (e.g. Groq, OpenRouter, Gemini). */
  baseURL?: string;
}

export interface BoardData {
  name: string;
  type: "work_orders" | "deals" | "unknown";
  columns: Array<{ id: string; title: string; type: string }>;
  records: Record<string, string>[];
}

export interface AgentResponse {
  message: string;
  dataUsed?: string[];
  dataQuality?: string;
  suggestedFollowUps?: string[];
}

// ─── Data extraction helpers ──────────────────────────────────────────────────

function extractDealsData(records: Record<string, string>[]) {
  return records.map((r) => {
    const dealValue = normalizeAmount(
      findField(
        r,
        ["masked deal value", "deal value", "deal_value", "value", "amount", "contract value", "deal size", "revenue"],
        ["billed", "collected", "receivable"]
      )
    );

    const probability = normalizeProbability(
      findField(r, ["closure probability", "probability", "prob", "win probability", "chance"])
    );

    const weightedValue =
      dealValue !== null && probability !== null
        ? dealValue * (probability / 100)
        : dealValue;

    const closeDate = normalizeDate(
      findField(r, ["close date", "tentative close date", "expected close", "closing date", "expected_close_date", "close_date", "target date"])
    );

    const sector = normalizeSector(
      findField(r, ["sector", "sector service", "industry", "vertical", "segment", "domain"])
    );

    // Funnel stage (e.g. "B. Sales Qualified Leads" -> "Sales Qualified Leads")
    const stage = normalizeDealStage(
      findField(r, ["deal stage", "stage", "pipeline stage", "phase"])
    );

    // Deal Status carries the win/loss signal (Won / Dead / Open / On Hold)
    const dealStatus = normalizeStatus(
      findField(r, ["deal status", "status", "state"])
    );

    const stageLower = stage.toLowerCase();
    const statusLower = dealStatus.toLowerCase();
    const isWon = statusLower.includes("won") || stageLower.includes("won");
    const isLost =
      statusLower.includes("lost") ||
      statusLower.includes("dead") ||
      stageLower.includes("lost");
    const outcome: "won" | "lost" | "active" = isWon ? "won" : isLost ? "lost" : "active";

    const company =
      findField(r, ["client code", "client", "company", "customer", "account", "client name", "organization"]) ||
      r["_name"] ||
      "Unknown";
    const owner = findField(r, ["owner code", "owner", "salesperson", "rep", "sales rep", "assigned to", "account executive", "ae"]);

    return {
      id: r["_id"],
      name: r["_name"] || company,
      company,
      stage,
      dealStatus,
      outcome,
      sector,
      dealValue,
      probability,
      weightedValue,
      closeDate,
      owner,
      raw: r,
    };
  });
}

function extractWorkOrdersData(records: Record<string, string>[]) {
  return records.map((r) => {
    const budget = normalizeAmount(
      findField(
        r,
        ["amount in rupees", "amount", "value", "budget", "contract value", "project value"],
        ["billed", "collected", "receivable"]
      )
    );

    const actualCost = normalizeAmount(
      findField(
        r,
        ["billed value in rupees", "billed value", "collected amount", "actual cost", "cost", "spent", "expenditure"],
        ["month"]
      )
    );

    const startDate = normalizeDate(
      findField(r, ["probable start date", "start date", "start_date", "commencement", "kick off", "kickoff"])
    );

    const endDate = normalizeDate(
      findField(r, ["probable end date", "end date", "end_date", "completion date", "deadline", "due date", "target completion"])
    );

    const status = normalizeStatus(
      findField(r, ["execution status", "status", "work order status", "state", "progress"], ["invoice", "billing", "collection", "wo"])
    );

    const sector = normalizeSector(
      findField(r, ["sector", "industry", "vertical", "segment", "domain", "client sector"])
    );

    const client =
      findField(
        r,
        ["customer name code", "customer name", "customer", "client name", "client", "company", "organization"],
        ["software", "platform", "deliverable", "skylark"]
      ) || r["_name"] || "Unknown";
    const pm = findField(r, ["bd kam personnel code", "bd kam personnel", "personnel code", "project manager", "pm", "manager", "owner", "assigned to", "responsible", "kam"]);
    const completion = normalizeAmount(findField(r, ["completion", "% complete", "progress %", "percent complete"]));
    const location = findField(r, ["location", "site", "city", "state", "region"]);

    return {
      id: r["_id"],
      name: r["_name"] || `Work Order ${r["_id"]}`,
      client,
      status,
      sector,
      budget,
      actualCost,
      startDate,
      endDate,
      pm,
      completion,
      location,
      raw: r,
    };
  });
}

// ─── Statistical analysis functions ──────────────────────────────────────────

function analyzePipeline(deals: ReturnType<typeof extractDealsData>) {
  const byStage = groupBy(deals, (d) => d.stage);
  const stages = Object.entries(byStage).map(([stage, items]) => {
    const totalValue = sum(items.map((i) => i.dealValue || 0));
    const weightedValue = sum(items.map((i) => i.weightedValue || 0));
    return { stage, count: items.length, totalValue, weightedValue };
  });

  const totalPipelineValue = sum(deals.map((d) => d.dealValue || 0));
  const totalWeighted = sum(deals.map((d) => d.weightedValue || 0));
  const wonDeals = deals.filter((d) => d.outcome === "won");
  const lostDeals = deals.filter((d) => d.outcome === "lost");
  const activeDeals = deals.filter((d) => d.outcome === "active");

  const avgDealSize = deals.filter((d) => d.dealValue).length > 0
    ? average(deals.filter((d) => d.dealValue !== null).map((d) => d.dealValue!))
    : 0;

  const bySector = groupBy(deals, (d) => d.sector);
  const sectorBreakdown = Object.entries(bySector).map(([sector, items]) => ({
    sector,
    count: items.length,
    value: sum(items.map((i) => i.dealValue || 0)),
  }));

  return {
    totalDeals: deals.length,
    stages,
    totalPipelineValue,
    totalWeighted,
    wonDeals: {
      count: wonDeals.length,
      value: sum(wonDeals.map((d) => d.dealValue || 0)),
    },
    lostDeals: {
      count: lostDeals.length,
      value: sum(lostDeals.map((d) => d.dealValue || 0)),
    },
    activeDeals: activeDeals.length,
    avgDealSize,
    sectorBreakdown,
    winRate:
      wonDeals.length + lostDeals.length > 0
        ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
        : null,
  };
}

function analyzeWorkOrders(workOrders: ReturnType<typeof extractWorkOrdersData>) {
  const byStatus = groupBy(workOrders, (w) => w.status);
  const statusBreakdown = Object.entries(byStatus).map(([status, items]) => ({
    status,
    count: items.length,
    budget: sum(items.map((i) => i.budget || 0)),
  }));

  const bySector = groupBy(workOrders, (w) => w.sector);
  const sectorBreakdown = Object.entries(bySector).map(([sector, items]) => ({
    sector,
    count: items.length,
    budget: sum(items.map((i) => i.budget || 0)),
  }));

  const totalBudget = sum(workOrders.map((w) => w.budget || 0));
  const totalActual = sum(workOrders.map((w) => w.actualCost || 0));

  const completed = workOrders.filter((w) =>
    w.status.toLowerCase().includes("complet") || w.status.toLowerCase() === "done"
  );
  const inProgress = workOrders.filter((w) =>
    w.status.toLowerCase().includes("progress") || w.status.toLowerCase() === "active"
  );
  const delayed = workOrders.filter((w) =>
    w.status.toLowerCase().includes("delay") || w.status.toLowerCase().includes("overdue")
  );

  const avgCompletion = workOrders.filter((w) => w.completion !== null).length > 0
    ? average(workOrders.filter((w) => w.completion !== null).map((w) => w.completion!))
    : null;

  return {
    totalWorkOrders: workOrders.length,
    statusBreakdown,
    sectorBreakdown,
    totalBudget,
    totalActual,
    budgetUtilization: totalBudget > 0 ? (totalActual / totalBudget) * 100 : null,
    completed: completed.length,
    inProgress: inProgress.length,
    delayed: delayed.length,
    avgCompletion,
    onTimeRate:
      completed.length > 0
        ? ((completed.length - delayed.length) / completed.length) * 100
        : null,
  };
}

// ─── Build data context for AI ─────────────────────────────────────────────────

function buildDataContext(boards: BoardData[]): string {
  const sections: string[] = [];

  for (const board of boards) {
    const records = board.records;
    const colNames = board.columns.map((c) => c.title);

    if (board.type === "deals") {
      const deals = extractDealsData(records);
      const analysis = analyzePipeline(deals);

      sections.push(`## DEALS BOARD: "${board.name}"
Total Records: ${records.length} deals
Columns: ${colNames.join(", ")}

### Pipeline Summary:
- Total Pipeline Value: ${formatCurrency(analysis.totalPipelineValue)} across ${analysis.totalDeals} deals
- Weighted Pipeline: ${formatCurrency(analysis.totalWeighted)}
- Active Deals: ${analysis.activeDeals}
- Won: ${analysis.wonDeals.count} deals worth ${formatCurrency(analysis.wonDeals.value)}
- Lost: ${analysis.lostDeals.count} deals worth ${formatCurrency(analysis.lostDeals.value)}
- Win Rate: ${analysis.winRate !== null ? analysis.winRate.toFixed(1) + "%" : "N/A"}
- Average Deal Size: ${formatCurrency(analysis.avgDealSize)}

### By Stage:
${analysis.stages.map((s) => `  - ${s.stage}: ${s.count} deals, ${formatCurrency(s.totalValue)}`).join("\n")}

### By Sector:
${analysis.sectorBreakdown.map((s) => `  - ${s.sector}: ${s.count} deals, ${formatCurrency(s.value)}`).join("\n")}

### Raw Deal Records (ALL ${deals.length} deals):
${JSON.stringify(
  deals.map((d) => ({
    name: d.name,
    company: d.company,
    stage: d.stage,
    status: d.dealStatus,
    outcome: d.outcome,
    sector: d.sector,
    value: d.dealValue !== null ? formatCurrency(d.dealValue) : "N/A",
    weighted: d.weightedValue !== null ? formatCurrency(d.weightedValue) : "N/A",
    probability: d.probability !== null ? d.probability + "%" : "N/A",
    closeDate: d.closeDate ? formatDateLocal(d.closeDate) : "N/A",
    owner: d.owner || "Unassigned",
  })),
  null,
  2
)}`);
    }

    if (board.type === "work_orders") {
      const workOrders = extractWorkOrdersData(records);
      const analysis = analyzeWorkOrders(workOrders);

      sections.push(`## WORK ORDERS BOARD: "${board.name}"
Total Records: ${records.length} work orders
Columns: ${colNames.join(", ")}

### Work Orders Summary:
- Total Work Orders: ${analysis.totalWorkOrders}
- Total Budget: ${formatCurrency(analysis.totalBudget)}
- Total Actual Cost: ${formatCurrency(analysis.totalActual)}
- Budget Utilization: ${analysis.budgetUtilization !== null ? analysis.budgetUtilization.toFixed(1) + "%" : "N/A"}
- Completed: ${analysis.completed}
- In Progress: ${analysis.inProgress}
- Delayed/Overdue: ${analysis.delayed}
- Avg Completion: ${analysis.avgCompletion !== null ? analysis.avgCompletion.toFixed(1) + "%" : "N/A"}

### By Status:
${analysis.statusBreakdown.map((s) => `  - ${s.status}: ${s.count} orders, ${formatCurrency(s.budget)} budget`).join("\n")}

### By Sector:
${analysis.sectorBreakdown.map((s) => `  - ${s.sector}: ${s.count} orders, ${formatCurrency(s.budget)} budget`).join("\n")}

### Raw Work Order Records (ALL ${workOrders.length} orders):
${JSON.stringify(
  workOrders.map((w) => ({
    name: w.name,
    client: w.client,
    status: w.status,
    sector: w.sector,
    budget: w.budget !== null ? formatCurrency(w.budget) : "N/A",
    actualCost: w.actualCost !== null ? formatCurrency(w.actualCost) : "N/A",
    completion: w.completion !== null ? w.completion + "%" : "N/A",
    startDate: w.startDate ? formatDateLocal(w.startDate) : "N/A",
    endDate: w.endDate ? formatDateLocal(w.endDate) : "N/A",
    pm: w.pm || "Unassigned",
    location: w.location || "N/A",
  })),
  null,
  2
)}`);
    }

    if (board.type === "unknown") {
      sections.push(`## BOARD: "${board.name}"
Total Records: ${records.length}
Columns: ${colNames.join(", ")}
Sample Data:
${JSON.stringify(records.slice(0, 10), null, 2)}`);
    }
  }

  return sections.join("\n\n---\n\n");
}

// ─── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(dataContext: string, dataQualityNotes: string): string {
  const today = formatDateLocal(new Date());

  return `You are Skylark BI Agent — an expert Business Intelligence analyst for Skylark Drones, a drone services company. You have access to live data from Monday.com boards.

Today's date: ${today}

## Your Role:
- Answer founder/executive level business questions with confidence and precision
- Provide actionable insights, not just raw numbers
- Flag data quality issues transparently
- Cross-reference data across multiple boards when relevant
- Use Indian business context (₹ for currency, crores/lakhs notation)

## Data Quality Notes:
${dataQualityNotes}

## Live Business Data:
${dataContext}

## Response Guidelines:
1. **Always lead with the key answer** — don't make executives search for it
2. **Use structured formatting** with headers, bullet points, and tables for readability
3. **Provide context** — compare against benchmarks, flag trends, highlight risks
4. **Be honest about data gaps** — mention if data is missing or inconsistent
5. **End with actionable recommendations** when appropriate
6. **For leadership updates**: structure responses as executive-ready briefs with clear sections
7. **Cross-board analysis**: When answering operational questions, check both boards for complete picture
8. **Data caveats**: If normalizing messy data, briefly explain what you did

## Formatting:
- Use Markdown for rich formatting
- Use 📊 for data/metrics, ⚠️ for risks/issues, ✅ for positive signals, 🎯 for targets
- For tables, use proper Markdown table syntax
- For currency, use Indian notation (₹ X Cr, ₹ X L)

## What you should NOT do:
- Do NOT refuse to answer due to data quality — provide best-effort analysis with caveats
- Do NOT provide generic advice — use actual numbers from the data
- Do NOT ask for clarification on simple queries — make reasonable assumptions
- Do NOT repeat data verbatim — synthesize and interpret

Always be the smartest person in the room who happens to have all the data.`;
}

// ─── Main agent function ───────────────────────────────────────────────────────

export async function processQuery(
  config: AgentConfig,
  boards: BoardData[],
  conversationHistory: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string
): Promise<AgentResponse> {
  const client = new OpenAI({
    apiKey: config.openaiKey,
    baseURL: config.baseURL || undefined,
  });

  // Build data context
  const dataContext = buildDataContext(boards);

  // Build data quality notes
  const qualityNotes: string[] = [];
  for (const board of boards) {
    const emptyFields = board.records.flatMap((r) =>
      Object.entries(r).filter(([, v]) => !v || v === "n/a").map(([k]) => k)
    );
    const emptyCount = emptyFields.length;
    const totalFields = board.records.length * Object.keys(board.records[0] || {}).length;
    const completeness = totalFields > 0 ? Math.round(((totalFields - emptyCount) / totalFields) * 100) : 100;
    qualityNotes.push(`- "${board.name}": ${completeness}% data completeness, ${board.records.length} records`);
  }

  const systemPrompt = buildSystemPrompt(dataContext, qualityNotes.join("\n"));

  // Build messages for OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Run the answer + follow-up-suggestion calls in PARALLEL.
  // This roughly halves latency, which keeps the serverless function well
  // under Netlify/Vercel free-tier timeouts despite the large data context.
  const [completion, suggestionsCompletion] = await Promise.all([
    client.chat.completions.create({
      model: config.model || "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
    client.chat.completions.create({
      model: config.model || "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Based on the conversation, suggest 3 relevant follow-up business questions a founder might ask. Return ONLY a JSON array of strings, no other text. Example: ["Question 1?", "Question 2?", "Question 3?"]`,
        },
        { role: "user", content: `Last question: "${userMessage}"\nContext: ${boards.map((b) => b.name).join(", ")} data available` },
      ],
      temperature: 0.5,
      max_tokens: 200,
    }),
  ]);

  const responseText = completion.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

  let suggestedFollowUps: string[] = [];
  try {
    const suggestionsText = suggestionsCompletion.choices[0]?.message?.content || "[]";
    suggestedFollowUps = JSON.parse(suggestionsText);
  } catch {
    suggestedFollowUps = [
      "Show me the top performing deals this quarter",
      "Which sectors have the highest pipeline value?",
      "What's the overall project delivery rate?",
    ];
  }

  return {
    message: responseText,
    dataUsed: boards.map((b) => b.name),
    dataQuality: qualityNotes.join("; "),
    suggestedFollowUps,
  };
}

// ─── Leadership update generator ──────────────────────────────────────────────

export async function generateLeadershipUpdate(
  config: AgentConfig,
  boards: BoardData[]
): Promise<string> {
  const client = new OpenAI({
    apiKey: config.openaiKey,
    baseURL: config.baseURL || undefined,
  });
  const dataContext = buildDataContext(boards);
  const today = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const prompt = `Generate a comprehensive leadership update/business review for Skylark Drones based on the data provided. 
Today: ${today}

Format it as a professional executive briefing document with these sections:
1. **Executive Summary** (3-4 key highlights)
2. **Sales Pipeline Health** (from deals data)
3. **Operational Performance** (from work orders data)
4. **Sector Analysis** (cross-board view)
5. **Key Risks & Flags** (items needing attention)
6. **Recommended Actions** (top 3-5 priorities)

Use ₹ Indian currency notation. Make it crisp, data-driven, and executive-ready.

DATA:
${dataContext}`;

  const completion = await client.chat.completions.create({
    model: config.model || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a senior business analyst preparing a leadership briefing document. Be precise, use data, and make it executive-ready.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 3000,
  });

  return completion.choices[0]?.message?.content || "Unable to generate leadership update.";
}

// ─── Board normalization wrapper ──────────────────────────────────────────────

export function prepareBoardData(board: Board, type: "work_orders" | "deals" | "unknown"): BoardData {
  return {
    name: board.name,
    type,
    columns: board.columns,
    records: normalizeBoard(board),
  };
}
