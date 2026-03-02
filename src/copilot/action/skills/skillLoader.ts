/**
 * Skill Loader — loads, matches, and formats pattern skills for the agent prompt.
 *
 * Provides trigger matching against user messages and formats matched skills
 * as structured context for injection into the LLM system prompt.
 *
 * @module skills/skillLoader
 */

import type { PatternSkill } from './types';
import { getDefaultSkillRegistry } from './skillRegistry';

/**
 * Load a skill by name from the default registry.
 *
 * @param name - Skill name (e.g. 'bodice', 'sleeve')
 * @returns The skill definition, or undefined if not found
 */
export function loadSkill(name: string): PatternSkill | undefined {
  const registry = getDefaultSkillRegistry();
  // Find skill by checking the nested skill.name property
  const all = registry.getAll();
  const found = all.find(rs => rs.skill.name === name);
  return found?.skill;
}

/**
 * Find all skills relevant to a user message by matching trigger phrases.
 *
 * Tokenizes the message and checks each word and multi-word phrase against
 * the trigger index. Returns unique skills sorted by match count (most
 * relevant first).
 *
 * @param message - The user's message text
 * @returns Array of matching skills (may be empty)
 */
export function getRelevantSkills(message: string): PatternSkill[] {
  const registry = getDefaultSkillRegistry();
  const normalized = message
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'()[\]{}]/g, '');

  const matchedSkills = new Map<string, { skill: PatternSkill; count: number }>();

  // Check triggers from all enabled skills
  const enabledSkills = registry.getEnabled();

  for (const registered of enabledSkills) {
    for (const trigger of registered.skill.triggers) {
      const triggerNorm = trigger.toLowerCase();
      if (normalized.includes(triggerNorm)) {
        const skill = registered.skill;
        const existing = matchedSkills.get(skill.name);
        if (existing) {
          existing.count++;
        } else {
          matchedSkills.set(skill.name, { skill, count: 1 });
        }
      }
    }
  }

  // Sort by match count descending
  return Array.from(matchedSkills.values())
    .sort((a, b) => b.count - a.count)
    .map(entry => entry.skill);
}

/**
 * Format a single skill's formulas as a readable block.
 *
 * @param skill - The skill to format formulas for
 * @returns Formatted formula string
 */
function formatFormulas(skill: PatternSkill): string {
  const lines: string[] = [];
  for (const [key, formula] of Object.entries(skill.formulas)) {
    lines.push(`  ${key}: ${formula.expression} (${formula.unit}) — ${formula.description}`);
  }
  return lines.join('\n');
}

/**
 * Format a single skill's construction steps as a readable block.
 *
 * @param skill - The skill to format steps for
 * @returns Formatted steps string
 */
function formatSteps(skill: PatternSkill): string {
  return skill.constructionSteps
    .map(step => {
      let line = `  ${step.order}. ${step.instruction}`;
      if (step.toolCalls.length > 0) {
        line += ` [Tools: ${step.toolCalls.join(', ')}]`;
      }
      if (step.validation) {
        line += ` ✓ ${step.validation}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Format a single skill's ease table as a readable block.
 *
 * @param skill - The skill to format ease table for
 * @returns Formatted ease table string
 */
function formatEaseTable(skill: PatternSkill): string {
  const lines: string[] = [];
  for (const [fabricType, eases] of Object.entries(skill.easeTable)) {
    const easeStr = Object.entries(eases)
      .map(([m, v]) => `${m}=${v}cm`)
      .join(', ');
    lines.push(`  ${fabricType}: ${easeStr}`);
  }
  return lines.join('\n');
}

/**
 * Build a formatted context string from matched skills for injection
 * into the LLM system prompt.
 *
 * Includes: skill description, default method, formulas, ease table,
 * and ordered construction steps.
 *
 * @param skills - Array of matched skills
 * @returns Formatted context string for the system prompt
 */
export function buildSkillContext(skills: PatternSkill[]): string {
  if (skills.length === 0) return '';

  const sections: string[] = ['## Active Pattern Skills'];

  for (const skill of skills) {
    sections.push(`\n### ${skill.name.toUpperCase()} — ${skill.description}`);

    // Default method
    const defaultMethod = skill.methods[0];
    if (defaultMethod) {
      sections.push(`\nDefault method: ${defaultMethod.name} (${defaultMethod.origin})`);
      sections.push(`${defaultMethod.description}`);
      sections.push(`Alternative methods: ${skill.methods.slice(1).map(m => `${m.name} (${m.origin})`).join(', ') || 'none'}`);
    }

    // Formulas
    sections.push(`\nFormulas:`);
    sections.push(formatFormulas(skill));

    // Ease table
    sections.push(`\nEase by fabric type:`);
    sections.push(formatEaseTable(skill));

    // Construction steps
    sections.push(`\nConstruction steps:`);
    sections.push(formatSteps(skill));

    // Grade rules summary
    if (skill.gradeRules && skill.gradeRules.length > 0) {
      sections.push(`\nGrade rules: ${skill.gradeRules.length} point-specific rules defined`);
    }
  }

  return sections.join('\n');
}
