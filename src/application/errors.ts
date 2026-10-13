import type { ValidationIssue } from '@/domain/validation';
import type { StorageError } from './ports';

/** Why a use case failed, with a message that can be shown to the user as is. */
export type AppError =
  | { kind: 'invalid'; message: string; issues: readonly ValidationIssue[] }
  | { kind: 'not_found' | 'unsupported_page' | 'page_access' | 'storage'; message: string };

export function invalidInput(issues: readonly ValidationIssue[]): AppError {
  return { kind: 'invalid', message: issues.map((issue) => issue.message).join(' '), issues };
}

export function storageFailure(error: StorageError): AppError {
  return { kind: 'storage', message: error.message };
}
