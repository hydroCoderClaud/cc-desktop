import { describe, it, expect } from 'vitest'
import { ref, shallowRef } from 'vue'

import {
  createPendingGenerationDraft,
  buildDraftGenerationRequest,
  createOptimisticGenerationAchievement
} from '../../src/renderer/pages/notebook/utils/generation-draft.js'

describe('Notebook generation draft payload', () => {
  it('buildDraftGenerationRequest returns a cloneable payload from reactive draft state', () => {
    const draftState = ref(createPendingGenerationDraft({
      notebookId: 'nb-1',
      toolId: 'notes',
      sourceIds: ['src-1', 'src-2'],
      expectedAbsPath: '/tmp/output.md',
      prompt: 'generate something'
    }))

    const request = buildDraftGenerationRequest('nb-1', draftState.value)

    expect(request).toEqual({
      notebookId: 'nb-1',
      toolId: 'notes',
      sourceIds: ['src-1', 'src-2']
    })
    expect(() => structuredClone(request)).not.toThrow()
  })

  it('createPendingGenerationDraft keeps sourceIds cloneable inside shallow state', () => {
    const draftState = shallowRef(createPendingGenerationDraft({
      notebookId: 'nb-2',
      toolId: 'slides',
      sourceIds: ['src-a'],
      expectedAbsPath: '/tmp/output.pptx',
      prompt: 'make slides'
    }))

    expect(draftState.value.sourceIds).toEqual(['src-a'])
    expect(() => structuredClone(draftState.value)).not.toThrow()
  })

  it('createOptimisticGenerationAchievement creates a generating placeholder item', () => {
    const achievement = createOptimisticGenerationAchievement({
      achievementId: 'ach-1',
      toolId: 'notes',
      toolName: '笔记总结',
      outputType: 'md',
      expectedAbsPath: '/tmp/achievements/notes/result.md',
      sourceIds: ['src-1'],
      prompt: 'draft prompt'
    })

    expect(achievement.id).toBe('ach-1')
    expect(achievement.status).toBe('generating')
    expect(achievement.path).toBe('/tmp/achievements/notes/result.md')
    expect(achievement.sourceIds).toEqual(['src-1'])
    expect(() => structuredClone(achievement)).not.toThrow()
  })
})
