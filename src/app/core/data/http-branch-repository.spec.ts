import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { assert, beforeEach, describe, it } from 'vitest';
import { Branch } from '../models/branch.model';
import { Clock, FixedClock } from '../services/clock';
import { at, makeBranch } from '../testing/fixtures';
import { BranchRepository } from './branch-repository';
import { HttpBranchRepository } from './http-branch-repository';

describe('HttpBranchRepository', () => {
  let repo: BranchRepository;
  let http: HttpTestingController;
  const branches: Branch[] = [makeBranch({ id: 'b1' })];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Clock, useValue: new FixedClock(at('2026-11-24T10:00'), false) },
        { provide: BranchRepository, useClass: HttpBranchRepository },
      ],
    });
    repo = TestBed.inject(BranchRepository);
    http = TestBed.inject(HttpTestingController);
  });

  const branchesReq = () => http.expectOne('/api/branches.json');
  const noticesReq = () => http.expectOne('/api/notices.json');

  it('success: loads branches and resolves notices against the clock', async () => {
    const result = firstValueFrom(repo.getAll());
    branchesReq().flush(branches);
    noticesReq().flush([
      {
        kind: 'temporarily-closed',
        branchId: 'b1',
        fromOffsetDays: 0,
        toOffsetDays: 1,
        reason: 'Upgrade',
      },
    ]);
    const [b] = await result;
    assert.deepEqual(b!.status, {
      kind: 'temporarily-closed',
      reason: 'Upgrade',
      until: '2026-11-25',
    });
  });

  it('caches: a second subscription makes no new requests', async () => {
    const first = firstValueFrom(repo.getAll());
    branchesReq().flush(branches);
    noticesReq().flush([]);
    await first;
    await firstValueFrom(repo.getAll());
    http.expectNone('/api/branches.json');
  });

  it('retries once on a network error, then succeeds', async () => {
    const result = firstValueFrom(repo.getAll());
    noticesReq().flush([]);
    branchesReq().error(new ProgressEvent('error'));
    branchesReq().flush(branches); // the single retry
    assert.lengthOf(await result, 1);
  });

  it('retries once, then surfaces the error; a later call tries again', async () => {
    const failed = firstValueFrom(repo.getAll()).then(
      () => 'ok',
      () => 'error',
    );
    noticesReq().flush([]);
    branchesReq().error(new ProgressEvent('error'));
    branchesReq().error(new ProgressEvent('error'));
    assert.equal(await failed, 'error');
    http.verify();

    // the failure was not cached: Retry fetches again
    const again = firstValueFrom(repo.getAll());
    branchesReq().flush(branches);
    noticesReq().flush([]);
    assert.lengthOf(await again, 1);
  });

  it('a failing notices file does not break loading', async () => {
    const result = firstValueFrom(repo.getAll());
    branchesReq().flush(branches);
    noticesReq().error(new ProgressEvent('error'));
    noticesReq().error(new ProgressEvent('error')); // its own retry
    assert.lengthOf(await result, 1);
  });
});
