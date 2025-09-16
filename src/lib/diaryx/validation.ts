import type { ZodIssue } from "zod";
import { DiaryxMetadataSchema } from "./schema";
import type { DiaryxMetadata, DiaryxValidationIssue } from "./types";

export interface ValidationResult {
  success: boolean;
  metadata?: DiaryxMetadata;
  issues: DiaryxValidationIssue[];
}

export const mapZodIssues = (issues: ZodIssue[]): DiaryxValidationIssue[] =>
  issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    issue,
  }));

export const validateDiaryxMetadata = (input: unknown): ValidationResult => {
  const parsed = DiaryxMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: mapZodIssues(parsed.error.issues),
    };
  }

  return {
    success: true,
    metadata: parsed.data,
    issues: [],
  };
};

