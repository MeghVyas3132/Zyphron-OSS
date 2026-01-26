// ===========================================
// TYPE DECLARATIONS FOR EXTERNAL MODULES
// ===========================================

// WebSocket types
declare module 'ws' {
  export class WebSocket {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    
    readonly readyState: number;
    readonly bufferedAmount: number;
    
    onopen: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    
    constructor(url: string | URL, protocols?: string | string[]);
    
    close(code?: number, reason?: string): void;
    send(data: string | ArrayBuffer | Blob | ArrayBufferView): void;
    ping(data?: string | Buffer, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: string | Buffer, mask?: boolean, cb?: (err: Error) => void): void;
    terminate(): void;
    
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    
    once(event: string, listener: (...args: unknown[]) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
    
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }

  export class WebSocketServer {
    constructor(options?: { port?: number; host?: string; server?: unknown; noServer?: boolean; path?: string });
    
    on(event: 'connection', listener: (ws: WebSocket, request: unknown) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    
    close(cb?: (err?: Error) => void): void;
    clients: Set<WebSocket>;
  }

  export default WebSocket;
}
