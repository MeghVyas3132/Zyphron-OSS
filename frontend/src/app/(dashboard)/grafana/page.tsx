'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Activity, Zap, Server, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GRAFANA_BASE = process.env.NEXT_PUBLIC_GRAFANA_URL ?? 'http://localhost:3002';

const DASHBOARDS = [
  {
    id: 'sre',
    label: 'SRE Overview',
    icon: Activity,
    uid: 'zyphron-sre',
    description: 'Request rate, latency percentiles, error rate, node CPU/RAM/disk',
  },
  {
    id: 'deployments',
    label: 'Deployments',
    icon: Zap,
    uid: 'zyphron-deployments',
    description: 'Build times, success rate, deployment frequency per project',
  },
  {
    id: 'stress',
    label: 'Stress Tests',
    icon: Server,
    uid: 'zyphron-stress',
    description: 'k6 load test results: p50/p95/p99, error rate, req/s',
  },
  {
    id: 'nodes',
    label: 'Node Metrics',
    icon: BarChart3,
    uid: 'zyphron-node',
    // K3s / kube-prometheus-stack node exporter dashboard
    panelId: undefined,
    grafanaId: 1860,   // community "Node Exporter Full" id
    description: 'CPU, memory, disk, network per K8s node',
  },
] as const;

type DashId = (typeof DASHBOARDS)[number]['id'];

function grafanaUrl(dash: (typeof DASHBOARDS)[number]): string {
  if ('grafanaId' in dash && dash.grafanaId) {
    return `${GRAFANA_BASE}/d-solo/${dash.grafanaId}?orgId=1&refresh=30s&kiosk`;
  }
  return `${GRAFANA_BASE}/d/${dash.uid}?orgId=1&refresh=30s&kiosk`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.19, 1, 0.22, 1] as const } },
};

export default function GrafanaPage() {
  const [active, setActive] = useState<DashId>('sre');
  const [key, setKey] = useState(0); // force iframe reload

  const current = DASHBOARDS.find((d) => d.id === active)!;
  const url = grafanaUrl(current);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 h-full flex flex-col"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Grafana Dashboards</h1>
          <p className="text-muted-foreground mt-1">
            SRE metrics, deployment analytics, and load test results — no login required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setKey((k) => k + 1)}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => window.open(url.replace('&kiosk', ''), '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            Open in Grafana
          </Button>
        </div>
      </motion.div>

      {/* Dashboard selector */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DASHBOARDS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              className={`premium-panel premium-card-hover p-4 text-left transition-all ${
                active === d.id
                  ? 'ring-2 ring-foreground/40 bg-foreground/5'
                  : 'hover:bg-foreground/3'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-foreground/60" />
                <span className="text-sm font-medium">{d.label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{d.description}</p>
            </button>
          );
        })}
      </motion.div>

      {/* Iframe */}
      <motion.div variants={itemVariants} className="premium-panel overflow-hidden flex-1 min-h-0" style={{ minHeight: '520px' }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card/60">
          <div className="flex items-center gap-2">
            <current.icon className="h-4 w-4 text-foreground/60" />
            <span className="text-sm font-medium">{current.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">Auto-refreshes every 30s</span>
        </div>
        <iframe
          key={key}
          src={url}
          className="w-full bg-transparent"
          style={{ height: 'calc(100% - 40px)', minHeight: '480px', border: 'none' }}
          title={current.label}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </motion.div>
    </motion.div>
  );
}
