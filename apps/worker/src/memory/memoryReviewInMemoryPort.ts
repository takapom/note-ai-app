// In-memory port for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract, MemoryUserAction } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { transitionMemoryStatus, validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import {
  cloneMemory,
  memoryKey,
  readMemoryEditContent,
  validateMemoryReviewInput,
  validateReviewableMemory,
} from './memoryReviewHelpers.ts';
import type { MemoryReviewDecision, MemoryReviewInput, MemoryReviewPort, MemoryReviewRecord, MemoryReviewResult } from './memoryReviewTypes.ts';

export class InMemoryMemoryReviewPort implements MemoryReviewPort {
  private readonly memories = new Map<string, MemoryReviewRecord>();

  constructor(initialMemories: readonly MemoryItemContract[] = []) {
    for (const memory of initialMemories) {
      const errors = validateMemoryItem(memory);
      if (!errors.valid) {
        throw new Error(errors.errors.join('; '));
      }
      this.memories.set(memoryKey(memory.workspaceId, memory.userId, memory.id), cloneMemory(memory));
    }
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

  listMemories(): MemoryReviewRecord[] {
    return Array.from(this.memories.values(), cloneMemory);
  }

  private reviewMemory(
    input: MemoryReviewInput,
    action: MemoryUserAction,
    decision: MemoryReviewDecision,
  ): MemoryReviewResult {
    const inputErrors = validateMemoryReviewInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const workspaceId = input.workspaceId;
    const userId = input.userId as string;
    const memoryId = input.memoryId as string;
    const current = this.memories.get(memoryKey(workspaceId, userId, memoryId));
    if (current === undefined) {
      return {
        ok: false,
        errors: [`memory ${memoryId} was not found in workspace ${workspaceId} for user ${userId}`],
      };
    }
    if (current.workspaceId !== workspaceId || current.userId !== userId) {
      return {
        ok: false,
        errors: [`memory ${memoryId} does not belong to workspace ${workspaceId} and user ${userId}`],
      };
    }

    const reviewErrors = validateReviewableMemory(current);
    if (reviewErrors.length > 0) {
      return { ok: false, errors: reviewErrors };
    }

    let editedContent: string | undefined;
    if (action === 'edit') {
      const contentUpdate = readMemoryEditContent(input.body);
      if (!contentUpdate.ok) {
        return { ok: false, errors: contentUpdate.errors };
      }
      editedContent = contentUpdate.content;
    }

    const candidate = editedContent === undefined
      ? current
      : { ...current, content: editedContent };
    const transitioned = transitionMemoryStatus(candidate, action, input.now);
    const reviewed: MemoryReviewRecord = {
      ...transitioned,
      reviewedAt: input.now,
      reviewedByUserId: userId,
      reviewDecision: decision,
    };
    this.memories.set(memoryKey(workspaceId, userId, memoryId), cloneMemory(reviewed));

    return {
      ok: true,
      errors: [],
      body: {
        memory: cloneMemory(reviewed),
      },
    };
  }
}
