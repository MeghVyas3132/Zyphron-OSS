'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, Download, Pause, Play, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DeploymentLogsProps {
  deploymentId: string;
  projectId: string;
  status: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  step?: string;
  progress?: number;
}

export function DeploymentLogs({ deploymentId, projectId, status }: DeploymentLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Only connect WebSocket for active deployments
    if (!['QUEUED', 'BUILDING', 'DEPLOYING'].includes(status)) {
      // Fetch historical logs for completed deployments
      fetchLogs();
      return;
    }

    // Connect to WebSocket for live logs
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    const ws = new WebSocket(`${wsUrl}/ws/deployments/${deploymentId}/logs`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected for deployment logs');
    };

    ws.onmessage = (event) => {
      if (isPaused) return;
      
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs(prev => [...prev, data.payload]);
        } else if (data.type === 'status') {
          // Handle status updates
          console.log('Deployment status:', data.payload);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [deploymentId, status, isPaused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/projects/${projectId}/deployments/${deploymentId}/logs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();
      if (data.logs) {
        // Parse logs from string
        const parsedLogs = data.logs.split('\n').filter(Boolean).map((line: string, i: number) => ({
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          message: line,
        }));
        setLogs(parsedLogs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const downloadLogs = () => {
    const logText = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deployment-${deploymentId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelColors = {
    info: 'text-gray-300',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  const isLiveDeployment = ['QUEUED', 'BUILDING', 'DEPLOYING'].includes(status);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="font-medium text-sm">Build Logs</span>
          {isLiveDeployment && (
            <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-500' : 'text-yellow-500'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isLiveDeployment && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
          >
            <ArrowDown className={`h-3 w-3 ${autoScroll ? 'text-primary' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={downloadLogs}
            title="Download logs"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Log container */}
      <div
        ref={logContainerRef}
        className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {isLiveDeployment ? 'Waiting for logs...' : 'No logs available'}
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
              <span className="text-gray-600 select-none shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={levelColors[log.level]}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Progress bar for active deployments */}
      {isLiveDeployment && logs.length > 0 && (
        <div className="space-y-1">
          {logs[logs.length - 1]?.step && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Step: {logs[logs.length - 1].step}
              </span>
              {logs[logs.length - 1]?.progress !== undefined && (
                <span>{logs[logs.length - 1].progress}%</span>
              )}
            </div>
          )}
          {logs[logs.length - 1]?.progress !== undefined && (
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${logs[logs.length - 1].progress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
