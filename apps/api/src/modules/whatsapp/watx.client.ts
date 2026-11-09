import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';

const BASE_URL = 'https://app.watx.in/api/v1';
const TIMEOUT_MS = 10_000;
/** The language every template was approved in (Meta matches it exactly: en_US and en are different). */
const LANGUAGE = 'en_US';

/** Thin client for WATX's WhatsApp Business API (server-side only: the API key never reaches the apps). */
@Injectable()
export class WatxClient {
  private readonly logger = new Logger(WatxClient.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get isEnabled(): boolean {
    return this.env.watx.apiKey.length > 0;
  }

  /** Login codes: [send], but a failure is a 503 the apps show. */
  async sendTemplate(to: string, name: string, params: string[]): Promise<void> {
    if ((await this.send(to, name, params)) !== null) throw new ServiceUnavailableException("Couldn't send the code on WhatsApp. Please try again");
  }

  /**
   * POST /messages: the approved template [name] to [to] (+91…), its body [params] in order. Null when WATX took it,
   * else why not (WATX's `error.message`, e.g. Meta's reason, or the network error). Never throws.
   */
  async send(to: string, name: string, params: string[]): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.env.watx.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ to, type: 'template', template: { name, language: LANGUAGE, params } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      this.logger.warn(`WATX ${name} failed: ${(e as Error).message}`);
      return `WhatsApp couldn't be reached: ${(e as Error).message}`;
    }
    if (res.ok) return null;
    const text = await res.text();
    this.logger.warn(`WATX ${name} → ${res.status}: ${text.slice(0, 300)}`);
    return WatxClient.reason(res.status, text);
  }

  /** WATX's error envelope `{error: {code, message}}` as one line, else the status. */
  static reason(status: number, body: string): string {
    try {
      const message = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message;
      if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 300);
    } catch {
      // Not JSON: the status says enough.
    }
    return `WATX answered ${status}`;
  }
}
