export {
  ProjectMemory,
  listProjectMemories,
  loadLongTermMemory,
  saveLongTermMemory,
  addLongTermDecision,
  setLongTermPreference,
  addLongTermNote,
  clearLongTermMemory,
  longTermMemoryToContext,
} from './ProjectMemory';

export type {
  CopilotMessage,
  CopilotDecision,
  CopilotLongTermMemory,
} from './ProjectMemory';
