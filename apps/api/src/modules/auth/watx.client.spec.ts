import { Logger } from '@nestjs/common';

import type { Env } from '../../core/config/env.js';
import { WatxClient } from './watx.client.js';

const client = (apiKey = 'watx_test'): WatxClient => new WatxClient({ watx: { apiKey } } as unknown as Env);

describe('WatxClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is off without an API key', () => {
    expect(client('').isEnabled).toBe(false);
    expect(client().isEnabled).toBe(true);
  });

  it('posts the template message WATX expects, with the key as a bearer token', async () => {
    const fetch = vi.fn(async () => new Response('{"id":"m-1"}', { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    await client().sendTemplate('+919000000001', 'login_otp_driver', ['123456']);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://app.watx.in/api/v1/messages');
    expect(init.headers.authorization).toBe('Bearer watx_test');
    expect(JSON.parse(init.body)).toEqual({
      to: '+919000000001',
      type: 'template',
      template: { name: 'login_otp_driver', language: 'en_US', params: ['123456'] },
    });
  });

  it('a refused or failed send is a 503', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"template not found"}', { status: 400 })));
    await expect(client().sendTemplate('+919000000001', 'nope', ['1'])).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))));
    await expect(client().sendTemplate('+919000000001', 'login_otp_driver', ['1'])).rejects.toMatchObject({ status: 503 });
  });
});
