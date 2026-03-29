import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/environment';
import { SuccessResponses } from '../utils/response';
import {
  resolveCountryFromHeaders,
  resolvePreferredCurrency,
} from '../utils/currency';
import { resolveCountryCodeFromRequestIp } from '../utils/countryFromIp';

export async function localeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const cookieCurrency = request.cookies?.['preferred_currency'];
    const headerCurrency = request.headers['x-currency'];
    const requestCountry =
      resolveCountryCodeFromRequestIp(request) ||
      resolveCountryFromHeaders(
        request.headers as Record<string, string | string[] | undefined>
      );

    const currency = resolvePreferredCurrency({
      queryCurrency: null,
      headerCurrency:
        typeof headerCurrency === 'string' ? headerCurrency : null,
      cookieCurrency:
        typeof cookieCurrency === 'string' ? cookieCurrency : null,
      headerCountry: requestCountry,
      fallback: 'USD',
    });

    reply.setCookie('preferred_currency', currency, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });

    return SuccessResponses.ok(reply, {
      currency,
      country: requestCountry,
    });
  });
}
