import type { RequestDefinition, RequestSection, RequestSectionKey } from './types'

export type { RequestSectionKey }

export function getRequestSections(definition: RequestDefinition): readonly RequestSection[] {
  return definition.sections
}
