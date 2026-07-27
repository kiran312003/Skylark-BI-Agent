# Decision Log — Skylark BI Agent

## 1. Key Assumptions

### Monday.com Data Structure
- **Assumption**: The CSV data represents typical real-world drone services company data with inconsistent formatting
- **Assumption**: Boards may have different column names across instances (e.g., "Deal Value" vs "Contract Value" vs "Amount")
- **Approach**: Built a fuzzy field matcher that tries multiple candidate column names before falling back gracefully

### Query Interpretation
- **Assumption**: "Founder-level questions" means concise, insight-first responses rather than raw data dumps
- **Assumption**: Indian business context is relevant (₹ currency, Crore/Lakh notation)
- **Assumption**: When users ask about "this quarter," the agent uses current date to calculate relevance

### Data Quality
- **Assumption**: Real data will have: missing fields, inconsistent date formats, varied status naming, mixed currency formats
- **Approach**: Built comprehensive normalization layer that handles 15+ date formats, currency symbols, status aliases, and sector name variants

---

## 2. Trade-offs

### API Integration: Direct API vs MCP
- **Choice**: Direct Monday.com GraphQL API
- **Reason**: MCP (Model Context Protocol) adds infrastructure complexity and isn't necessary for a 6-hour assignment. Direct API gives full control over pagination, error handling, and data normalization. MCP would be the better long-term choice for a production system where the AI itself issues queries.

### AI Model: GPT-4o vs Smaller Models
- **Choice**: GPT-4o with full data context in system prompt
- **Reason**: For BI analysis, accuracy > cost. GPT-4o handles large context windows well and follows structured output instructions reliably. A smaller model (GPT-3.5 or Claude Haiku) might hallucinate numbers or miss nuance in founder-level queries.
- **Trade-off**: Higher per-query cost (~$0.05-0.15 per query vs ~$0.01 for smaller models)

### Data Strategy: Full Context vs RAG
- **Choice**: Full board data in system prompt (up to ~500 records per board)
- **Reason**: For the board sizes in this assignment (~50-200 rows), fitting everything in context is simpler, more accurate, and eliminates embedding/retrieval complexity.
- **Trade-off**: Doesn't scale to 10,000+ row boards. With more time, I'd add a RAG layer with vector embeddings for large datasets.

### API Key Storage: Browser localStorage vs Server-side
- **Choice**: Browser localStorage for API keys
- **Reason**: Keeps the app stateless from a security standpoint — keys never hit the server's disk. Users own their credentials.
- **Trade-off**: Keys lost if browser storage cleared. For production: encrypted server-side storage with user accounts.

### Data Normalization: Pre-processing vs Real-time
- **Choice**: Normalize data when loaded from Monday.com, before sending to AI
- **Reason**: Pre-normalization reduces token usage and improves AI response consistency. The AI receives clean, structured data rather than raw messy strings.

---

## 3. What I'd Do Differently With More Time

1. **RAG/Vector Search** — For large boards (1000+ items), implement semantic search using embeddings so only relevant records are included in AI context

2. **Streaming Responses** — Use OpenAI streaming API for real-time token streaming in the chat UI (better UX for long responses)

3. **Caching Layer** — Cache Monday.com board data with TTL (time-to-live) in PostgreSQL. Currently data is re-fetched every page load.

4. **Automated Insights** — Proactively surface anomalies (e.g., "3 deals have passed their close date without update") without requiring user queries

5. **Chart Visualizations** — Render actual charts (Recharts/D3) for pipeline distributions, sector breakdowns, trend lines

6. **Multi-turn Context Management** — Smarter conversation memory with summarization for long sessions

7. **Monday.com Webhooks** — Real-time data updates when board items change

8. **Export Functionality** — One-click export of AI-generated leadership updates to PDF/DOCX

---

## 4. How I Interpreted "Leadership Updates"

**My Interpretation**: A leadership update is a structured, executive-ready briefing document that:
- Opens with an "Executive Summary" (3-4 key highlights, no fluff)
- Covers Sales Pipeline Health (with actual numbers, stage breakdown)
- Covers Operational Performance (work order status, budget utilization)
- Provides cross-board Sector Analysis (same sector performance in both deals and execution)
- Flags Key Risks (items needing immediate attention)
- Closes with Recommended Actions (prioritized, specific, actionable)

**Implementation**: 
- Added a `generateLeadershipUpdate()` function that uses a specialized system prompt focused on executive briefing format
- Triggered automatically when user says "leadership update," "executive briefing," or "board update"
- Available as a one-click "Leadership Update" button in the sidebar
- Uses 0.2 temperature (vs 0.3 for chat) to ensure consistent, professional tone

**Format Philosophy**: Skylark Drones is a drone services company. Leadership wants to know: How's revenue looking? Which sectors are growing? Are projects on track? What needs their attention? The update answers these without requiring them to dig through data themselves.
