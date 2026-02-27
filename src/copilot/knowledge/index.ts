/**
 * Knowledge Module
 *
 * Pattern-making domain knowledge and expertise.
 *
 * @module knowledge
 */

export {
  // Ease
  EASE_STANDARDS,
  getRecommendedEase,
  // Seam allowances
  SEAM_ALLOWANCES,
  getRecommendedSeamAllowance,
  // Grading
  GRADING_RULES,
  calculateGradedMeasurement,
  // Fabric
  FABRIC_PROPERTIES,
  getFabricEaseAdjustment,
  // Construction
  CONSTRUCTION_TECHNIQUES,
  // Industry standards
  INDUSTRY_STANDARDS,
  // Query
  type KnowledgeQuery,
  queryKnowledge,
} from './patternKnowledge';
