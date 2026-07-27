/**
 * Business Intelligence Data Analysis Engine
 * Provides statistical analysis, data cleaning, and insight generation
 */

export interface DataQualityReport {
  totalRecords: number;
  missingFields: Record<string, number>;
  dataTypes: Record<string, string>;
  anomalies: string[];
  completenessScore: number;
}

export interface AnalysisResult {
  summary: string;
  metrics: Record<string, number | string>;
  insights: string[];
  dataQuality: DataQualityReport;
  rawData?: Record<string, string>[];
}

// ─── Normalization helpers ───────────────────────────────────────────────────

export function normalizeAmount(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === "" || raw.toLowerCase() === "n/a" || raw === "-") {
    return null;
  }
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // Detect unit multipliers (Indian notation + common suffixes).
  // Checked on the raw string so decimals like "1.5 Cr" scale correctly.
  let multiplier = 1;
  if (lower.includes("cr") || lower.includes("crore")) multiplier = 10_000_000;
  else if (lower.includes("lakh")) multiplier = 100_000;
  else if (/[0-9]\s*k\b/.test(lower) || /\bk\b/.test(lower)) multiplier = 1_000;
  else if (/[0-9]\s*l\b/.test(lower)) multiplier = 100_000;
  else if (/[0-9]\s*m\b/.test(lower)) multiplier = 1_000_000;

  // Strip everything except digits, dot and minus, then parse.
  const cleaned = trimmed.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;

  return n * multiplier;
}

export function normalizeDate(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === "" || raw.toLowerCase() === "n/a" || raw === "-") {
    return null;
  }
  const trimmed = raw.trim();

  // Quarter format: "Q1 2024", "Q2 FY24"
  const quarterMatch = trimmed.match(/^Q([1-4])\s*(?:FY)?(\d{2,4})$/i);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    let year = parseInt(quarterMatch[2]);
    if (year < 100) year += 2000;
    return new Date(year, (q - 1) * 3, 1); // Q1 = Jan, Q2 = Apr, ...
  }

  // ISO: YYYY-MM-DD (optionally with time)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const date = new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
    if (!isNaN(date.getTime())) return date;
  }

  // DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY — international order preferred.
  // Falls back to MM/DD/YYYY only when the DD/MM interpretation is invalid.
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1]);
    const month = parseInt(dmy[2]);
    const year = parseInt(dmy[3]);
    const asDmy = new Date(year, month - 1, day);
    if (!isNaN(asDmy.getTime()) && asDmy.getMonth() === month - 1) {
      return asDmy;
    }
    const asMdy = new Date(year, day - 1, month);
    if (!isNaN(asMdy.getTime())) return asMdy;
    return null;
  }

  // Named-month formats ("January 5, 2024", "5 Jan 2024") and timestamps.
  const fallback = new Date(trimmed);
  if (
    !isNaN(fallback.getTime()) &&
    fallback.getFullYear() > 2000 &&
    fallback.getFullYear() < 2100
  ) {
    return fallback;
  }

  return null;
}

export function normalizeStatus(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "Unknown";
  const s = raw.trim().toLowerCase();

  const statusMap: Record<string, string> = {
    // Deal stages
    "prospect": "Prospect",
    "lead": "Lead",
    "qualified": "Qualified",
    "proposal": "Proposal",
    "negotiation": "Negotiation",
    "won": "Won",
    "closed won": "Won",
    "closed-won": "Won",
    "lost": "Lost",
    "closed lost": "Lost",
    "closed-lost": "Lost",
    "on hold": "On Hold",
    "on-hold": "On Hold",
    "active": "Active",
    "inactive": "Inactive",
    "pending": "Pending",
    // Work order statuses
    "in progress": "In Progress",
    "in-progress": "In Progress",
    "completed": "Completed",
    "done": "Completed",
    "not started": "Not Started",
    "not-started": "Not Started",
    "delayed": "Delayed",
    "cancelled": "Cancelled",
    "canceled": "Cancelled",
    "blocked": "Blocked",
    "review": "Under Review",
    "under review": "Under Review",
    // Real-world Skylark deal & work-order statuses
    "dead": "Lost",
    "open": "Open",
    "ongoing": "In Progress",
    "executed until current month": "In Progress",
    "pause / struck": "On Hold",
    "pause": "On Hold",
    "struck": "Blocked",
    "partial completed": "Completed",
    "partially completed": "Completed",
    "details pending from client": "Pending",
    "fully billed": "Completed",
    "partially billed": "In Progress",
    "not billed yet": "Not Started",
    "closed": "Completed",
    "project completed": "Completed",
    "project won": "Won",
    "project lost": "Lost",
    "work order received": "Work Order Received",
    "not relevant": "Not Relevant",
  };

  return statusMap[s] || raw.trim();
}

