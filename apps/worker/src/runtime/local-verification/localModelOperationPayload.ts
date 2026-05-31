// Local verification prompt/schema payload for Worker local model smoke runs.
// Authority: docs/contracts/operation-return-contract.md

import type { OperationGenerationProviderRequest } from '../../ai-operations/operationGenerationProviderFlow.ts';

export function createLocalModelOperationMessages(
  request: OperationGenerationProviderRequest,
): Array<{ role: 'system' | 'user'; content: string }> {
  const targetBlockIds = request.contextEnvelope.target.sourceBlockIds;
  return [
    {
      role: 'system',
      content: [
        'Return JSON only. Do not include markdown or commentary.',
        'Return an object with an operations array matching the provided schema.',
        'Never rewrite, delete, or mutate user-authored text.',
        'Prefer one create_semantic_unit operation when the target text has a clear claim, decision, question, or task.',
        'Use no_op only when no stable structure can be inferred.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        allowedOperations: ['create_semantic_unit', 'no_op'],
        requiredIds: {
          noteId: request.structureJob.noteId,
          targetSectionId: request.structureJob.sectionId ?? 'section_001',
          sourceBlockIds: targetBlockIds,
        },
        contextEnvelope: request.contextEnvelope,
      }),
    },
  ];
}

export const localModelOperationResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operations'],
  properties: {
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'targetSectionId', 'unitType', 'content', 'summary', 'sourceSpans', 'confidence'],
            properties: {
              type: { const: 'create_semantic_unit' },
              targetSectionId: { type: 'string', minLength: 1 },
              unitType: {
                type: 'string',
                enum: ['question', 'decision', 'claim', 'hypothesis', 'concern', 'concept', 'task', 'evidence'],
              },
              content: { type: 'string', minLength: 1 },
              summary: { type: 'string', minLength: 1 },
              sourceSpans: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['blockId'],
                  properties: {
                    blockId: { type: 'string', minLength: 1 },
                    startOffset: { type: 'number', minimum: 0 },
                    endOffset: { type: 'number', minimum: 0 },
                  },
                },
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'reason'],
            properties: {
              type: { const: 'no_op' },
              reason: { type: 'string', minLength: 1 },
            },
          },
        ],
      },
    },
  },
} as const;
