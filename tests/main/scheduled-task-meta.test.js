import { describe, expect, it } from 'vitest'

import {
  createScheduledTaskFormDefaults,
  getScheduledTaskProfileModelIds,
  resolveScheduledTaskEffectiveModelId
} from '../../src/renderer/utils/scheduled-task-meta.js'

describe('scheduled-task-meta defaults', () => {
  it('creates defaults without task-level runtime fields', () => {
    expect(createScheduledTaskFormDefaults('C:/workspace')).toMatchObject({
      cwd: 'C:/workspace',
      sessionBindingMode: 'new',
      scheduleType: 'interval',
      intervalMinutes: 60
    })
  })

  it('uses the selected profile defaultModels instead of provider definitions', () => {
    const context = {
      apiProfiles: [
        {
          id: 'qwen-profile',
          selectedModelId: 'qwen3.7-max',
          defaultModels: ['qwen3.7-plus', 'qwen3.7-max', 'qwen3.7-plus']
        }
      ],
      defaultProfileId: 'qwen-profile',
      apiProfileId: 'qwen-profile',
      serviceProviderDefinitions: [
        {
          id: 'qwen',
          defaultModels: ['stale-provider-model']
        }
      ]
    }

    expect(getScheduledTaskProfileModelIds(context)).toEqual(['qwen3.7-plus', 'qwen3.7-max'])
    expect(resolveScheduledTaskEffectiveModelId(context)).toBe('qwen3.7-plus')
  })
})
