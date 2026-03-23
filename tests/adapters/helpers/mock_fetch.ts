/**
 * Lightweight fetch interceptor for adapter tests.
 * Records outbound requests and returns canned responses.
 */

export interface MockRoute {
  /** URL substring or regex to match */
  match: string | RegExp;
  /** HTTP method (default: any) */
  method?: string;
  /** Response status code */
  status?: number;
  /** Response body (JSON-serializable) */
  body?: unknown;
  /** Response headers */
  headers?: Record<string, string>;
  /** Raw text body (used instead of JSON body) */
  text?: string;
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Install a mock fetch that intercepts matching requests.
 * Returns helpers to inspect captured requests and restore the original fetch.
 */
export function installMockFetch(routes: MockRoute[]) {
  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();

    let bodyParsed: unknown = undefined;
    if (init?.body) {
      const raw = typeof init.body === 'string' ? init.body : init.body.toString();
      try {
        bodyParsed = JSON.parse(raw);
      } catch {
        bodyParsed = raw;
      }
    }

    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers;
      if (h instanceof Headers) {
        h.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        Object.assign(headers, h);
      }
    }

    captured.push({ url, method, headers, body: bodyParsed });

    const route = routes.find((r) => {
      const urlMatch = typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url);
      const methodMatch = !r.method || r.method.toUpperCase() === method;
      return urlMatch && methodMatch;
    });

    if (!route) {
      return new Response(JSON.stringify({ error: `No mock route for ${method} ${url}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = new Headers({ 'Content-Type': 'application/json', ...route.headers });
    const status = route.status ?? 200;
    // Null-body statuses (204, 304) cannot have a body in the Response constructor
    const isNullBody = status === 204 || status === 304;
    const responseBody = isNullBody ? null : (route.text ?? JSON.stringify(route.body ?? {}));

    return new Response(responseBody, {
      status,
      headers: responseHeaders,
    });
  }) as typeof fetch;

  return {
    captured,
    restore: () => { globalThis.fetch = originalFetch; },
    /** Get all captured requests matching a URL substring */
    requestsTo: (urlSubstring: string) => captured.filter((r) => r.url.includes(urlSubstring)),
  };
}
