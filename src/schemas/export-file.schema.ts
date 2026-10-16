import { z } from './zod';

// The JSON backup file written by "Export" and read by "Import":
//   { "format": "pagenest-export", "version": 1, "exportedAt": "…", "items": [ … ] }
// Each item uses the same shape as stored items (research-item.schema.ts). Bump
// EXPORT_VERSION when that shape changes, and teach the importer to convert old files.

export const EXPORT_FORMAT = 'pagenest-export';
/** The formats Import reads: files exported under the extension's earlier names still import. */
export const IMPORT_FORMATS = [EXPORT_FORMAT, 'clipwise-export', 'recall-export'] as const;
export const EXPORT_VERSION = 1;

/** The envelope only. Items are checked one by one so one bad entry does not block the rest. */
export const exportFileSchema = z.object({
  format: z.enum(IMPORT_FORMATS),
  version: z.number().int().positive(),
  exportedAt: z.iso.datetime().optional(),
  items: z.array(z.unknown()),
});

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  items: unknown[];
};