export function normalizeSector(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "Unknown";
  const s = raw.trim().toLowerCase();

  const sectorMap: Record<string, string> = {
    "energy": "Energy",
    "oil & gas": "Oil & Gas",
    "oil and gas": "Oil & Gas",
    "solar": "Solar",
    "renewable": "Renewable Energy",
    "renewables": "Renewable Energy",
    "wind": "Wind Energy",
    "manufacturing": "Manufacturing",
    "telecom": "Telecommunications",
    "telecommunications": "Telecommunications",
    "infra": "Infrastructure",
    "infrastructure": "Infrastructure",
    "logistics": "Logistics",
    "construction": "Construction",
    "mining": "Mining",
    "agriculture": "Agriculture",
    "agri": "Agriculture",
    "healthcare": "Healthcare",
    "health": "Healthcare",
    "finance": "Finance",
    "fintech": "FinTech",
    "government": "Government",
    "govt": "Government",
    "defense": "Defense",
    "defence": "Defense",
    "aviation": "Aviation",
    "marine": "Marine",
    "retail": "Retail",
    "fmcg": "FMCG",
    // Real-world Skylark sectors
    "powerline": "Powerline",
    "railways": "Railways",
    "railway": "Railways",
    "dsp": "DSP",
    "tender": "Tender",
    "others": "Others",
    "other": "Others",
    "security and surveillance": "Security & Surveillance",
    "security": "Security & Surveillance",
    "surveillance": "Security & Surveillance",
  };

  return sectorMap[s] || raw.trim();
}

/**
 * Normalize a deal funnel stage. Strips leading list prefixes like "A. ",
 * "B. " and maps the descriptive part to a clean stage name. Stages such as
 * "G. Project Won" / "L. Project Lost" collapse to Won / Lost.
 */
export function normalizeDealStage(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "Unknown";
  const cleaned = raw.trim().replace(/^[a-z]\.\s*/i, "").toLowerCase();

  const stageMap: Record<string, string> = {
    "lead generated": "Lead Generated",
    "sales qualified leads": "Sales Qualified Leads",
    "demo done": "Demo Done",
    "feasibility": "Feasibility",
    "proposal/commercials sent": "Proposal Sent",
    "proposal sent": "Proposal Sent",
    "negotiations": "Negotiation",
    "negotiation": "Negotiation",
    "project won": "Won",
    "work order received": "Work Order Received",
    "poc": "POC",
    "invoice sent": "Invoice Sent",
    "amount accrued": "Amount Accrued",
    "project lost": "Lost",
    "projects on hold": "On Hold",
    "project completed": "Completed",
    "not relevant at the moment": "Not Relevant",
    "not relevant at all": "Not Relevant",
    "not relevant": "Not Relevant",
  };

  return stageMap[cleaned] || raw.trim();
}

/**
 * Normalize a win probability to a 0-100 number. Accepts numeric percentages
 * as well as textual labels (High / Medium / Low).
 */
export function normalizeProbability(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === "") return null;

  const numeric = normalizeAmount(raw);
  if (numeric !== null && numeric >= 0 && numeric <= 100) return numeric;

  const map: Record<string, number> = {
    "very high": 90,
    "high": 75,
    "medium": 50,
    "med": 50,
    "moderate": 50,
    "low": 25,
    "very low": 10,
    "certain": 100,
    "sure": 100,
    "won": 100,
    "lost": 0,
  };

  return map[raw.trim().toLowerCase()] ?? null;
}

