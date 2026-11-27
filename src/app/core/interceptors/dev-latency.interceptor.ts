import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { delay, mergeMap, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Development only (provided only when environment.simulateLatency is true).
 * Adds a random 300-900 ms delay and optionally fails requests, so skeletons and error states are visible.
 */
export const devLatencyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);
  const ms = 300 + Math.random() * 600;
  return of(null).pipe(
    delay(ms),
    mergeMap(() =>
      Math.random() < environment.simulateErrorRate
        ? throwError(
            () =>
              new HttpErrorResponse({ url: req.url, status: 503, statusText: 'Simulated failure' }),
          )
        : next(req),
    ),
  );
};
