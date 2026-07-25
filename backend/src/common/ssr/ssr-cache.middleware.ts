import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

/**
 * PERF-107: Server-side rendering optimization for critical pages.
 * In-memory SSR response cache with TTL to avoid redundant re-renders
 * for public, non-personalised pages (home, leaderboard, word-of-the-day).
 *
 * This middleware is designed to be mounted on the Next.js server handler
 * or used as a NestJS proxy layer for SSR routes.
 */

interface CacheEntry {
  body: string;
  headers: Record<string, string | string[]>;
  status: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000; // 60 seconds

@Injectable()
export class SsrCacheMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Only cache GET requests for public SSR pages
    if (req.method !== 'GET') return next();
    const cacheable = ['/leaderboard', '/about'].some((p) => req.path.startsWith(p));
    if (!cacheable) return next();

    const key = createHash('sha256').update(req.url).digest('hex');
    const entry = cache.get(key);

    if (entry && entry.expiresAt > Date.now()) {
      res.set(entry.headers as Record<string, string>);
      res.set('X-Cache', 'HIT');
      res.status(entry.status).send(entry.body);
      return;
    }

    // Intercept the response to store it
    const chunks: Buffer[] = [];
    const originalWrite = res.write.bind(res) as typeof res.write;
    const originalEnd = res.end.bind(res) as typeof res.end;

    res.write = (...args: Parameters<typeof res.write>): boolean => {
      if (args[0]) chunks.push(Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0] as string));
      return originalWrite(...args);
    };

    res.end = (...args: Parameters<typeof res.end>): Response => {
      if (args[0]) chunks.push(Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0] as string));
      if (res.statusCode < 400) {
        const headers: Record<string, string | string[]> = {};
        ['content-type', 'cache-control', 'vary'].forEach((h) => {
          const v = res.getHeader(h);
          if (v) headers[h] = v as string | string[];
        });
        cache.set(key, {
          body: Buffer.concat(chunks).toString(),
          headers,
          status: res.statusCode,
          expiresAt: Date.now() + DEFAULT_TTL_MS,
        });
      }
      res.set('X-Cache', 'MISS');
      return originalEnd(...args);
    };

    next();
  }
}