// ─── Data quality analysis ───────────────────────────────────────────────────

export function analyzeDataQuality(
  records: Record<string, string>[],
  fieldNames: string[]
): DataQualityReport {
  const missing: Record<string, number> = {};
  const anomalies: string[] = [];

  for (const field of fieldNames) {
    missing[field] = records.filter(
      (r) => !r[field] || r[field].trim() === "" || r[field].toLowerCase() === "n/a"
    ).length;
  }

  // Detect anomalies
  const missingHigh = Object.entries(missing).filter(
    ([, count]) => count > records.length * 0.5
  );
  if (missingHigh.length > 0) {
    anomalies.push(
      `High missing data (>50%) in fields: ${missingHigh.map(([f]) => f).join(", ")}`
    );
  }

  // Completeness score
  const totalCells = records.length * fieldNames.length;
  const missingCells = Object.values(missing).reduce((a, b) => a + b, 0);
  const completenessScore =
    totalCells > 0
      ? Math.round(((totalCells - missingCells) / totalCells) * 100)
      : 0;

  return {
    totalRecords: records.length,
    missingFields: missing,
    dataTypes: {},
    anomalies,
    completenessScore,
  };
}

// ─── Metric computations ─────────────────────────────────────────────────────

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function average(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}

export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

export function formatCurrency(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  } else if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  } else if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount.toFixed(0)}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

/**
 * Format a Date as YYYY-MM-DD using LOCAL time.
 * Avoids the off-by-one-day shift that `toISOString()` causes for timezones
 * ahead of UTC (e.g. IST = UTC+5:30).
 */
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Board type detection ─────────────────────────────────────────────────────

export function detectBoardType(
  boardName: string,
  columns: string[]
): "work_orders" | "deals" | "unknown" {
  const nameLower = boardName.toLowerCase();
  const colsLower = columns.map((c) => c.toLowerCase());

  if (
    nameLower.includes("work order") ||
    nameLower.includes("workorder") ||
    colsLower.some((c) => c.includes("work order") || c.includes("service"))
  ) {
    return "work_orders";
  }

  if (
    nameLower.includes("deal") ||
    nameLower.includes("pipeline") ||
    nameLower.includes("funnel") ||
    colsLower.some((c) => c.includes("deal") || c.includes("pipeline") || c.includes("stage"))
  ) {
    return "deals";
  }

  return "unknown";
}

// ─── Smart field finder ───────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Smart field finder using token-overlap scoring.
 * Tries each candidate in order and returns the best-matching record value
 * whose score clears a confidence threshold. `excludeWords` prevents matching
 * unrelated columns that merely contain a candidate substring (e.g. avoiding a
 * "...client deliverables..." column when looking for the client name).
 */
export function findField(
  record: Record<string, string>,
  candidates: string[],
  excludeWords: string[] = []
): string {
  const entries = Object.keys(record).map((key) => ({ key, tokens: tokenize(key) }));

  for (const candidate of candidates) {
    const candTokens = tokenize(candidate);
    if (candTokens.length === 0) continue;
    const candNorm = candTokens.join(" ");

    let bestKey: string | null = null;
    let bestScore = 0;

    for (const { key, tokens } of entries) {
      if (tokens.length === 0) continue;
      if (excludeWords.some((w) => tokens.includes(w))) continue;

      const keyNorm = tokens.join(" ");
      // Exact token match — return immediately
      if (keyNorm === candNorm) return record[key] || "";

      const overlap = candTokens.filter((t) => tokens.includes(t)).length;
      if (overlap === 0) continue;

      let score = (overlap / candTokens.length) * 100; // candidate coverage
      score -= Math.max(0, tokens.length - overlap) * 3; // penalize extra key tokens
      if (keyNorm.includes(candNorm)) score += 40; // contiguous phrase bonus

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (bestKey && bestScore >= 50) return record[bestKey] || "";
  }

  return "";
}
