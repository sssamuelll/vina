# Skill Marketplace UI Design

**Issue:** #172
**Epic:** #163 (Skill Marketplace & Copilot Extensibility)
**Date:** 2026-02-28

## Goal

Create a VS Code-style sidebar view for discovering, installing, and managing community pattern skills.

## Approach

**Approach A: New Sidebar View** — Add `skills` as a new `SidebarView` alongside existing views (plugins, settings, etc.). Follows established patterns, minimal architectural change.

## Data Source

Static JSON file hosted on GitHub/CDN. The `marketplace.ts` API already supports this via `fetchAvailableSkills()`.

## Architecture

### Component Structure

```
src/components/SkillMarketplace/
├── SkillMarketplace.tsx      # Main view with tabs
├── SkillMarketplace.css      # Styles (based on PluginManager)
├── SkillCard.tsx             # Card for available skills
└── SkillCardInstalled.tsx    # Card with enable/disable/remove controls
```

### Integration Points

1. Add `'skills'` to `SidebarView` type in `ActivityBar.tsx`
2. Add icon (`Sparkles` from lucide-react) to ActivityBar
3. Render `<SkillMarketplace />` in `Sidebar.tsx`
4. Connect to `SkillRegistry` for persistence

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SkillMarketplace                         │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │    Browse Tab    │     │       Installed Tab          │  │
│  │                  │     │                              │  │
│  │  fetchAvailable  │     │  SkillRegistry.getEnabled()  │
│  │  Skills() ───────┼─────┼──► registry.register()       │  │
│  │  (static JSON)   │     │     registry.unregister()    │  │
│  │                  │     │     enable() / disable()     │  │
│  └──────────────────┘     └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    SkillRegistry (IndexedDB)
```

### Flow

1. **Browse Tab**: Fetch skills from static JSON → display cards → "Install" calls `registry.register()`
2. **Installed Tab**: Read from `SkillRegistry.getAll()` → show cards with toggle and remove
3. **Events**: Registry emits `skill:registered`, `skill:unregistered` → UI updates via subscription

## UI Layout

```
┌─────────────────────────────────────┐
│ Skills                          [X] │  ← Header
├─────────────────────────────────────┤
│ [Browse]  [Installed (3)]           │  ← Tabs with counter
├─────────────────────────────────────┤
│ 🔍 Search skills...                 │  ← Search input
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 👔 JeansSkill           v1.0.0  │ │  ← SkillCard
│ │ by: community                   │ │
│ │ 5-pocket denim construction     │ │
│ │                      [Install]  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 👗 CorsetSkill          v1.2.0  │ │
│ │ by: sdar                        │ │
│ │ Victorian corset with boning    │ │
│ │                      [Install]  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

─ ─ ─ Installed Tab ─ ─ ─

┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ 👔 JeansSkill     [ON]    [🗑️] │ │  ← Toggle + Remove
│ │ openclo:jeans • community       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 👕 Bodice          [ON]    ──   │ │  ← Core skill (no remove)
│ │ openclo:bodice • core           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Registry URL not configured | Show message with link to Settings |
| Fetch fails (network) | Banner with retry button |
| Invalid skill in registry | Skip silently during browse |
| Skill already installed | Disabled button showing "Installed ✓" |
| Uninstall core skill | Hide remove button (core skills protected) |

## Loading States

- Skeleton cards while fetching
- Spinner on action buttons during install/uninstall
- Optimistic UI updates with rollback on error

## Styling

Reuse CSS variables from PluginManager:
- `.skill-card` based on `.plugin-card`
- Same spacing, colors, and hover states
- VS Code-inspired minimal aesthetic

## Acceptance Criteria

- [ ] Users can browse available skills from static JSON
- [ ] Users can search/filter skills by name
- [ ] Users can install skills with one click
- [ ] Users can see installed skills with enable/disable toggle
- [ ] Users can uninstall community skills (not core)
- [ ] UI updates reactively when skills change
- [ ] Loading and error states are handled gracefully
