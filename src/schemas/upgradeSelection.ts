import { z } from 'zod';
import type { UpgradeSelectionSubmission } from '../types/upgradeSelection';

const selectionTypeSchema = z.enum([
  'upgrade_new_account',
  'upgrade_own_account',
]);

const submissionSchema = z
  .object({
    selection_type: selectionTypeSchema,
    account_identifier: z.string().max(200).optional().nullable(),
    credentials: z.string().max(5000).optional().nullable(),
    manual_monthly_acknowledged: z.boolean().optional(),
  })
  .strict();

export function validateUpgradeSelectionSubmission(data: unknown):
  | { success: true; data: UpgradeSelectionSubmission }
  | {
      success: false;
      error: { message: string; details: string; code: string };
      details?: z.ZodIssue[];
    } {
  try {
    const validated = submissionSchema.parse(data);
    const sanitized: UpgradeSelectionSubmission = {
      selection_type: validated.selection_type,
      ...(validated.account_identifier !== undefined
        ? { account_identifier: validated.account_identifier }
        : {}),
      ...(validated.credentials !== undefined
        ? { credentials: validated.credentials }
        : {}),
      ...(validated.manual_monthly_acknowledged !== undefined
        ? { manual_monthly_acknowledged: validated.manual_monthly_acknowledged }
        : {}),
    };
    return { success: true, data: sanitized };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return {
        success: false,
        error: {
          message: 'Validation failed',
          details,
          code: 'VALIDATION_ERROR',
        },
        details: error.issues,
      };
    }
    return {
      success: false,
      error: {
        message: 'Unexpected validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_ERROR',
      },
    };
  }
}
