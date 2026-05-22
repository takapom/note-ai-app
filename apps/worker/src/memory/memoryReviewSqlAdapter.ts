// Turso-backed port for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import type { MemoryUserAction } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { transitionMemoryStatus } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import {
  cloneMemory,
  readMemoryEditContent,
  readRowsAffected,
  toPersistenceErrorMessage,
  validateMemoryReviewInput,
  validateReviewableMemory,
} from './memoryReviewHelpers.ts';
import { mapMemoryReviewRows } from './memoryReviewRowMapping.ts';
import { mapMemoryReviewContentUpdateToSql, mapMemoryReviewLookupToSql, mapMemoryReviewStatusUpdateToSql } from './memoryReviewSqlStatements.ts';
import type { MemoryReviewDecision, MemoryReviewInput, MemoryReviewPort, MemoryReviewRecord, MemoryReviewResult, MemoryReviewSqlExecutor } from './memoryReviewTypes.ts';

export class TursoMemoryReviewSqlAdapter implements MemoryReviewPort {
  private readonly executor: MemoryReviewSqlExecutor;

  constructor(input: { executor: MemoryReviewSqlExecutor }) {
    this.executor = input.executor;
  }

  async acceptMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'remember', 'accepted');
  }

  async rejectMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'different', 'rejected');
  }

  async editMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'edit', 'edited');
  }

  async deleteMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'delete', 'archived');
  }

  async holdMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'hold', 'held');
  }

  private async reviewMemory(
    input: MemoryReviewInput,
    action: MemoryUserAction,
    decision: MemoryReviewDecision,
  ): Promise<MemoryReviewResult> {
    const inputErrors = validateMemoryReviewInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }
    let editedContent: string | undefined;
    if (action === 'edit') {
      const contentUpdate = readMemoryEditContent(input.body);
      if (!contentUpdate.ok) {
        return { ok: false, errors: contentUpdate.errors };
      }
      editedContent = contentUpdate.content;
    }

    try {
      const rows = await this.executor.query(mapMemoryReviewLookupToSql(input));
      const loaded = mapMemoryReviewRows(rows, input);
      if (!loaded.ok) {
        return loaded;
      }

      const reviewErrors = validateReviewableMemory(loaded.memory);
      if (reviewErrors.length > 0) {
        return { ok: false, errors: reviewErrors };
      }

      const candidate = editedContent === undefined
        ? loaded.memory
        : { ...loaded.memory, content: editedContent };
      const transitioned = transitionMemoryStatus(candidate, action, input.now);
      const reviewed: MemoryReviewRecord = {
        ...transitioned,
        reviewedAt: input.now,
        reviewedByUserId: input.userId as string,
        reviewDecision: decision,
      };
      const statement = action === 'edit'
        ? mapMemoryReviewContentUpdateToSql(reviewed)
        : mapMemoryReviewStatusUpdateToSql(reviewed);
      const writeResult = await this.executor.write(statement);
      if (readRowsAffected(writeResult) === 0) {
        return {
          ok: false,
          errors: [`memory ${input.memoryId} was not updated as a reviewable candidate`],
        };
      }

      return {
        ok: true,
        errors: [],
        body: {
          memory: cloneMemory(reviewed),
        },
      };
    } catch (error) {
      return {
        ok: false,
        errors: [toPersistenceErrorMessage('memory review persistence failed', error)],
      };
    }
  }
}
