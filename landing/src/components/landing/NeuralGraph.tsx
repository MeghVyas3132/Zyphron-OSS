import { useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";

type Props = {
  coherence?: number;
  className?: string;
};

// Seeded LCG — gives deterministic random layout every render
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function NeuralGraph({ coherence = 1, className = "" }: Props) {
  const W = 800;
  const H = 460;

  const { nodes, edges } = useMemo(() => {
    const rand = seededRng(42);

    // 42 nodes — scattered organically, avoiding poles/corners
    const nodes: { x: number; y: number; id: number; tier: number }[] = [];
    const PAD = 50;
    for (let i = 0; i < 42; i++) {
      // Use quasi-random spread (2D Halton-ish)
      const rx = rand();
      const ry = rand();
      // Slight centre-bias so the graph feels dense in the middle
      const bias = 0.75 + (1 - Math.abs(rx - 0.5) * 2) * 0.25;
      nodes.push({
        id: i,
        x: PAD + rx * (W - PAD * 2),
        y: PAD + ry * (H - PAD * 2) * bias,
        tier: Math.floor(rx * 3), // 0 = input, 1 = hidden, 2 = output layer hint
      });
    }

    // Connect each node to its 2–4 nearest neighbours
    const edges: { a: number; b: number; weight: number }[] = [];
    const added = new Set<string>();

    nodes.forEach((na, i) => {
      // Compute distances to all others
      const dists = nodes
        .map((nb, j) => ({
          j,
          d: Math.hypot(nb.x - na.x, nb.y - na.y),
        }))
        .filter(({ j }) => j !== i)
        .sort((a, b) => a.d - b.d);

      // Connect to 2–4 closest (skip if edge already added)
      const count = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < Math.min(count, dists.length); k++) {
        const j = dists[k].j;
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (!added.has(key) && dists[k].d < 190) {
          added.add(key);
          edges.push({ a: i, b: j, weight: 1 - dists[k].d / 250 });
        }
      }
    });

    return { nodes, edges };
  }, []);

  // Pulse animation — random nodes "fire" signals
  const pulseRef = useRef<{ edgeIdx: number; t: number; speed: number }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Seed a few active pulses
    const rand = seededRng(77);
    pulseRef.current = Array.from({ length: 6 }, (_, i) => ({
      edgeIdx: Math.floor(rand() * edges.length),
      t: rand(),
      speed: 0.004 + rand() * 0.006,
    }));

    const PULSE_EL = "zn-pulse";

    const tick = () => {
      const pulses = pulseRef.current;
      const svg = svgRef.current;
      if (!svg) { rafRef.current = requestAnimationFrame(tick); return; }

      pulses.forEach((p, i) => {
        p.t += p.speed;
        if (p.t > 1) {
          p.t = 0;
          // Pick new random edge
          p.edgeIdx = Math.floor(Math.random() * edges.length);
          p.speed = 0.004 + Math.random() * 0.006;
        }

        const edge = edges[p.edgeIdx];
        if (!edge) return;
        const na = nodes[edge.a];
        const nb = nodes[edge.b];
        const x = na.x + (nb.x - na.x) * p.t;
        const y = na.y + (nb.y - na.y) * p.t;

        let el = svg.querySelector(`[data-pulse="${i}"]`) as SVGCircleElement | null;
        if (!el) {
          el = document.createElementNS("http://www.w3.org/2000/svg", "circle") as SVGCircleElement;
          el.setAttribute("data-pulse", String(i));
          el.setAttribute("class", PULSE_EL);
          el.setAttribute("r", "2.5");
          el.setAttribute("fill", "rgba(255,255,255,0.95)");
          svg.appendChild(el);
        }
        el.setAttribute("cx", String(x));
        el.setAttribute("cy", String(y));
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [edges, nodes]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`h-auto w-full ${className}`}
      fill="none"
    >
      {/* Edges */}
      {edges.map((e, i) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const present = coherence > 0.5 || ((i * 6271 + 49297) % 10) / 10 < coherence;
        const opacity = present ? Math.max(0.08, e.weight * 0.45) : 0.03;
        return (
          <motion.line
            key={i}
            x1={a.x} y1={a.y}
            x2={b.x} y2={b.y}
            stroke={`rgba(255,255,255,${opacity.toFixed(3)})`}
            strokeWidth={0.7}
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 1.4 + (i % 8) * 0.15,
              delay: (i % 30) * 0.025,
              ease: "easeOut",
            }}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n, i) => {
        // Node size varies slightly by "tier" to suggest depth
        const r = 1.5 + n.tier * 0.4;
        return (
          <motion.circle
            key={i}
            cx={n.x} cy={n.y}
            r={r}
            fill={`rgba(255,255,255,${0.55 + n.tier * 0.15})`}
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: (i % 14) * 0.04, ease: "backOut" }}
          />
        );
      })}
    </svg>
  );
}

export default NeuralGraph;
