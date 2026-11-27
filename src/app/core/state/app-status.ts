import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** Whether we are offline, and whether the service worker has a newer version waiting. */
@Injectable({ providedIn: 'root' })
export class AppStatus {
  readonly offline = signal(typeof navigator !== 'undefined' && navigator.onLine === false);
  readonly updateReady = signal(false);

  constructor() {
    const on = () => this.offline.set(false);
    const off = () => this.offline.set(true);
    addEventListener('online', on);
    addEventListener('offline', off);

    // absent in tests and when the service worker is off (dev server)
    const updates = inject(SwUpdate, { optional: true });
    const sub = updates?.isEnabled
      ? updates.versionUpdates.subscribe((e) => {
          if (e.type === 'VERSION_READY') this.updateReady.set(true);
        })
      : undefined;

    inject(DestroyRef).onDestroy(() => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
      sub?.unsubscribe();
    });
  }

  reload(): void {
    location.reload();
  }
}
