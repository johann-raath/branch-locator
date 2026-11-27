import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { BranchRepository } from './core/data/branch-repository';
import { HttpBranchRepository } from './core/data/http-branch-repository';
import { devLatencyInterceptor } from './core/interceptors/dev-latency.interceptor';
import { Clock, createClock } from './core/services/clock';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors(environment.simulateLatency ? [devLatencyInterceptor] : [])),
    {
      provide: Clock,
      useFactory: () => createClock(window.location.search, environment.allowClockOverride),
    },
    { provide: BranchRepository, useClass: HttpBranchRepository },
    // offline support; sw.js wraps Angular's worker (production builds only)
    provideServiceWorker('sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:5000',
    }),
  ],
};
