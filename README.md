# Skylark BI Agent — Monday.com Business Intelligence

An AI-powered business intelligence agent that connects to Monday.com boards to answer founder-level business queries across Work Orders and Deals/Pipeline data.

## Live Demo

> Hosted at the platform preview URL. No local setup required.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App (App Router)            │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  BIAgentApp.tsx │    │   API Routes             │ │
│  │  (Client UI)    │◄──►│  /api/monday/boards      │ │
│  │                 │    │  /api/monday/data         │ │
│  │  - Config setup │    │  /api/chat               │ │
│  │  - Board select │    └──────────────────────────┘ │
│  │  - Chat UI      │              │                   │
│  └─────────────────┘              │                   │
│                                   ▼                   │
│  ┌────────────────────────────────────────────────┐  │
│  │              Business Logic Layer               │  │
│  │                                                 │  │
│  │  lib/monday.ts        — Monday.com GraphQL API  │  │
│  │  lib/dataAnalysis.ts  — Data normalization      │  │
│  │  lib/biAgent.ts       — AI agent + analytics    │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌──────────────────┐  ┌───────────────────────────┐ │
│  │  Monday.com API  │  │  OpenAI GPT-4o            │ │
│  │  (GraphQL v2)    │  │  (Query understanding +   │ │
│  │  Live board data │  │   Response generation)    │ │
│  └──────────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack, API routes, SSR, easy hosting |
| UI | React + Tailwind CSS | Fast development, no extra dependencies |
| AI | OpenAI GPT-4o | Best reasoning for BI analysis, follows instructions precisely |
| Monday.com | REST/GraphQL API v2 | Direct integration, no MCP dependency |
| Database | PostgreSQL + Drizzle ORM | Session persistence, caching capability |
| Markdown | `marked` | Render rich AI responses in chat UI |

## Features

### Core
- **Monday.com Integration** — Live GraphQL API queries with pagination (handles 100+ item boards)
- **Multi-board Analysis** — Simultaneously query Work Orders + Deals boards
- **AI Chat Interface** — Natural language → Business intelligence
- **Data Normalization** — Handles messy real-world data: dates, currencies, status labels
- **Leadership Updates** — One-click executive briefing generation

### Data Resilience
- Normalizes 15+ date formats (DD/MM/YYYY, ISO, Quarter format, etc.)
- Handles currency with Indian notation (₹, Lakhs, Crores, K)
- Normalizes status labels across inconsistent naming
- Sector/industry name standardization
- Smart column detection using fuzzy field matching
- Reports data completeness % with caveats

### Business Intelligence
- Pipeline health & stage analysis
- Win rate calculation
- Weighted pipeline value (probability × deal value)
- Sector/industry breakdown (cross-board)
- Budget vs. actual cost analysis
- Work order status distribution
- Risk flagging (delayed, blocked items)
- Follow-up query suggestions

## Monday.com Setup

### Prerequisites
1. Create two boards in Monday.com:
   - **Work Order Tracker** — Import from the CSV provided
   - **Deal Funnel** — Import from the CSV provided

2. Recommended column types for **Deal Funnel**:
   - Deal Name → Item Name (text)
   - Company/Client → Text
   - Stage → Status or Dropdown
   - Deal Value → Numbers
   - Probability → Numbers
   - Close Date → Date
   - Sector → Dropdown
   - Owner → Person

3. Recommended column types for **Work Order Tracker**:
   - Work Order Name → Item Name (text)
   - Client → Text
   - Status → Status
   - Budget → Numbers
   - Actual Cost → Numbers
   - Completion % → Numbers
   - Start Date → Date
   - End Date → Date
   - Sector → Dropdown
   - Project Manager → Person

### Getting Your API Key
1. Log into Monday.com
2. Go to Profile → Administration → API
3. Copy your **Personal API Token**

## Local Setup (Optional)

```bash
# 1. Clone the repo
git clone <repo-url>
cd skylark-bi-agent

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# 4. Push DB schema
npx drizzle-kit push

# 5. Run development server
npm run dev
```

### Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
# Optional — if set, used as defaults (users can override in the UI)
MONDAY_API_KEY=your_monday_api_key
OPENAI_API_KEY=your_openai_api_key
# Optional — point the OpenAI SDK at any OpenAI-compatible provider
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile
```

**Note:** API keys can be entered in the UI (Settings screen) and are stored in browser localStorage. They are sent to the app's own API routes to make requests but are never persisted on the server.

### Run it 100% free

| Need | Free option | What to set |
|------|-------------|-------------|
| Monday.com data | Monday.com **Free plan** (2 seats) | `MONDAY_API_KEY` (avatar → Developers → API Tokens) |
| AI model | **Groq** free tier (OpenAI-compatible) | `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_MODEL=llama-3.3-70b-versatile`, `OPENAI_API_KEY=gsk_...` |
| Database | **Neon** free Postgres | `DATABASE_URL=<neon connection string>` |

The same Base URL + Model fields are also available under **Advanced** on the Settings screen, so you can switch providers without touching `.env`.

## Usage

1. Open the app
2. Enter your Monday.com API key and OpenAI API key
3. Select the boards you want to analyze (auto-detects Work Orders vs Deals)
4. Start asking business questions!

### Example Queries
- "How's our pipeline looking for energy sector this quarter?"
- "Which projects are delayed or at risk?"
- "Generate a leadership update for this week"
- "What's our win rate and average deal size?"
- "Show me the top 5 deals by value closing this month"
- "How are we performing against budget across all work orders?"

---

## Decision Log

See `DECISION_LOG.md` for key assumptions, trade-offs, and design decisions.
