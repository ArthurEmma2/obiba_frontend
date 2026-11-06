import operations from './operations.json';
import type { OperationName, OperationResults, OperationVariables } from './types';

const DOCUMENTS = operations as Record<OperationName, string>;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly field: string | null = null,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export interface TokenSource {
  idToken(forceRefresh?: boolean): Promise<string | null>;
}

export interface ApiClientOptions {
  url: string;
  tokens: TokenSource;
  sendQueryText: boolean;
  fetchImpl?: typeof fetch;
}

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface ApiClient {
  request<N extends OperationName>(name: N, variables?: OperationVariables[N], init?: { signal?: AbortSignal }): Promise<OperationResults[N]>;
  subscribe<N extends OperationName>(name: N, onData: (data: OperationResults[N]) => void, onState?: (state: StreamState) => void): () => void;
}

const hashes = new Map<OperationName, Promise<string>>();

export function operationDocument(name: OperationName): string {
  const doc = DOCUMENTS[name];
  if (!doc) throw new Error(`Unknown operation ${name}`);
  return doc;
}

export function operationHash(name: OperationName): Promise<string> {
  let h = hashes.get(name);
  if (!h) {
    h = crypto.subtle.digest('SHA-256', new TextEncoder().encode(operationDocument(name))).then((buf) =>
      Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(''),
    );
    hashes.set(name, h);
  }
  return h;
}

const MUTATION = /^\s*mutation\b/;

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string; extensions?: { code?: string; field?: string } }>;
}

function firstError(body: GraphQLResponse<unknown>): ApiError | null {
  const e = body.errors?.[0];
  if (!e) return null;
  const code = e.extensions?.code;
  if (typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code)) return new ApiError(code, e.extensions?.field ?? null, e.message);
  if (e.message === 'PersistedQueryNotFound') return new ApiError('OPERATION_NOT_ALLOWED');
  return new ApiError('UNKNOWN');
}

async function body(name: OperationName, variables: unknown, sendQueryText: boolean): Promise<string> {
  const payload: Record<string, unknown> = {
    operationName: name,
    variables: variables ?? {},
    extensions: { persistedQuery: { version: 1, sha256Hash: await operationHash(name) } },
  };
  if (sendQueryText) payload.query = operationDocument(name);
  return JSON.stringify(payload);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function attempt<N extends OperationName>(name: N, variables: unknown, token: string | null, signal?: AbortSignal): Promise<OperationResults[N]> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/graphql-response+json, application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await doFetch(options.url, {
        method: 'POST',
        headers,
        body: await body(name, variables, options.sendQueryText),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      throw new ApiError('NETWORK');
    }
    let parsed: GraphQLResponse<OperationResults[N]>;
    try {
      parsed = (await res.json()) as GraphQLResponse<OperationResults[N]>;
    } catch {
      throw new ApiError(res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'SERVICE_PAUSED' : 'UNKNOWN');
    }
    const error = firstError(parsed);
    if (error) throw error;
    if (!parsed.data) throw new ApiError('UNKNOWN');
    return parsed.data;
  }

  async function request<N extends OperationName>(name: N, variables?: OperationVariables[N], init: { signal?: AbortSignal } = {}): Promise<OperationResults[N]> {
    const isMutation = MUTATION.test(operationDocument(name));
    const token = await options.tokens.idToken(false);
    try {
      return await attempt<N>(name, variables, token, init.signal);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED' && token) {
        const fresh = await options.tokens.idToken(true);
        if (fresh && fresh !== token) return attempt<N>(name, variables, fresh, init.signal);
      }
      if (err instanceof ApiError && err.code === 'NETWORK' && !isMutation && !init.signal?.aborted) {
        await new Promise((r) => setTimeout(r, 600));
        return attempt<N>(name, variables, await options.tokens.idToken(false), init.signal);
      }
      throw err;
    }
  }

  function subscribe<N extends OperationName>(name: N, onData: (data: OperationResults[N]) => void, onState?: (state: StreamState) => void): () => void {
    const controller = new AbortController();
    let attemptNo = 0;
    const report = (s: StreamState) => onState?.(s);

    async function run(): Promise<void> {
      while (!controller.signal.aborted) {
        report(attemptNo === 0 ? 'connecting' : 'reconnecting');
        try {
          const token = await options.tokens.idToken(attemptNo > 0);
          const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream' };
          if (token) headers.authorization = `Bearer ${token}`;
          const res = await doFetch(options.url, {
            method: 'POST',
            headers,
            body: await body(name, {}, options.sendQueryText),
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          });
          if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) throw new ApiError('STREAM_UNAVAILABLE');
          report('live');
          attemptNo = 0;
          await readEvents(res.body, controller.signal, (event, data) => {
            if (event !== 'next') return;
            try {
              const parsed = JSON.parse(data) as GraphQLResponse<OperationResults[N]>;
              if (parsed.data) onData(parsed.data);
            } catch {
              return;
            }
          });
        } catch {
          if (controller.signal.aborted) break;
        }
        attemptNo += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attemptNo, 5)) * (0.75 + Math.random() * 0.5);
        report('reconnecting');
        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, delay);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(id);
            resolve();
          }, { once: true });
        });
      }
      report('closed');
    }

    void run();
    return () => controller.abort();
  }

  return { request, subscribe };
}

export async function readEvents(stream: ReadableStream<Uint8Array>, signal: AbortSignal, onEvent: (event: string, data: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  const abort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line === '') {
          if (data.length) onEvent(event, data.join('\n'));
          event = 'message';
          data = [];
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const i = line.indexOf(':');
          const field = i < 0 ? line : line.slice(0, i);
          const val = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
          if (field === 'event') event = val;
          else if (field === 'data') data.push(val);
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
