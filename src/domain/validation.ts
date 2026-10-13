export type ValidatedField = 'url' | 'title' | 'text' | 'note' | 'tags';

export type ValidationCode =
  'required' | 'too_long' | 'too_many' | 'invalid_url' | 'unsupported_url';

/** A user-facing problem with one field of a research item. */
export type ValidationIssue = {
  field: ValidatedField;
  code: ValidationCode;
  message: string;
};

export const LIMITS = {
  urlLength: 8_192,
  titleLength: 500,
  highlightLength: 20_000,
  noteLength: 10_000,
  tagCount: 20,
  tagLength: 40,
} as const;

export function issue(
  field: ValidatedField,
  code: ValidationCode,
  message: string,
): ValidationIssue {
  return { field, code, message };
}

export function checkMaxLength(
  field: ValidatedField,
  value: string,
  max: number,
  label: string,
): ValidationIssue[] {
  return value.length > max
    ? [
        issue(
          field,
          'too_long',
          `${label} is too long (maximum ${max.toLocaleString('en')} characters).`,
        ),
      ]
    : [];
}
