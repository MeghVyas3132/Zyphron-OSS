// ===========================================
// KEY ROTATOR
// Cycles through multiple API keys for free-tier usage.
// On rate-limit (429), auto-rotates to the next key.
// ===========================================

import { createLogger } from '@/lib/logger.js';

const logger = createLogger('key-rotator');

export class KeyRotator {
  private keys: string[];
  private index: number = 0;
  private readonly name: string;

  constructor(keys: string[], name: string) {
    if (keys.length === 0) {
      // Don't crash — just warn. Service will be disabled.
      logger.warn({ name }, 'No API keys provided — service disabled');
    }
    this.keys = keys;
    this.name = name;
  }

  get current(): string {
    if (this.keys.length === 0) throw new Error(`No API keys configured for ${this.name}`);
    return this.keys[this.index];
  }

  rotate(): string {
    if (this.keys.length === 0) throw new Error(`No API keys configured for ${this.name}`);
    this.index = (this.index + 1) % this.keys.length;
    logger.debug({ name: this.name, index: this.index, total: this.keys.length }, 'Rotated to next key');
    return this.keys[this.index];
  }

  get available(): boolean {
    return this.keys.length > 0;
  }

  get count(): number {
    return this.keys.length;
  }

  // Execute fn with automatic key rotation on 429 / rate-limit errors
  async withRotation<T>(
    fn: (key: string) => Promise<T>,
    maxAttempts: number = this.keys.length
  ): Promise<T> {
    if (!this.available) throw new Error(`No API keys configured for ${this.name}`);

    let lastError: Error | null = null;
    const attempts = Math.min(maxAttempts, this.keys.length);

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await fn(this.current);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRateLimit = this.isRateLimitError(error);
        const isAuth = this.isAuthError(error);

        if (isRateLimit || isAuth) {
          logger.warn({
            name: this.name,
            attempt: attempt + 1,
            maxAttempts: attempts,
            isRateLimit,
            isAuth,
          }, 'Key failed — rotating');
          this.rotate();
        } else {
          // Non-rate-limit error: re-throw immediately
          throw error;
        }
      }
    }

    throw lastError || new Error(`All ${this.name} keys exhausted`);
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('rate limit') || msg.includes('429') || msg.includes('quota');
    }
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      return e['status'] === 429 || e['statusCode'] === 429;
    }
    return false;
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('invalid api key') || msg.includes('unauthorized') || msg.includes('401');
    }
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      return e['status'] === 401 || e['statusCode'] === 401;
    }
    return false;
  }
}

// Singleton rotators — initialized from config
import { config } from '@/config/index.js';

export const groqRotator = new KeyRotator(config.groq.keys, 'Groq');
export const resendRotator = new KeyRotator(config.resend.keys, 'Resend');
