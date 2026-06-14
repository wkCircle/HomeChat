import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'fs';

function detectDocker(): boolean {
  if (process.env.DOCKER === '1') return true;
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

function backendBase(): string {
  const fromEnv = process.env.BACKEND_INTERNAL_URL;
  if (fromEnv && fromEnv.startsWith('http')) return fromEnv.replace(/\/$/, '');
  return detectDocker() ? 'http://home_ai:8010' : 'http://localhost:8010';
}

async function proxy(
  req: NextRequest,
  paramsInput: { path?: string[] } | Promise<{ path?: string[] }>,
) {
  const params = await Promise.resolve(paramsInput);
  const base = backendBase();
  const segs = (params.path ?? []).map(encodeURIComponent).join('/');
  const search = req.nextUrl.search || '';
  const target = `${base}/api/${segs}${search}`;

  const headers = new Headers();
  // forward selected headers explicitly
  const incoming = req.headers;
  const ct = incoming.get('content-type');
  const cookie = incoming.get('cookie');
  const auth = incoming.get('authorization');
  if (ct) headers.set('content-type', ct);
  if (cookie) headers.set('cookie', cookie);
  if (auth) headers.set('authorization', auth);
  headers.set('x-forwarded-host', incoming.get('host') || '');

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.body, // streams for POST/PATCH/PUT
      redirect: 'manual',
      duplex: 'half', // hint for streaming bodies in Node 18+
    } as RequestInit);

    const respHeaders = new Headers();
    // pass through content-type and cache headers commonly used
    const pass = ['content-type', 'cache-control', 'pragma'];
    for (const k of pass) {
      const v = upstream.headers.get(k);
      if (v) respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api proxy] Network error', {
      method: req.method,
      path: `/${segs}${search}`,
      target,
      backend: base,
      error: msg,
    });
    return NextResponse.json({ error: 'Upstream connection failed', detail: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
export async function OPTIONS(req: NextRequest, ctx: { params: any }) {
  return proxy(req, ctx.params);
}
