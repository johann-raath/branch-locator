import { Observable } from 'rxjs';
import { Branch } from '../models/branch.model';

/**
 * Components depend on this, never on HttpClient. A real Capitec or .NET API is a new implementation
 * provided for this class in app.config.ts; no component changes.
 */
export abstract class BranchRepository {
  /** All branches, with date-relative notices already resolved against the app Clock. Cached. */
  abstract getAll(): Observable<Branch[]>;
}
