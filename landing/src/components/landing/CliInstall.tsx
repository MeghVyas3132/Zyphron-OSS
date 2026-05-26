import { useState } from "react";
import { motion } from "framer-motion";

type Tab = "mac" | "windows" | "npm";

const COMMANDS: Record<Tab, { label: string; lines: string[] }> = {
  mac: {
    label: "macOS / Linux",
    lines: ['curl -fsSL https://zyphron.space/install.sh | sh'],
  },
  windows: {
    label: "Windows",
    lines: ['irm https://zyphron.space/install.ps1 | iex'],
  },
  npm: {
    label: "npm",
    lines: ['npm install -g zyphron-cli'],
  },
};

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]" aria-hidden="true">
      <polyline points="2,9 6,13 14,4" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

export function CliInstall() {
  const [tab, setTab] = useState<Tab>("mac");
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const cmd = COMMANDS[tab];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      className="holo-panel scanlines relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl p-8"
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/40">
        <span>// cli.install</span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
          one-line setup
        </span>
      </div>

      <h3 className="mb-2 font-display text-2xl font-light text-white">Deploy from terminal</h3>
      <p className="mb-7 font-mono-ui text-[11px] tracking-wider text-white/40">
        If it works on your laptop, it can be deployed
      </p>

      {/* OS tabs */}
      <div className="mb-4 flex gap-px overflow-hidden rounded-md border border-white/[0.08] font-mono-ui text-[9px] uppercase tracking-[0.25em]">
        {(["mac", "windows", "npm"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 transition-colors ${tab === t ? "bg-white/[0.08] text-white/85" : "bg-transparent text-white/30 hover:text-white/50"}`}
          >
            {COMMANDS[t].label}
          </button>
        ))}
      </div>

      {/* Command block */}
      <div className="group relative mb-6 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-start justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            {cmd.lines.map((line, i) => (
              <div
                key={i}
                className="break-all font-mono-ui text-[11px] leading-relaxed tracking-wide text-white/75"
              >
                <span className="mr-2 text-white/25">$</span>
                {line}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => copy(cmd.lines.join("\n"))}
            title="Copy command"
            className="mt-0.5 flex-shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            <CopyIcon copied={copied} />
          </button>
        </div>
      </div>

      {/* What you get */}
      <div className="mb-8 space-y-2">
        {[
          ["zy deploy", "push your project to the cloud"],
          ["zy logs", "stream live logs from any deployment"],
          ["zy env set", "sync .env variables to production"],
        ].map(([cmd, desc]) => (
          <div key={cmd} className="flex items-baseline gap-3">
            <span className="w-[90px] flex-shrink-0 font-mono-ui text-[10px] tracking-wider text-white/60">{cmd}</span>
            <span className="font-mono-ui text-[10px] tracking-wider text-white/30">{desc}</span>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-3 gap-3 font-mono-ui text-[9px] uppercase tracking-[0.25em] text-white/30">
        <div>linux / mac</div>
        <div>windows</div>
        <div>no runtime</div>
      </div>
    </motion.div>
  );
}

export default CliInstall;
