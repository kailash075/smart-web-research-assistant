import { z } from './zod';
import type { ResearchItem } from '@/domain/research-item';
import { normalizeTag } from '@/domain/tags';
import { parseSaveableUrl } from '@/domain/url';
import { LIMITS } from '@/domain/validation';

// Runtime checks for research items that come from outside the type system:
// browser storage today, imported backup files in Phase 4. Unknown keys are dropped.

const timestamp = z.iso.datetime();

const saveableUrl = z
  .string()
  .refine((value) => parseSaveableUrl(value).ok, { message: 'Must be an http(s) URL' });

const tag = z
  .string()
  .min(1)
  .max(LIMITS.tagLength)
  .refine((value) => normalizeTag(value) === value, { message: 'Tag is not normalised' });

const baseShape = {
  id: z.string().min(1).max(100),
  url: saveableUrl,
  pageTitle: z.string().min(1).max(LIMITS.titleLength),
  note: z.string().max(LIMITS.noteLength),
  tags: z
    .array(tag)
    .max(LIMITS.tagCount)
    .refine((tags) => new Set(tags).size === tags.length, { message: 'Tags must be unique' }),
  createdAt: timestamp,
  updatedAt: timestamp,
};

const pageItemSchema = z.object({ ...baseShape, kind: z.literal('page') });

const highlightItemSchema = z.object({
  ...baseShape,
  kind: z.literal('highlight'),
  text: z.string().min(1).max(LIMITS.highlightLength),
});

// The annotation makes TypeScript fail if the schema and the domain type drift apart.
export const researchItemSchema: z.ZodType<ResearchItem> = z.discriminatedUnion('kind', [
  pageItemSchema,
  highlightItemSchema,
]);
