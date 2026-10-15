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

  /** POST /messages: the approved template [name] to [to] (+91…), its body [params] in order. 503 when it fails. */
  async sendTemplate(to: string, name: string, params: string[]): Promise<void> {
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
      throw new ServiceUnavailableException("Couldn't send the code on WhatsApp. Please try again");
    }
    if (res.ok) return;
    this.logger.warn(`WATX ${name} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new ServiceUnavailableException("Couldn't send the code on WhatsApp. Please try again");
  }
}
