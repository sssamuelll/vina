/**
 * Suggestions Module
 *
 * Provides intelligent suggestions based on context and user behavior.
 *
 * @module suggestions
 */

export {
  // Types
  type SuggestionType,
  type SuggestionPriority,
  type Suggestion,
  type SuggestionAction,
  type SuggestionContext,
  type SuggestionOptions,
  // Functions
  buildSuggestionContext,
  generateSuggestions,
  searchSuggestions,
  getSuggestionsByCategory,
  getQuickActions,
} from './suggestionEngine';
