'use client';

import { BookOpen, ExternalLink, FileCode, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div className="stagger-in">
        <h1 className="text-3xl font-semibold mono-text-gradient">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Product references and API docs for local Zyphron development.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="premium-panel p-6 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <h2 className="font-semibold">API Reference</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Open the Fastify Swagger UI for all backend endpoints.
          </p>
          <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer">
            <Button className="gap-2">
              Open API Docs
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>

        <div className="premium-panel p-6 space-y-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5" />
            <h2 className="font-semibold">Health Endpoint</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Verify API health and runtime status quickly.
          </p>
          <a href={`${API_URL}/health`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              Open Health Check
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>

      <div className="premium-panel p-6 space-y-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5" />
          <h2 className="font-semibold">Developer Notes</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Core product pages are now wired to local API port <code>3003</code>. If auth fails after changes, clear
          stale local storage token and log in again.
        </p>
      </div>
    </div>
  );
}

