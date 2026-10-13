// BOLA (Broken Object Level Authorization) qorunması — OWASP API Security Top 10 #1.
// Qayda: resurs yoxdursa → 404, var amma başqasınındırsa → 403.
import { ApiError, forbidden } from '../errors.js';
import type { AuthContext } from '../types.js';

export function assertFound<T>(resource: T | undefined | null, code: string, message: string): T {
  if (resource === undefined || resource === null) throw new ApiError(404, code, message);
  return resource;
}

export function assertOwner(ownerId: number, auth: AuthContext | undefined): void {
  if (!auth || auth.userId !== ownerId) throw forbidden();
}

// Ən çox istifadə olunan forma: tap + sahibini yoxla.
export function loadOwned<T extends { owner_id: number }>(
  resource: T | undefined,
  auth: AuthContext | undefined,
  notFoundCode: string,
  notFoundMessage: string,
): T {
  const found = assertFound(resource, notFoundCode, notFoundMessage);
  assertOwner(found.owner_id, auth);
  return found;
}
