import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Server, Check, Copy, AlertTriangle, Cpu, Terminal, Disc } from "lucide-react";

export const SERVER_INFO = {
  javaIp: "play.studentio.xyz",
  javaPort: 25566,
  bedrockIp: "51.79.228.170",
  bedrockPort: 25566,
};

export default function WhitelistPage() {
  const [searchParams] = useSearchParams();
  const discord = searchParams.get("discord") || undefined;
  const token = searchParams.get("token") || undefined;

  const [username, setUsername] = useState("");
  const [edition, setEdition] = useState<"java" | "bedrock">("java");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [copiedIp, setCopiedIp] = useState(false);
  const [copiedPort, setCopiedPort] = useState(false);

  const ready = useMemo(
    () => Boolean(discord && token && username.trim().length >= 3 && status !== "loading"),
    [discord, token, username, status]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          discordId: discord,
          token: token,
          edition: edition
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit application");
      }

      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred");
    }
  }

  const copyJavaIp = () => {
    navigator.clipboard.writeText(SERVER_INFO.javaIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const copyBedrockIp = () => {
    navigator.clipboard.writeText(SERVER_INFO.bedrockIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const copyPort = () => {
    navigator.clipboard.writeText(String(SERVER_INFO.bedrockPort));
    setCopiedPort(true);
    setTimeout(() => setCopiedPort(false), 2000);
  };

  const missing = !discord || !token;

  return (
    <div className="modern-container min-h-screen w-full flex flex-col justify-between">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Meowcraft Logo"
            className="w-9 h-9 object-contain pixelated"
            onError={(e) => {
              e.currentTarget.onerror = null; // Prevent infinite fallback loops
              e.currentTarget.src = "https://cdn.discordapp.com/icons/1361877511624982659/a_0b904d9c7ad6e6ee.png"; // Fallback
            }}
          />
          <span className="font-display text-sm tracking-widest text-white">MEOWCRAFT</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">online</span>
        </div>
      </header>

      {/* Main content */}
      <main className="w-full max-w-4xl mx-auto px-6 py-12 flex-grow flex items-center justify-center">
        {missing ? (
          <div className="modern-card p-8 md:p-12 text-center max-w-xl mx-auto flex flex-col items-center gap-5 border-red-500/20 bg-red-500/5 shadow-xl shadow-red-500/[0.02]">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-2">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Discord Verification Required</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              We couldn't detect your authorization link credentials. Whitelist gateway requests must be initiated via our Discord bot to securely link your Discord account.
            </p>
            <div className="p-4 rounded-xl bg-black/25 border border-white/5 text-left w-full text-xs text-gray-400">
              <span className="font-semibold text-white block mb-1">To request whitelist:</span>
              1. Open the Discord server.<br />
              2. Go to the <span className="text-emerald-400">#whitelist</span> channel.<br />
              3. Click the <span className="text-white font-bold">Apply for Whitelist</span> button to generate a secure application link.
            </div>
          </div>
        ) : status === "success" ? (
          <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 animate-fade-in">
            {/* Success Card */}
            <div className="modern-card p-8 text-center border-emerald-500/30 bg-emerald-500/5 flex flex-col items-center gap-4 shadow-xl shadow-emerald-500/[0.02]">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
                <Check className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Application Transmitted</h2>
              <p className="text-gray-300 text-sm leading-relaxed max-w-md">
                Excellent! Your application has been logged and sent to our staff queue. You will receive a direct message on Discord once an administrator manually approves your request.
              </p>
            </div>

            {/* Server Info Card */}
            <div className="modern-card p-6 flex flex-col gap-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-white/5 pb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Server Connection Details
              </h3>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Java Connection */}
                <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Java Edition</span>
                    <span className="text-[8px] text-gray-500 uppercase font-semibold">PORT: 25566</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 transition-all">
                    <code className="text-xs font-mono text-white select-all">{SERVER_INFO.javaIp}</code>
                    <button
                      onClick={copyJavaIp}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all"
                      title="Copy Java IP"
                    >
                      {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Bedrock Connection */}
                <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Bedrock Edition</span>
                    <span className="text-[8px] text-gray-500 uppercase font-semibold">PORT: {SERVER_INFO.bedrockPort}</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 transition-all mb-1">
                    <code className="text-xs font-mono text-white select-all">{SERVER_INFO.bedrockIp}</code>
                    <button
                      onClick={copyBedrockIp}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all"
                      title="Copy Bedrock IP"
                    >
                      {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 transition-all">
                    <code className="text-xs font-mono text-white select-all">{SERVER_INFO.bedrockPort}</code>
                    <button
                      onClick={copyPort}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all"
                      title="Copy Bedrock Port"
                    >
                      {copiedPort ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {edition === "bedrock" && (
                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
                  <span className="font-bold text-blue-400 block mb-1">Bedrock Client Notes:</span>
                  If you connect using a Bedrock client, ensure your nickname matches the approved username. In-game nickname configuration is verified on join.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
            <div className="modern-card p-6 md:p-8 flex flex-col gap-6 shadow-xl">
              {/* Account Block Header */}
              <div className="flex items-start justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/15">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Whitelist Registry</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">hi if ur reading this</p>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
                  <Disc className="w-3 h-3 text-indigo-400" />
                  <span className="text-[10px] text-gray-400 font-semibold truncate max-w-[120px]">
                    ID: {discord}
                  </span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Username Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    Minecraft In-Game Name
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                    placeholder="Enter username exactly (no spaces)..."
                    className="modern-input"
                    disabled={status === "loading"}
                    minLength={3}
                    maxLength={16}
                  />
                  <p className="text-[10px] text-gray-500">
                    Must match your in-game name exactly. Note that the username is case sensitive and must contain no spaces.
                  </p>
                </div>

                {/* Platform Selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    Minecraft Edition / Platform
                  </label>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setEdition("java")}
                      disabled={status === "loading"}
                      className={`p-4 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${edition === "java"
                        ? "bg-emerald-500/10 border-emerald-500/35 text-white"
                        : "bg-white/[0.02] border-white/5 text-gray-400 hover:border-white/10 hover:text-white"
                        }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider">Java Edition</span>
                      <span className="text-[9px] opacity-70">PC / Desktop clients</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEdition("bedrock")}
                      disabled={status === "loading"}
                      className={`p-4 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${edition === "bedrock"
                        ? "bg-blue-500/10 border-blue-500/35 text-white"
                        : "bg-white/[0.02] border-white/5 text-gray-400 hover:border-white/10 hover:text-white"
                        }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider">Bedrock Edition</span>
                      <span className="text-[9px] opacity-70">Mobile / Console / Win10</span>
                    </button>
                  </div>
                </div>



                {errorMessage && (
                  <div className="p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-xs text-red-400 text-center font-medium">
                    {errorMessage}
                  </div>
                )}

                {/* Action button */}
                <button
                  type="submit"
                  disabled={!ready}
                  className="modern-btn-primary w-full text-xs font-bold py-4 tracking-widest mt-2 flex items-center justify-center gap-2"
                >
                  {status === "loading" ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                      <span>TRANSMITTING...</span>
                    </>
                  ) : (
                    "SUBMIT GATEWAY REGISTRATION"
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-[10px] text-gray-500">
          &copy; {new Date().getFullYear()} Meowcraft Gateway by laeyue.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">SECURE CONNECTION</span>
          <Shield className="w-3.5 h-3.5 text-emerald-500/40" />
        </div>
      </footer>
    </div>
  );
}
