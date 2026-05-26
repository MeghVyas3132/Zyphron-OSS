import { motion } from "framer-motion";
import { PixelGridBackground } from "@/components/landing/PixelGridBackground";
import { SceneShell } from "@/components/landing/SceneShell";
import { MassiveType } from "@/components/landing/MassiveType";
import { Nav } from "@/components/landing/Nav";
import { NeuralGraph } from "@/components/landing/NeuralGraph";
import { InfraGlobe } from "@/components/landing/InfraGlobe";
import { HoloTerminal } from "@/components/landing/HoloTerminal";
import { CliInstall } from "@/components/landing/CliInstall";

export function LandingPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-black text-white">
      <PixelGridBackground />
      <Nav />

      {/* ACT 1 — AWAKENING */}
      <SceneShell>
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.2 }}
            className="mb-10 font-mono-ui text-[10px] uppercase tracking-[0.4em] text-white/40"
          >
            ◦ Zyphron / Deployment Intelligence
          </motion.div>
          <MassiveType as="h1" className="max-w-5xl">
            Infrastructure was never designed
            <span className="block text-white/45">for intelligence.</span>
          </MassiveType>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 1 }}
            className="mt-10 max-w-xl text-balance text-sm leading-relaxed text-white/55 md:text-base"
          >
            An autonomous deployment network that thinks across clouds, regions
            and runtimes — so software can finally move at the speed of thought.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 2 }}
            className="mt-24 flex flex-col items-center gap-3 font-mono-ui text-[10px] uppercase tracking-[0.35em] text-white/30"
          >
            <span>scroll</span>
            <span className="h-10 w-px bg-gradient-to-b from-white/40 to-transparent" />
          </motion.div>
        </div>
      </SceneShell>

      {/* ACT 2 — THE PROBLEM */}
      <SceneShell id="problem" eyebrow="Act 02 — The Problem">
        <div className="grid gap-16 md:grid-cols-[1.1fr_1fr] md:items-center">
          <MassiveType>
            Modern infrastructure is
            <span className="block text-white/40">fragmented.</span>
          </MassiveType>
          <div className="space-y-6 text-sm leading-relaxed text-white/55">
            <p>
              Five vendors. Twenty dashboards. A configuration file for every
              service and a runbook for every failure. Deployments stall in
              YAML, observability lives in seven tabs, and engineers spend more
              time wiring platforms together than building product.
            </p>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.08] font-mono-ui text-[11px] uppercase tracking-[0.18em] text-white/45">
              {[
                ["Vercel", "edge"],
                ["Netlify", "static"],
                ["Railway", "compute"],
                ["Render", "services"],
                ["Supabase", "data"],
                ["—", "fragmented"],
              ].map(([k, v]) => (
                <div key={k} className="bg-white/[0.02] p-4">
                  <div className="text-white/80">{k}</div>
                  <div className="text-white/30">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SceneShell>

      {/* ACT 3 — COLLAPSE */}
      <SceneShell eyebrow="Act 03 — Collapse">
        <div className="grid gap-12 md:grid-cols-2 md:items-end">
          <div>
            <MassiveType>
              Deployments fail
              <span className="block text-white/40">at planetary scale.</span>
            </MassiveType>
          </div>
          <div className="space-y-5 font-mono-ui text-[11px] leading-relaxed text-white/50">
            <Glitch line="01:14:09  build  ok  → ship eu-west-3" />
            <Glitch line="01:14:11  edge   503  cold-start cascade detected" />
            <Glitch line="01:14:12  route  retry → us-east-1 (lat 412ms)" />
            <Glitch line="01:14:13  data   conn refused: replica-04" red />
            <Glitch line="01:14:14  alert  paging on-call rotation" red />
            <Glitch line="01:14:15  human  intervention required" red />
          </div>
        </div>
      </SceneShell>

      {/* ACT 4 — THE AI AWAKENS */}
      <SceneShell eyebrow="Act 04 — Cognition">
        <div className="flex flex-col items-center text-center">
          <MassiveType className="max-w-4xl">
            Infrastructure
            <span className="block">needs cognition.</span>
          </MassiveType>
          <p className="mt-8 max-w-md text-sm text-white/50">
            Zyphron is the layer where deployment, orchestration, observability
            and recovery become a single autonomous intelligence.
          </p>
          <div className="mt-16 w-full max-w-3xl rounded-2xl border border-white/[0.06] bg-black/30 p-6 backdrop-blur-xl">
            <NeuralGraph coherence={1} />
          </div>
        </div>
      </SceneShell>

      {/* ACT 5 — UNIVERSAL DEPLOYMENT ENGINE */}
      <SceneShell id="engine" eyebrow="Act 05 — Universal Engine">
        <div className="grid gap-16 md:grid-cols-[1fr_1.1fr] md:items-center">
          <div>
            <MassiveType>
              One engine.
              <span className="block text-white/40">Every cloud.</span>
            </MassiveType>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-white/55">
              Zyphron orchestrates deployments across AWS, GCP, Azure and
              Oracle Cloud with intelligent routing, autonomous scaling and
              self-healing topology — under one interface.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.08]">
              {[
                ["22+", "stacks detected"],
                ["4", "clouds orchestrated"],
                ["100ms", "global routing"],
                ["∞", "preview environments"],
              ].map(([k, v]) => (
                <div key={v} className="bg-white/[0.02] p-5">
                  <div className="font-display text-2xl font-light text-white">{k}</div>
                  <div className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <InfraGlobe size={520} />
          </div>
        </div>
      </SceneShell>

      {/* ACT 6 — INTERACTIVE SYSTEM */}
      <SceneShell eyebrow="Act 06 — Live Topology">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <MassiveType>
              Autonomous,
              <span className="block text-white/40">always.</span>
            </MassiveType>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-white/55">
              Every node observes itself. Every region negotiates traffic with
              every other. When something fails, the network has already
              re-routed around it.
            </p>
          </div>
          <div className="holo-panel rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/40">
              <span>// live.topology</span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" />
                healthy
              </span>
            </div>
            <NeuralGraph coherence={1} />
            <div className="mt-4 grid grid-cols-3 gap-3 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/40">
              <div>nodes 384</div>
              <div>p99 41ms</div>
              <div>self-heals 12/h</div>
            </div>
          </div>
        </div>
      </SceneShell>

      {/* ACT 7 — ARTIFACTS */}
      <SceneShell id="artifacts" eyebrow="Act 07 — Artifacts">
        <MassiveType className="mb-16 max-w-3xl">
          Proof in
          <span className="block text-white/40">signals, not stories.</span>
        </MassiveType>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] md:grid-cols-3">
          <ArtifactCard
            label="Latency"
            value="41ms"
            sub="p99 / global edge"
            sparkline={[8, 12, 9, 14, 10, 11, 8, 7, 9]}
          />
          <ArtifactCard
            label="Uptime"
            value="99.998%"
            sub="trailing 90 days"
            sparkline={[2, 2, 2, 1, 2, 2, 2, 2, 1]}
          />
          <ArtifactCard
            label="Deploys"
            value="14,820"
            sub="autonomous / week"
            sparkline={[3, 5, 6, 8, 7, 9, 11, 13, 14]}
          />
          <ArtifactCard
            label="Self-heals"
            value="612"
            sub="last 24h"
            sparkline={[10, 9, 12, 8, 11, 7, 9, 10, 8]}
          />
          <ArtifactCard
            label="Regions"
            value="38"
            sub="across 4 clouds"
            sparkline={[2, 3, 3, 4, 4, 5, 5, 6, 6]}
          />
          <ArtifactCard
            label="Cost"
            value="−34%"
            sub="vs. fragmented stack"
            sparkline={[14, 12, 11, 10, 8, 7, 7, 6, 5]}
          />
        </div>
      </SceneShell>

      {/* ACT 8 — ACCESS TERMINAL */}
      <SceneShell id="access" eyebrow="Act 08 — Access">
        <div className="flex flex-col items-center text-center">
          <MassiveType className="mb-12 max-w-3xl">
            Access the deployment
            <span className="block text-white/40">intelligence network.</span>
          </MassiveType>
          <div className="w-full max-w-5xl">
            <div className="mb-8 flex items-center gap-4 justify-center">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.3em] text-white/25">choose your entry point</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="grid gap-6 md:grid-cols-2 md:items-start">
              <HoloTerminal />
              <CliInstall />
            </div>
          </div>
        </div>
      </SceneShell>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-10 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/30 md:flex-row">
          <div>Zyphron Systems — Deployment Intelligence</div>
          <div>v1.0 / build 2026.05</div>
        </div>
      </footer>
    </main>
  );
}

function Glitch({ line, red = false }: { line: string; red?: boolean }) {
  return (
    <div className={`border-l border-white/10 pl-3 ${red ? "text-white/75" : "text-white/45"}`}>
      {line}
    </div>
  );
}

function ArtifactCard({
  label,
  value,
  sub,
  sparkline,
}: {
  label: string;
  value: string;
  sub: string;
  sparkline: number[];
}) {
  const max = Math.max(...sparkline);
  const min = Math.min(...sparkline);
  const range = Math.max(1, max - min);
  const w = 120;
  const h = 32;
  const step = w / (sparkline.length - 1);
  const points = sparkline
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <div className="bg-white/[0.015] p-6 backdrop-blur-sm">
      <div className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.25em] text-white/40">
        {label}
      </div>
      <div className="font-display text-4xl font-light text-white">{value}</div>
      <div className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/35">
        {sub}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-5 h-8 w-full">
        <polyline
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          points={points}
        />
      </svg>
    </div>
  );
}
