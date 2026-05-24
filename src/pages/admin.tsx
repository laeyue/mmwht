import React, { useEffect, useState, useMemo } from "react";
import { ShieldAlert, LogOut, Check, X, KeyRound, ArrowLeft, Clock, ShieldCheck, User, ListCollapse } from "lucide-react";

type Application = {
  id: string;
  username: string;
  discordId: string;
  edition: "java" | "bedrock";
  submittedAt: string;
  ipAddress?: string;
};

type DecisionLog = {
  username: string;
  discordId: string;
  edition: "java" | "bedrock";
  action: "approve" | "reject";
  processedAt: string;
  ipAddress?: string;
};

type WhitelistedPlayer = {
  id: string;
  username: string;
  discordId: string;
  edition: "java" | "bedrock";
  whitelistedAt: string;
  ipAddress?: string;
};

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false);

  // Auto-check if we might already have the cookie (the backend returns 401 on fetchQueue if not authorized)
  useEffect(() => {
    fetch("/api/admin/queue")
      .then((res) => {
        if (res.ok) {
          setAuthed(true);
        }
      })
      .catch(() => { });
  }, []);

  if (!authed) {
    return <LoginGate onAuthed={() => setAuthed(true)} />;
  }

  return <Dashboard onLogout={() => setAuthed(false)} />;
}

/* ---------------- Login Gate ---------------- */

