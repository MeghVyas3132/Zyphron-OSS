import { useEffect, useRef } from "react";

export function InfraGlobe({ size = 520 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.38;

    // Seeded PRNG
    const rng = (n: number) => (Math.sin(n * 9301.13 + 7.7) * 43758.5453) % 1;
    const abs_rng = (n: number) => Math.abs(rng(n));

    // City nodes — scattered lat/lon (not on a grid)
    const nodes: { lon: number; lat: number }[] = [];
    for (let i = 0; i < 28; i++) {
      // Bias toward populated latitudes (±60°)
      const u = abs_rng(i * 3 + 1);
      const lat = (u * 2 - 1) * (Math.PI / 3);
      nodes.push({
        lon: abs_rng(i * 3 + 2) * Math.PI * 2,
        lat,
      });
    }

    // Active arcs between pairs
    const arcs = Array.from({ length: 10 }, (_, i) => ({
      a: Math.floor(abs_rng(i * 7 + 1) * nodes.length),
      b: Math.floor(abs_rng(i * 7 + 3) * nodes.length),
      t: abs_rng(i + 7),
      speed: 0.0018 + abs_rng(i + 9) * 0.0025,
    }));

    let raf = 0;
    let rot = 0;

    const project = (lon: number, lat: number, r = R) => {
      const x = Math.cos(lat) * Math.sin(lon + rot) * r;
      const y = -Math.sin(lat) * r;
      const z = Math.cos(lat) * Math.cos(lon + rot) * r;
      return { x: cx + x, y: cy + y, z };
    };

    const draw = () => {
      rot += 0.0015;
      ctx.clearRect(0, 0, size, size);

      // Subtle atmosphere glow
      const grad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.18);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.03)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
      ctx.fill();

      // ── Latitude rings (front hemisphere only) ──────────────────
      const LAT_BANDS = 10;
      for (let li = 1; li < LAT_BANDS; li++) {
        const lat = -Math.PI / 2 + (li * Math.PI) / LAT_BANDS;
        const SEGS = 96;
        for (let j = 0; j < SEGS; j++) {
          const lon0 = (j / SEGS) * Math.PI * 2;
          const lon1 = ((j + 1) / SEGS) * Math.PI * 2;
          const p0 = project(lon0, lat);
          const p1 = project(lon1, lat);
          // Skip segments whose midpoint faces away
          const midZ = project((lon0 + lon1) / 2, lat).z;
          if (midZ < 0) continue;
          const alpha = Math.max(0, midZ / R) * 0.22;
          ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      // ── Longitude meridians (front hemisphere only) ─────────────
      const LON_LINES = 14;
      for (let li = 0; li < LON_LINES; li++) {
        const lon = (li / LON_LINES) * Math.PI * 2;
        const SEGS = 64;
        for (let j = 0; j < SEGS; j++) {
          const lat0 = -Math.PI / 2 + (j / SEGS) * Math.PI;
          const lat1 = -Math.PI / 2 + ((j + 1) / SEGS) * Math.PI;
          const p0 = project(lon, lat0);
          const p1 = project(lon, lat1);
          const midZ = project(lon, (lat0 + lat1) / 2).z;
          if (midZ < 0) continue;
          const alpha = Math.max(0, midZ / R) * 0.15;
          ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      // ── City nodes ───────────────────────────────────────────────
      nodes.forEach((n) => {
        const p = project(n.lon, n.lat);
        if (p.z < -R * 0.1) return; // fully behind: skip
        const depth = Math.max(0, p.z / R);
        const alpha = 0.15 + depth * 0.8;
        const r = 1.2 + depth * 2.2;
        // Pulse ring for front-facing nodes
        if (depth > 0.5) {
          ctx.strokeStyle = `rgba(255,255,255,${(depth * 0.15).toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Active arcs with travelling packet ──────────────────────
      arcs.forEach((arc) => {
        arc.t += arc.speed;
        if (arc.t > 1) {
          arc.t = 0;
          arc.a = arc.b;
          arc.b = Math.floor(abs_rng(arc.t * 9999 + rot * 1000) * nodes.length);
        }

        const na = nodes[arc.a];
        const nb = nodes[arc.b];
        const pa = project(na.lon, na.lat);
        const pb = project(nb.lon, nb.lat);

        // Only draw if both endpoints are roughly visible
        if (pa.z < -R * 0.3 || pb.z < -R * 0.3) return;

        // Arc control point lifted above midpoint
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const lift = 55 + len * 0.15;
        const ox = mx + (dx / len) * lift;
        const oy = my + (dy / len) * lift;

        const depthFade = Math.max(0.05, (pa.z + pb.z) / (R * 2));
        ctx.strokeStyle = `rgba(255,255,255,${(depthFade * 0.3).toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(ox, oy, pb.x, pb.y);
        ctx.stroke();

        // Travelling packet
        const t = arc.t;
        const it = 1 - t;
        const hx = it * it * pa.x + 2 * it * t * ox + t * t * pb.x;
        const hy = it * it * pa.y + 2 * it * t * oy + t * t * pb.y;
        ctx.fillStyle = `rgba(255,255,255,${(depthFade * 0.95).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className="mx-auto block"
    />
  );
}

export default InfraGlobe;
