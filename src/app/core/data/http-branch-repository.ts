import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, retry, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Branch } from '../models/branch.model';
import { Notice } from '../models/notice.model';
import { Clock } from '../services/clock';
import { BranchRepository } from './branch-repository';
import { resolveNotices } from './resolve-notices';

@Injectable()
export class HttpBranchRepository extends BranchRepository {
  private readonly http = inject(HttpClient);
  private readonly clock = inject(Clock);
  private readonly base = environment.apiBaseUrl;

  private cached$?: Observable<Branch[]>;

  getAll(): Observable<Branch[]> {
    // Cached for the session. A failure is NOT cached: the stream is dropped so Retry refetches.
    this.cached$ ??= forkJoin({
      branches: this.http.get<Branch[]>(`${this.base}/branches.json`).pipe(retry(1)),
      // notices are optional: a missing/failed notices file must not take the whole locator down
      notices: this.http.get<Notice[]>(`${this.base}/notices.json`).pipe(
        retry(1),
        catchError(() => of([] as Notice[])),
      ),
    }).pipe(
      map(({ branches, notices }) => resolveNotices(branches, notices, this.clock.today())),
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((err) => {
        this.cached$ = undefined;
        throw err;
      }),
    );
    return this.cached$;
  }
}
