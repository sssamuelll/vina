/**
 * Skill Event Emitter — pub/sub for skill lifecycle events.
 *
 * Provides a simple event system for notifying UI components
 * when skills are registered, unregistered, enabled, or disabled.
 *
 * @module skills/skillEvents
 */

import type { NSID } from './nsid';
import type { RegisteredSkill } from './registryTypes';

/**
 * Skill lifecycle events.
 */
export type SkillEvent =
  | 'skill:registered'
  | 'skill:unregistered'
  | 'skill:enabled'
  | 'skill:disabled'
  | 'skill:updated';

/**
 * Event handler function signature.
 *
 * @param nsid - The skill's namespace identifier
 * @param skill - The skill data (optional, not provided for unregister)
 */
export type SkillEventHandler = (nsid: NSID, skill?: RegisteredSkill) => void;

/**
 * Event emitter for skill lifecycle events.
 *
 * @example
 * const emitter = new SkillEventEmitter();
 *
 * const unsubscribe = emitter.on('skill:registered', (nsid, skill) => {
 *   console.log(`Skill ${nsid} registered`);
 * });
 *
 * emitter.emit('skill:registered', 'openclo:bodice', skill);
 *
 * // Later: unsubscribe()
 */
export class SkillEventEmitter {
  private handlers: Map<SkillEvent, Set<SkillEventHandler>> = new Map();

  /**
   * Subscribe to a skill event.
   *
   * @param event - The event type to listen for
   * @param handler - The callback function
   * @returns Unsubscribe function
   */
  on(event: SkillEvent, handler: SkillEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event to all registered handlers.
   *
   * Handlers are called synchronously in registration order.
   * If a handler throws, the error is logged and remaining handlers
   * are still called.
   *
   * @param event - The event type
   * @param nsid - The skill's namespace identifier
   * @param skill - The skill data (optional)
   */
  emit(event: SkillEvent, nsid: NSID, skill?: RegisteredSkill): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) {
      return;
    }

    for (const handler of eventHandlers) {
      try {
        handler(nsid, skill);
      } catch (error) {
        console.error(`[SkillEvents] Handler error for ${event}:`, error);
      }
    }
  }

  /**
   * Remove all handlers for an event, or all events.
   *
   * @param event - Optional: specific event to clear.
   *                If omitted, clears all events.
   */
  clear(event?: SkillEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
