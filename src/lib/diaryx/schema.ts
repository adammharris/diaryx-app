import { z } from "zod";
import type { DiaryxMetadata } from "./types";

const rfc3339Regex =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)$/;

const stringOrArray = z.union([z.string(), z.array(z.string().min(1)).min(1)]);
const optionalStringOrArray = stringOrArray.optional();
const optionalBoolean = z.boolean().optional();

export const DiaryxMetadataSchema = z
  .object({
    title: z.string().min(1, "title is required"),
    author: z.union([
      z.string().min(1, "author is required"),
      z.array(z.string().min(1)).min(1, "author needs at least one item"),
    ]),
    created: z
      .string()
      .regex(rfc3339Regex, { message: "created must be RFC3339" }),
    updated: z
      .string()
      .regex(rfc3339Regex, { message: "updated must be RFC3339" }),
    visibility: stringOrArray,
    format: stringOrArray,
    reachable: stringOrArray,

    version: optionalStringOrArray,
    copying: optionalStringOrArray,
    contents: optionalStringOrArray,
    part_of: optionalStringOrArray,
    checksums: optionalStringOrArray,
    banner: z.string().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    this_file_is_root_index: optionalBoolean,
    starred: optionalBoolean,
    pinned: optionalBoolean,
  })
  .passthrough();

export type DiaryxMetadataInput = z.input<typeof DiaryxMetadataSchema>;

export const coerceMetadata = (data: unknown): DiaryxMetadata => {
  const parseResult = DiaryxMetadataSchema.safeParse(data);
  if (!parseResult.success) {
    throw parseResult.error;
  }
  return parseResult.data as DiaryxMetadata;
};

