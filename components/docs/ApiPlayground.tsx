'use client';
import { useState, useEffect } from 'react';
import { Play, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface OpenApiSpec {
  paths: Record<string, Record<string, EndpointSpec>>;
  components: {
    schemas: Record<string, unknown>;
  };
}

interface EndpointSpec {
  summary?: string;
  description?: string;
  tags?: string[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: Record<string, unknown> }>;
  };
  parameters?: Array<{
    name: string;
    in: string;
    description?: string;
    required?: boolean;
    schema: Record<string, unknown>;
  }>;
  responses: Record<string, { description: string; content?: Record<string, unknown> }>;
}

const BASE_URL = 'https://stellar-intel.vercel.app';

function getDefaultBody(schema: Record<string, unknown>): Record<string, string> {
  if (schema.properties) {
    const props = schema.properties as Record<string, { type?: string; example?: string }>;
    const result: Record<string, string> = {};
    for (const [key] of Object.entries(props)) {
      if (key === 'type') result[key] = 'offramp';
      else if (key === 'sourceAsset') result[key] = 'USDC';
      else if (key === 'destinationAsset') result[key] = 'NGN';
      else if (key === 'amount') result[key] = '100';
      else if (key === 'sender') result[key] = 'GABC…';
      else if (key === 'recipient') result[key] = 'GBDEST…';
      else if (key === 'anchorId') result[key] = 'cowrie';
      else if (key === 'corridorId') result[key] = 'usdc-ngn';
      else if (key === 'publicKey') result[key] = 'GABC…';
      else if (key === 'intentHash') result[key] = 'abc123…';
      else if (key === 'signature') result[key] = 'base64-signature…';
      else if (key === 'reason') result[key] = 'Sample dispute reason';
      else if (key === 'corridor') result[key] = 'usdc-ngn';
      else if (key === 'amount') result[key] = '100';
      else if (key === 'action') result[key] = 'accept';
      else result[key] = `sample-${key}`;
    }
    return result;
  }
  return {};
}

function EndpointCard({
  method,
  path,
  spec,
}: {
  method: string;
  path: string;
  spec: EndpointSpec;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTryIt, setShowTryIt] = useState(false);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<{ status: number; data: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methodColors: Record<string, string> = {
    get: 'bg-green-600',
    post: 'bg-blue-600',
    put: 'bg-orange-600',
    delete: 'bg-red-600',
    patch: 'bg-purple-600',
  };

  const hasBody = method === 'post' || method === 'put' || method === 'patch';

  useEffect(() => {
    if (showTryIt && spec.requestBody) {
      const schema = spec.requestBody.content['application/json']?.schema as Record<string, unknown>;
      if (schema) {
        setBody(JSON.stringify(getDefaultBody(schema), null, 2));
      }
    }
  }, [showTryIt, spec.requestBody]);

  const handleTryIt = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      let parsedBody: unknown;
      if (hasBody && body) {
        parsedBody = JSON.parse(body);
      }

      const pathParams = path.match(/\{(\w+)\}/g) || [];
      let resolvedPath = path;
      for (const param of pathParams) {
        const paramName = param.slice(1, -1);
        const val = prompt(`Enter ${paramName}:`, paramName === 'corridor' ? 'usdc-ngn' : paramName === 'anchor' ? 'cowrie' : '');
        if (val) resolvedPath = resolvedPath.replace(param, val);
      }

      const url = `${BASE_URL}${resolvedPath}`;
      const init: RequestInit = { method: method.toUpperCase() };
      if (hasBody) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(parsedBody);
      }
      const res = await fetch(url, init);

      const text = await res.text();
      let formatted: string;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        formatted = text;
      }

      setResponse({ status: res.status, data: formatted });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle transition-colors"
      >
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold text-white ${methodColors[method] || 'bg-gray-600'}`}
        >
          {method.toUpperCase()}
        </span>
        <span className="font-mono text-sm text-primary-text">{path}</span>
        <span className="ml-auto text-xs text-secondary-text">{spec.summary}</span>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-secondary-text" /> : <ChevronRight className="h-4 w-4 shrink-0 text-secondary-text" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {spec.description && (
            <p className="text-sm text-secondary-text">{spec.description}</p>
          )}

          {spec.parameters && spec.parameters.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-secondary-text">Parameters</h4>
              <div className="space-y-1">
                {spec.parameters.map((param) => (
                  <div key={param.name} className="flex gap-2 text-xs">
                    <span className="font-mono text-accent">{param.name}</span>
                    <span className="text-secondary-text">{String((param.schema as { type?: string }).type ?? 'string')}</span>
                    {param.required && <span className="text-red-500">required</span>}
                    {param.description && <span className="text-secondary-text">— {param.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTryIt(!showTryIt)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
              >
                <Play className="h-3 w-3" />
                {showTryIt ? 'Hide' : 'Try it'}
              </button>
              <span className="text-xs text-secondary-text">
                Requests go to <code className="text-accent">{BASE_URL}</code>
              </span>
            </div>

            {showTryIt && (
              <div className="mt-4 space-y-3">
                {hasBody && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-secondary-text">Request Body</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="w-full rounded-lg border border-border bg-gray-950 p-3 font-mono text-xs text-gray-100"
                      rows={8}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTryIt}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {loading ? 'Sending…' : 'Send Request'}
                </button>

                {error && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                  </div>
                )}

                {response && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-secondary-text">Response:</span>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        response.status < 400 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {response.status}
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-gray-950 p-3 text-xs text-gray-100">
                      <code>{response.data}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-secondary-text">Responses</h4>
            <div className="space-y-1">
              {Object.entries(spec.responses).map(([code, resp]) => (
                <div key={code} className="flex gap-2 text-xs">
                  <span className="font-mono text-accent">{code}</span>
                  <span className="text-secondary-text">{resp.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiPlayground() {
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/openapi.json')
      .then((r) => r.json())
      .then(setSpec)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
        Failed to load API spec: {error}
      </div>
    );
  }

  // Group endpoints by tag
  const grouped: Record<string, Array<{ method: string; path: string; spec: EndpointSpec }>> = {};
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, endpoint] of Object.entries(methods)) {
      const tag = (endpoint.tags && endpoint.tags[0]) || 'Other';
      if (!grouped[tag]) grouped[tag] = [];
      grouped[tag].push({ method, path, spec: endpoint });
    }
  }

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([tag, endpoints]) => (
        <section key={tag}>
          <h2 className="mb-4 text-xl font-semibold text-primary-text">{tag}</h2>
          <div className="space-y-2">
            {endpoints.map(({ method, path, spec: endpoint }) => (
              <EndpointCard key={`${method}-${path}`} method={method} path={path} spec={endpoint} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
