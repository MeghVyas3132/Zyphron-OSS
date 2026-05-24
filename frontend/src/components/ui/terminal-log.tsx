'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Copy, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LogLine {
  id: string;
  timestamp: string;
  message: string;
  level: 'info' | 'error' | 'warn' | 'success' | 'step';
  step?: string;
  progress?: number;
}

interface TerminalLogProps {
  logs: LogLine[];
  connected?: boolean;
  title?: string;
  className?: string;
  maxHeight?: string;
}

const levelStyles: Record<LogLine['level'], string> = {
  info:    'text-foreground/70',
  error:   'text-red-400',
  warn:    'text-yellow-400',
  success: 'text-foreground',
  step:    'text-foreground/90 font-medium',
};

const levelPrefix: Record<LogLine['level'], string> = {
  info:    '│',
  error:   '✕',
  warn:    '⚠',
  success: '✓',
  step:    '›',
};

export function TerminalLog({ logs, connected, title = 'Build Logs', className, maxHeight = '480px' }: TerminalLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 64);
  }, []);

  const copyLogs = async () => {
    const text = logs.map(l => `[${l.timestamp}] ${l.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  };

  return (
    <div className={cn('premium-panel overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/60">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-foreground/60" />
          <span className="text-sm font-medium">{title}</span>
          {connected !== undefined && (
            <span className={cn(
              'ml-2 flex items-center gap-1.5 text-xs',
              connected ? 'text-foreground/60' : 'text-foreground/30'
            )}>
              <span className={cn(
                'size-1.5 rounded-full',
                connected ? 'bg-foreground/70 animate-pulse' : 'bg-foreground/25'
              )} />
              {connected ? 'streaming' : 'disconnected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!autoScroll && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={scrollToBottom}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLogs}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Log body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto font-mono text-xs leading-relaxed scrollbar-hide bg-[hsl(var(--card)/0.4)]"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-foreground/30 gap-3">
            <Terminal className="h-8 w-8" />
            <span>Waiting for logs…</span>
          </div>
        ) : (
          <div className="p-4 space-y-px">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="flex gap-3 py-0.5 group"
                >
                  <span className="text-foreground/25 select-none shrink-0 w-[70px] text-right">
                    {log.timestamp}
                  </span>
                  <span className={cn('shrink-0 w-4 text-center', levelStyles[log.level])}>
                    {levelPrefix[log.level]}
                  </span>
                  {log.step && (
                    <span className="text-foreground/50 shrink-0">[{log.step}]</span>
                  )}
                  {log.progress !== undefined && (
                    <span className="text-foreground/50 shrink-0">{log.progress}%</span>
                  )}
                  <span className={cn('break-all', levelStyles[log.level])}>
                    {log.message}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Progress bar — visible when a step has progress */}
      {logs.length > 0 && logs[logs.length - 1]?.progress !== undefined && (
        <div className="h-0.5 bg-foreground/5">
          <motion.div
            className="h-full bg-foreground/50"
            initial={{ width: 0 }}
            animate={{ width: `${logs[logs.length - 1].progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      )}
    </div>
  );
}