function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onAuthed();
      } else {
        setError(data.error || "Invalid passphrase. Access denied.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modern-container min-h-screen w-full flex items-center justify-center p-4">
      <div className="modern-card p-8 w-full max-w-md flex flex-col gap-6 shadow-2xl">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-4">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="font-display text-xs text-white tracking-widest uppercase">Staff Portal</h1>
            <p className="text-[10px] text-gray-400 mt-1">hi</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">
              Passphrase
            </label>
            <div className="relative">
              <input
                type="password"
                autoFocus
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="modern-input pr-10 text-sm"
                placeholder="Enter admin security key..."
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 text-center text-xs font-semibold text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase.trim()}
            className="modern-btn-primary w-full text-xs font-bold py-3.5 tracking-wider"
          >
            {loading ? "AUTHENTICATING..." : "LOGIN TO STAFF PORTAL"}
          </button>

          <a
            href="/"
            className="text-[10px] text-center text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-1 mt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Gateway
          </a>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [queue, setQueue] = useState<Application[] | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ pendingCount: number; approvedCount: number; rejectedCount: number; totalWhitelisted: number } | null>(null);
  const [whitelisted, setWhitelisted] = useState<WhitelistedPlayer[] | null>(null);
  const [logs, setLogs] = useState<DecisionLog[] | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [revoking, setRevoking] = useState<Set<string>>(new Set());

  const filteredWhitelisted = useMemo(() => {
    if (!whitelisted) return [];
    return whitelisted.filter(
      (player) =>
        player.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.discordId.includes(searchTerm)
    );
  }, [whitelisted, searchTerm]);

  async function handleLogoutClick() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch (err) {
      console.error("Failed to clear cookie:", err);
    }
    onLogout();
  }

  const loadQueue = async () => {
    try {
      const res = await fetch("/api/admin/queue");
      if (!res.ok) {
        throw new Error("Session expired. Please log in again.");
      }
      const data = await res.json();
      setQueue(data.queue);
      setStats(data.stats);
      setLogs(data.logs);
      setWhitelisted(data.whitelisted);
    } catch (err: any) {
      setError(err.message || "Failed to load whitelist queue.");
      if (err.message?.includes("expired")) {
        setTimeout(onLogout, 2000);
      }
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  async function handleAction(id: string, action: "approve" | "reject") {
    // Optimistic slide out animation
    setRemoving((prev) => new Set(prev).add(id));

    setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });

        if (!res.ok) {
          throw new Error("Failed to process action.");
        }

        // Fetch refreshed queue, stats, and logs from server
        await loadQueue();
      } catch (err: any) {
        alert(err.message || "Error submitting response");
        // Revert removal if error
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, 250);
  }

  async function handleRevoke(id: string, username: string) {
    if (!confirm(`⚠️ Are you sure you want to revoke whitelist access for "${username}"?`)) return;

    setRevoking((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/admin/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        throw new Error("Failed to revoke whitelist.");
      }

      await loadQueue();
    } catch (err: any) {
      alert(err.message || "Error revoking whitelisted user");
    } finally {
      setRevoking((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function formatDate(isoStr: string) {
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return "Unknown";
    }
  }

  return (
    <div className="modern-container min-h-screen w-full flex flex-col justify-between">
      <div className="w-full max-w-5xl mx-auto px-6 py-6 flex-grow flex flex-col gap-6 md:gap-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xs text-white tracking-widest uppercase">Staff Dashboard</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">by laeyue</p>
            </div>
          </div>

          <button
            onClick={handleLogoutClick}
            className="modern-pill hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 active:scale-95 transition-all text-[10px]"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </header>

        {/* Quickstat Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
          {/* Pending Card */}
          <div className="modern-card p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Queue Pending</span>
              <span className="text-2xl font-extrabold text-amber-400">{stats ? stats.pendingCount : "-"}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>

          {/* Active Whitelisted Database Card */}
          <div className="modern-card p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Whitelisted Base</span>
              <span className="text-2xl font-extrabold text-emerald-400">{stats ? stats.totalWhitelisted : "-"}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
          </div>

          {/* Approved Card */}
          <div className="modern-card p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Session Approvals</span>
              <span className="text-2xl font-extrabold text-teal-400">{stats ? stats.approvedCount : "-"}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 flex-shrink-0">
              <Check className="w-4.5 h-4.5" />
            </div>
          </div>

          {/* Rejected Card */}
          <div className="modern-card p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Session Rejections</span>
              <span className="text-2xl font-extrabold text-red-400">{stats ? stats.rejectedCount : "-"}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
              <X className="w-4.5 h-4.5" />
            </div>
          </div>
        </div>

        {/* Main queue card */}
        <div className="modern-card overflow-hidden flex-grow flex flex-col justify-start">
          <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">Verification Requests</h2>
            <button
              onClick={loadQueue}
              className="text-[10px] text-emerald-400 hover:underline uppercase font-bold"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="m-6 p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-xs text-red-400 text-center font-medium">
              {error}
            </div>
          )}

          {queue === null ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-3 flex-grow">
              <span className="w-6 h-6 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin"></span>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Loading queue data...</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-4 flex-grow">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white uppercase tracking-wide">Queue Clear!</h3>
              <p className="text-[11px] text-gray-400 max-w-xs leading-relaxed">
                All whitelist gateway submissions have been reviewed and approved. Great job protecting the servers!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/15 border-b border-white/5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    <th className="p-4 pl-6">Minecraft Username</th>
                    <th className="p-4">Platform</th>
                    <th className="p-4">Discord ID</th>
                    <th className="p-4">Submitted At</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {queue.map((app) => (
                    <tr
                      key={app.id}
                      className={`hover:bg-white/[0.01] transition-all duration-300 ${removing.has(app.id) ? "opacity-0 scale-95 translate-x-4 pointer-events-none" : ""
                        }`}
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span className="font-bold text-white text-sm">{app.username}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {app.edition === "bedrock" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                            Bedrock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                            Java
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono text-gray-300">{app.discordId}</span>
                          {app.ipAddress && (
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5" title="Submitting client IP">
                              IP: {app.ipAddress}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs text-gray-400">{formatDate(app.submittedAt)}</td>
                      <td className="p-4 pr-6 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleAction(app.id, "approve")}
                          className="modern-pill bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500 hover:text-white px-3.5 py-1 text-[10px] uppercase font-bold active:scale-95 transition-all cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(app.id, "reject")}
                          className="modern-pill bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500 hover:text-white px-2.5 py-1 text-[10px] active:scale-95 transition-all cursor-pointer"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Whitelisted Database Panel */}
        <div className="modern-card overflow-hidden mt-2">
          <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              Whitelisted Database ({whitelisted ? filteredWhitelisted.length : 0})
            </h2>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search username or Discord..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-black/35 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white max-w-xs focus:outline-none focus:border-emerald-500/40"
            />
          </div>

          {whitelisted === null ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Loading whitelisted database...</p>
            </div>
          ) : filteredWhitelisted.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-xs leading-relaxed max-w-sm mx-auto">
              {searchTerm ? "No matching whitelisted players found in database." : "No players whitelisted in active database. Approve requests to build up this base."}
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/15 border-b border-white/5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    <th className="p-4 pl-6">Minecraft Username</th>
                    <th className="p-4">Platform</th>
                    <th className="p-4">Discord ID & IP</th>
                    <th className="p-4">Whitelisted At</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-xs font-medium">
                  {filteredWhitelisted.map((player) => (
                    <tr
                      key={player.id}
                      className={`hover:bg-white/[0.01] transition-all duration-300 ${revoking.has(player.id) ? "opacity-50 pointer-events-none" : ""
                        }`}
                    >
                      <td className="p-4 pl-6 font-bold text-white">{player.username}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${player.edition === "bedrock"
                          ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                          : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          }`}>
                          {player.edition}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-gray-300 font-mono">{player.discordId}</span>
                          {player.ipAddress && (
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5" title="Registration client IP">
                              IP: {player.ipAddress}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-gray-400 font-normal">{formatDate(player.whitelistedAt)}</td>
                      <td className="p-4 pr-6 text-right whitespace-nowrap">
                        <button
                          disabled={revoking.has(player.id)}
                          onClick={() => handleRevoke(player.id, player.username)}
                          className="modern-pill bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500 hover:text-white px-3.5 py-1 text-[10px] uppercase font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {revoking.has(player.id) ? "Revoking..." : "Revoke Access"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Decision History Log Panel */}
        <div className="modern-card overflow-hidden mt-2">
          <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <ListCollapse className="w-4 h-4 text-emerald-400" />
              Decision Audit Logs
            </h2>
            <span className="text-[9px] uppercase font-bold text-gray-400">SESSION ACTIONS</span>
          </div>

          {logs === null ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Loading history logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-xs leading-relaxed max-w-sm mx-auto">
              No recent moderator decisions recorded in this session. Process requests in the queue above to populate this log.
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/15 border-b border-white/5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    <th className="p-4 pl-6">Minecraft Username</th>
                    <th className="p-4">Platform</th>
                    <th className="p-4">Discord ID</th>
                    <th className="p-4">Decision</th>
                    <th className="p-4 pr-6 text-right">Processed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-xs font-medium">
                  {logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.01]">
                      <td className="p-4 pl-6 font-bold text-white">{log.username}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${log.edition === "bedrock"
                          ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                          : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          }`}>
                          {log.edition}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-gray-400 font-mono">{log.discordId}</span>
                          {log.ipAddress && (
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5" title="Submitting client IP">
                              IP: {log.ipAddress}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${log.action === "approve"
                          ? "text-emerald-400"
                          : log.action === "revoke"
                            ? "text-amber-500 font-extrabold"
                            : "text-red-400"
                          }`}>
                          {log.action === "approve"
                            ? "APPROVED"
                            : log.action === "revoke"
                              ? "REVOKED"
                              : "REJECTED"}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right text-gray-500 font-normal">{formatDate(log.processedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <footer className="w-full max-w-5xl mx-auto px-6 py-6 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500">
        <span>Meowcraft Staff Portal</span>
        <span>Secure Session</span>
      </footer>
    </div>
  );
}
