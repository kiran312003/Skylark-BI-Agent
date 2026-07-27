"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";
import type { BoardData } from "@/lib/biAgent";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface BoardInfo {
  id: string;
  name: string;
  type: "work_orders" | "deals" | "unknown";
}

const SUGGESTED_QUERIES = [
  "How's our pipeline looking this quarter?",
  "Which sector has the highest deal value?",
  "Show me at-risk projects and delayed work orders",
  "What's our win rate and average deal size?",
  "Generate a leadership update for this week",
  "Which deals are closing this month?",
  "How are we performing against budget across all work orders?",
  "Who are our top clients by revenue?",
];

const BOARD_TYPE_LABELS: Record<string, string> = {
  work_orders: "Work Orders",
  deals: "Deals / Pipeline",
  unknown: "General",
};

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content, { async: false }) as string;
  } catch {
    return content;
  }
}

export function BIAgentApp() {
  // Config state (lazy-init from localStorage so we never setState inside an effect)
  const [mondayKey, setMondayKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("skylark_monday_key") || "" : ""
  );
  const [openaiKey, setOpenaiKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("skylark_openai_key") || "" : ""
  );
  const [baseUrl, setBaseUrl] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("skylark_base_url") || "" : ""
  );
  const [model, setModel] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("skylark_model") || "" : ""
  );
  const [isConfigured, setIsConfigured] = useState(() =>
    typeof window !== "undefined"
      ? !!(localStorage.getItem("skylark_monday_key") && localStorage.getItem("skylark_openai_key"))
      : false
  );
  const [showConfig, setShowConfig] = useState(() =>
    typeof window !== "undefined"
      ? !(localStorage.getItem("skylark_monday_key") && localStorage.getItem("skylark_openai_key"))
      : true
  );

  // Board state
  const [availableBoards, setAvailableBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBoards, setSelectedBoards] = useState<BoardInfo[]>([]);
  const [boardsData, setBoardsData] = useState<BoardData[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSaveConfig = async () => {
    if (!mondayKey.trim() || !openaiKey.trim()) {
      alert("Please provide both API keys");
      return;
    }
    localStorage.setItem("skylark_monday_key", mondayKey.trim());
    localStorage.setItem("skylark_openai_key", openaiKey.trim());
    localStorage.setItem("skylark_base_url", baseUrl.trim());
    localStorage.setItem("skylark_model", model.trim());
    setIsConfigured(true);
    setShowConfig(false);

    // Fetch boards
    await fetchBoards(mondayKey.trim());
  };

  const fetchBoards = async (key: string) => {
    setLoadingBoards(true);
    setBoardError("");
    try {
      const res = await fetch("/api/monday/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json() as { boards?: Array<{ id: string; name: string }>; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to fetch boards");
      setAvailableBoards(data.boards || []);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Failed to connect to Monday.com");
    } finally {
      setLoadingBoards(false);
    }
  };

  // Auto-fetch boards on mount when already configured (e.g. after a refresh).
  // fetchBoards updates state asynchronously, which is safe inside an effect.
  useEffect(() => {
    if (isConfigured && mondayKey) {
      void fetchBoards(mondayKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBoardSelect = (boardId: string, checked: boolean) => {
    if (checked) {
      const board = availableBoards.find((b) => b.id === boardId);
      if (board) {
        setSelectedBoards((prev) => [
          ...prev,
          { id: boardId, name: board.name, type: "unknown" },
        ]);
      }
    } else {
      setSelectedBoards((prev) => prev.filter((b) => b.id !== boardId));
    }
  };

  const handleBoardTypeChange = (boardId: string, type: "work_orders" | "deals" | "unknown") => {
    setSelectedBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, type } : b))
    );
  };

  const handleLoadData = async () => {
    if (selectedBoards.length === 0) {
      alert("Please select at least one board");
      return;
    }
    setLoadingData(true);
    setBoardError("");
    try {
      const boardTypes = Object.fromEntries(
        selectedBoards.map((b) => [b.id, b.type])
      );
      const res = await fetch("/api/monday/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: mondayKey,
          boardIds: selectedBoards.map((b) => b.id),
          boardTypes,
        }),
      });
      const data = await res.json() as { boards?: BoardData[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load board data");

      setBoardsData(data.boards || []);
      setDataLoaded(true);

      // Welcome message
      const totalRecords = (data.boards || []).reduce((acc: number, b: BoardData) => acc + b.records.length, 0);
      const boardNames = (data.boards || []).map((b: BoardData) => `"${b.name}"`).join(", ");

      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `# 🚁 Skylark BI Agent Ready

I've successfully loaded **${totalRecords} records** from ${boardNames}.

**I can help you with:**
- 📊 Pipeline health & deal analysis
- 🏗️ Work order operational metrics  
- 🎯 Sector performance breakdown
- ⚠️ Risk flags & at-risk items
- 📋 Leadership update generation
- 🔍 Any business question across your data

**Try asking me:** "How's our pipeline looking?" or click a suggestion below.`,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      const loadingMsg: Message = {
        id: `loading-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInputValue("");
      setIsThinking(true);
      setChatError("");

      try {
        const history = messages
          .filter((m) => !m.isLoading)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const isLeadershipUpdate =
          text.toLowerCase().includes("leadership update") ||
          text.toLowerCase().includes("executive briefing") ||
          text.toLowerCase().includes("board update");

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            boards: boardsData,
            history,
            openaiKey,
            baseURL: baseUrl || undefined,
            model: model || undefined,
            action: isLeadershipUpdate ? "leadership_update" : undefined,
          }),
        });

        const data = await res.json() as {
          message?: string;
          error?: string;
          suggestedFollowUps?: string[];
          dataUsed?: string[];
        };

        if (!res.ok) throw new Error(data.error || "Failed to get response");

        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message || "No response generated.",
          timestamp: new Date(),
        };

        setMessages((prev) => [
          ...prev.filter((m) => !m.isLoading),
          assistantMsg,
        ]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to get response";
        setChatError(errorMsg);
        setMessages((prev) => prev.filter((m) => !m.isLoading));
      } finally {
        setIsThinking(false);
      }
    },
    [messages, boardsData, openaiKey, baseUrl, model, isThinking]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // ─── Config Modal ─────────────────────────────────────────────────────────

  if (showConfig) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-2xl">
                🚁
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Skylark BI Agent</h1>
                <p className="text-slate-400 text-sm">Monday.com Intelligence Platform</p>
              </div>
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-2">Connect Your Data</h2>
            <p className="text-slate-400 text-sm mb-6">
              Enter your API keys to connect Monday.com boards with AI analysis
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monday.com API Key
                </label>
                <input
                  type="password"
                  value={mondayKey}
                  onChange={(e) => setMondayKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiJ9..."
                  className="w-full bg-[#0a0e1a] border border-[#2d3a5c] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Get from Monday.com → Profile → Admin → API →{" "}
                  <a
                    href="https://monday.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Personal Token
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full bg-[#0a0e1a] border border-[#2d3a5c] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Get from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>

              {/* Advanced: free / custom LLM provider */}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-slate-300 select-none list-none flex items-center gap-2">
                  <span className="text-slate-500 group-open:rotate-90 transition-transform">▸</span>
                  Advanced — use a free provider (Groq, OpenRouter, Gemini)
                </summary>
                <div className="space-y-4 mt-4 pl-1">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      API Base URL <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.groq.com/openai/v1"
                      className="w-full bg-[#0a0e1a] border border-[#2d3a5c] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave blank for OpenAI. Free: Groq = <span className="font-mono">https://api.groq.com/openai/v1</span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Model <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="gpt-4o  ·  llama-3.3-70b-versatile"
                      className="w-full bg-[#0a0e1a] border border-[#2d3a5c] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Free on Groq: <span className="font-mono">llama-3.3-70b-versatile</span>
                    </p>
                  </div>
                </div>
              </details>

              {boardError && (
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-400 text-sm">
                  ⚠️ {boardError}
                </div>
              )}

              <button
                onClick={handleSaveConfig}
                disabled={!mondayKey || !openaiKey || loadingBoards}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                {loadingBoards ? "Connecting to Monday.com..." : "Connect & Continue →"}
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-[#1e293b]">
              <p className="text-xs text-slate-500 text-center">
                🔒 API keys are stored locally in your browser and never sent to our servers.
                All AI analysis happens via your own OpenAI account.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Board Selection ────────────────────────────────────────────────────────

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] p-4">
        <div className="max-w-3xl mx-auto pt-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-xl">🚁</div>
              <div>
                <h1 className="text-xl font-bold text-white">Skylark BI Agent</h1>
                <p className="text-slate-400 text-xs">Monday.com Intelligence</p>
              </div>
            </div>
            <button
              onClick={() => setShowConfig(true)}
              className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
            >
              ⚙️ Settings
            </button>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-white mb-2">Select Monday.com Boards</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose which boards to analyze. Set the type for each board to enable specialized BI analysis.
            </p>

            {loadingBoards ? (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Loading your Monday.com boards...</p>
              </div>
            ) : boardError ? (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400 text-sm mb-4">
                ⚠️ {boardError}
                <button
                  onClick={() => fetchBoards(mondayKey)}
                  className="ml-3 underline hover:text-red-300"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                {availableBoards.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No boards found. Check your API key permissions.</p>
                ) : (
                  availableBoards.map((board) => {
                    const selected = selectedBoards.find((b) => b.id === board.id);
                    return (
                      <div
                        key={board.id}
                        className={`border rounded-xl p-4 transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-900/20"
                            : "border-[#2d3a5c] bg-[#0a0e1a] hover:border-[#3d4f7c]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`board-${board.id}`}
                            checked={!!selected}
                            onChange={(e) => handleBoardSelect(board.id, e.target.checked)}
                            className="w-4 h-4 rounded accent-blue-500"
                          />
                          <label
                            htmlFor={`board-${board.id}`}
                            className="flex-1 text-white font-medium cursor-pointer"
                          >
                            {board.name}
                          </label>
                          {selected && (
                            <select
                              value={selected.type}
                              onChange={(e) =>
                                handleBoardTypeChange(board.id, e.target.value as "work_orders" | "deals" | "unknown")
                              }
                              className="bg-[#0a0e1a] border border-[#2d3a5c] text-slate-300 text-sm rounded-lg px-3 py-1 focus:outline-none focus:border-blue-500"
                            >
                              <option value="deals">Deals / Pipeline</option>
                              <option value="work_orders">Work Orders</option>
                              <option value="unknown">Auto-detect</option>
                            </select>
                          )}
                          <span className="text-xs text-slate-500 font-mono">#{board.id}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {selectedBoards.length > 0 && (
              <div className="border-t border-[#1e293b] pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-sm">
                    {selectedBoards.length} board{selectedBoards.length > 1 ? "s" : ""} selected
                  </p>
                  <button
                    onClick={handleLoadData}
                    disabled={loadingData}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white font-semibold py-2 px-6 rounded-xl transition-colors flex items-center gap-2"
                  >
                    {loadingData ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Loading data...
                      </>
                    ) : (
                      "Load & Analyze →"
                    )}
                  </button>
                </div>
                {boardError && (
                  <div className="mt-3 bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-400 text-sm">
                    ⚠️ {boardError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Manual board ID input */}
          <div className="mt-4 bg-[#111827] border border-[#1e293b] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Or enter Board IDs manually</h3>
            <ManualBoardInput
              onAdd={(id, type) => {
                const existing = availableBoards.find((b) => b.id === id);
                if (!existing) {
                  setAvailableBoards((prev) => [...prev, { id, name: `Board ${id}` }]);
                }
                setSelectedBoards((prev) => [
                  ...prev.filter((b) => b.id !== id),
                  { id, name: `Board ${id}`, type },
                ]);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Chat Interface ─────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-[#0a0e1a] overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-[#0d1220] border-r border-[#1e293b] flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-lg">🚁</div>
            <div>
              <h1 className="text-sm font-bold text-white">Skylark BI Agent</h1>
              <p className="text-xs text-slate-500">Monday.com Intelligence</p>
            </div>
          </div>
        </div>

        {/* Connected Boards */}
        <div className="p-4 border-b border-[#1e293b]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Connected Boards</p>
          <div className="space-y-2">
            {boardsData.map((board) => (
              <div
                key={board.name}
                className="flex items-center gap-2 text-xs bg-[#111827] rounded-lg px-3 py-2"
              >
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 font-medium truncate">{board.name}</p>
                  <p className="text-slate-500">{board.records.length} records · {BOARD_TYPE_LABELS[board.type]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-b border-[#1e293b]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="space-y-1">
            <button
              onClick={() => sendMessage("Generate a leadership update for this week")}
              className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>📋</span> Leadership Update
            </button>
            <button
              onClick={() => sendMessage("Show pipeline health summary")}
              className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>📊</span> Pipeline Health
            </button>
            <button
              onClick={() => sendMessage("Which projects are delayed or at risk?")}
              className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>⚠️</span> Risk Dashboard
            </button>
            <button
              onClick={() => sendMessage("Show sector performance breakdown")}
              className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>🎯</span> Sector Analysis
            </button>
            <button
              onClick={() => sendMessage("Who are the top performing clients and deals?")}
              className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>🏆</span> Top Performers
            </button>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="p-4 border-t border-[#1e293b]">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDataLoaded(false);
                setMessages([]);
                setBoardsData([]);
              }}
              className="flex-1 text-xs text-slate-500 hover:text-white bg-[#111827] hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors"
            >
              Change Boards
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className="flex-1 text-xs text-slate-500 hover:text-white bg-[#111827] hover:bg-[#1e293b] px-3 py-2 rounded-lg transition-colors"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="bg-[#0d1220] border-b border-[#1e293b] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Business Intelligence Chat</h2>
            <p className="text-xs text-slate-500">
              Ask me anything about your {boardsData.map((b) => b.name).join(" & ")} data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-slate-400">Live Data</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`animate-fade-in flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex gap-3 max-w-4xl w-full">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm flex-shrink-0 mt-1">
                    🚁
                  </div>
                  <div className="flex-1 min-w-0">
                    {msg.isLoading ? (
                      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl rounded-tl-sm px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">Analyzing your data</span>
                          <div className="flex gap-1">
                            <div className="typing-dot w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            <div className="typing-dot w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            <div className="typing-dot w-1.5 h-1.5 bg-blue-400 rounded-full" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl rounded-tl-sm px-5 py-4">
                        <div
                          className="prose-chat text-slate-300 text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                        <p className="text-xs text-slate-600 mt-3">
                          {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {msg.role === "user" && (
                <div className="flex gap-3 max-w-2xl">
                  <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-5 py-3">
                    <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-blue-200 text-xs mt-1 text-right">
                      {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-sm flex-shrink-0 mt-1">
                    👤
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Suggested queries when no messages or after response */}
          {messages.length === 1 && (
            <div className="max-w-4xl">
              <p className="text-xs text-slate-500 mb-3 ml-11">Try asking:</p>
              <div className="ml-11 flex flex-wrap gap-2">
                {SUGGESTED_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs bg-[#111827] border border-[#2d3a5c] text-slate-400 hover:text-white hover:border-blue-500 px-3 py-2 rounded-xl transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatError && (
            <div className="max-w-4xl ml-11 bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-400 text-sm animate-fade-in">
              ⚠️ {chatError}
              <button
                onClick={() => setChatError("")}
                className="ml-3 text-red-300 hover:text-red-100 underline text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-[#0d1220] border-t border-[#1e293b] px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <div className="flex-1 bg-[#111827] border border-[#2d3a5c] rounded-2xl overflow-hidden focus-within:border-blue-500 transition-colors">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your business data... (Enter to send, Shift+Enter for new line)"
                rows={1}
                className="w-full bg-transparent px-5 py-3 text-white placeholder-slate-500 focus:outline-none resize-none text-sm leading-relaxed max-h-32"
                style={{ minHeight: "48px" }}
                disabled={isThinking}
              />
            </div>
            <button
              type="submit"
              disabled={!inputValue.trim() || isThinking}
              className="w-12 h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-[#1e293b] disabled:cursor-not-allowed rounded-2xl flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isThinking ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </form>
          <p className="text-xs text-slate-600 mt-2 text-center">
            Analyzing live data from {boardsData.map((b) => b.name).join(" & ")} ·{" "}
            {boardsData.reduce((acc, b) => acc + b.records.length, 0)} total records
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Board Input Component ────────────────────────────────────────────

function ManualBoardInput({
  onAdd,
}: {
  onAdd: (id: string, type: "work_orders" | "deals" | "unknown") => void;
}) {
  const [boardId, setBoardId] = useState("");
  const [boardType, setBoardType] = useState<"work_orders" | "deals" | "unknown">("deals");

  const handleAdd = () => {
    if (!boardId.trim()) return;
    onAdd(boardId.trim(), boardType);
    setBoardId("");
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={boardId}
        onChange={(e) => setBoardId(e.target.value)}
        placeholder="Enter Board ID (e.g. 1234567890)"
        className="flex-1 bg-[#0a0e1a] border border-[#2d3a5c] rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
      />
      <select
        value={boardType}
        onChange={(e) => setBoardType(e.target.value as "work_orders" | "deals" | "unknown")}
        className="bg-[#0a0e1a] border border-[#2d3a5c] text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
      >
        <option value="deals">Deals</option>
        <option value="work_orders">Work Orders</option>
        <option value="unknown">Auto</option>
      </select>
      <button
        onClick={handleAdd}
        disabled={!boardId.trim()}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-[#1e293b] text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Add
      </button>
    </div>
  );
}
