import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('preserves binary favicon data, safe headers and owner authentication through the same-origin proxy', async () => {
  vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const upstream = new Response(image, {
headers: {
'content-type': 'image/png',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'",
      'cache-control': 'private, max-age=300', 'vary': 'Cookie, Authorization'
}
});
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(upstream);
  vi.stubGlobal('fetch', fetchMock);
  const request = new NextRequest('http://home.test/api/chat/conversations/chat/sources/source/favicon',
    { headers: { cookie: 'access_token=synthetic' } });
  const response = await GET(request, { params: Promise.resolve({ path: ['chat', 'conversations', 'chat', 'sources', 'source', 'favicon'] }) });
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
  expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie')).toBe('access_token=synthetic');
  expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/chat/conversations/chat/sources/source/favicon');
});
