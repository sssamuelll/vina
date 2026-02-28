# Skill Marketplace UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a VS Code-style sidebar view for discovering, installing, and managing community pattern skills.

**Architecture:** New `SkillMarketplace` component in sidebar with Browse/Installed tabs. Browse fetches from static JSON, Installed reads from SkillRegistry. Uses existing PluginManager styling patterns.

**Tech Stack:** React, TypeScript, lucide-react icons, SkillRegistry (IndexedDB)

---

## Task 1: Add Skills View to ActivityBar

**Files:**
- Modify: `src/components/ActivityBar/ActivityBar.tsx`

### Step 1: Add 'skills' to SidebarView type

Edit `ActivityBar.tsx` line 4-14, add `'skills'` to the union type:

```typescript
export type SidebarView =
  | 'explorer'
  | 'measurements'
  | 'grading'
  | 'nesting'
  | 'files'
  | 'plugins'
  | 'skills'    // NEW
  | 'settings'
  | 'simulation'
  | 'parametric'
  | 'history';
```

### Step 2: Add skills icon to items array

Add import at top:
```typescript
import { FileText, Ruler, Layers, LayoutGrid, Play, Folder, Plug, Settings, SlidersHorizontal, History, Sparkles } from 'lucide-react';
```

Add to items array (before plugins, in bottom section):
```typescript
  {
    id: 'skills',
    label: 'Skills Marketplace',
    position: 'bottom',
    icon: <Sparkles size={20} />,
  },
```

### Step 3: Verify app compiles

Run: `npm run build`
Expected: Build succeeds (Sidebar will show empty for 'skills' view)

### Step 4: Commit

```bash
git add src/components/ActivityBar/ActivityBar.tsx
git commit -m "feat(ui): add skills view to ActivityBar"
```

---

## Task 2: Create SkillCard Component

**Files:**
- Create: `src/components/SkillMarketplace/SkillCard.tsx`

### Step 1: Create SkillCard component

```typescript
// src/components/SkillMarketplace/SkillCard.tsx
/**
 * SkillCard — displays a single skill in the Browse tab.
 */
import { Download, Check, Loader2 } from 'lucide-react';
import type { CommunitySkillMetadata } from '../../copilot/skills/communityFormat';

interface SkillCardProps {
  metadata: CommunitySkillMetadata;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}

export default function SkillCard({
  metadata,
  isInstalled,
  isInstalling,
  onInstall,
}: SkillCardProps) {
  return (
    <div className="skill-card">
      <div className="skill-card__header">
        <div className="skill-card__info">
          <span className="skill-card__name">{metadata.name}</span>
          <span className="skill-card__version">v{metadata.version}</span>
        </div>
        <div className="skill-card__actions">
          {isInstalled ? (
            <span className="skill-card__installed">
              <Check size={14} /> Installed
            </span>
          ) : (
            <button
              className="skill-card__install-btn"
              onClick={onInstall}
              disabled={isInstalling}
            >
              {isInstalling ? (
                <Loader2 size={14} className="skill-card__spinner" />
              ) : (
                <Download size={14} />
              )}
              {isInstalling ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
      <div className="skill-card__meta">
        <span className="skill-card__author">by {metadata.author}</span>
        {metadata.tags.length > 0 && (
          <div className="skill-card__tags">
            {metadata.tags.slice(0, 3).map(tag => (
              <span key={tag} className="skill-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <p className="skill-card__description">{metadata.description}</p>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add src/components/SkillMarketplace/SkillCard.tsx
git commit -m "feat(ui): add SkillCard component for browse tab"
```

---

## Task 3: Create SkillCardInstalled Component

**Files:**
- Create: `src/components/SkillMarketplace/SkillCardInstalled.tsx`

### Step 1: Create SkillCardInstalled component

```typescript
// src/components/SkillMarketplace/SkillCardInstalled.tsx
/**
 * SkillCardInstalled — displays an installed skill with enable/disable toggle.
 */
import { Trash2 } from 'lucide-react';
import type { RegisteredSkill } from '../../copilot/skills/registryTypes';
import { isCoreSkill } from '../../copilot/skills/coreSkills';

interface SkillCardInstalledProps {
  skill: RegisteredSkill;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}

export default function SkillCardInstalled({
  skill,
  onToggle,
  onRemove,
}: SkillCardInstalledProps) {
  const isCore = isCoreSkill(skill.nsid);

  return (
    <div className={`skill-card skill-card--installed ${skill.enabled ? 'skill-card--enabled' : ''}`}>
      <div className="skill-card__header">
        <div className="skill-card__info">
          <span className="skill-card__name">{skill.skill.name}</span>
          <span className="skill-card__version">v{skill.version}</span>
        </div>
        <div className="skill-card__actions">
          <label className="skill-card__toggle">
            <input
              type="checkbox"
              checked={skill.enabled}
              onChange={e => onToggle(e.target.checked)}
            />
            <span className="skill-card__toggle-slider" />
          </label>
          {!isCore && (
            <button
              className="skill-card__remove"
              onClick={onRemove}
              title="Uninstall skill"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="skill-card__meta">
        <span className="skill-card__nsid">{skill.nsid}</span>
        <span className="skill-card__source">{skill.source}</span>
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add src/components/SkillMarketplace/SkillCardInstalled.tsx
git commit -m "feat(ui): add SkillCardInstalled component with toggle/remove"
```

---

## Task 4: Create SkillMarketplace CSS

**Files:**
- Create: `src/components/SkillMarketplace/SkillMarketplace.css`

### Step 1: Create stylesheet based on PluginManager patterns

```css
/* src/components/SkillMarketplace/SkillMarketplace.css */

/* Main container */
.skill-marketplace {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Tabs */
.skill-marketplace__tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color, #333);
  padding: 0 12px;
}

.skill-marketplace__tab {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.skill-marketplace__tab:hover {
  color: var(--text-primary, #ccc);
}

.skill-marketplace__tab--active {
  color: var(--text-primary, #ccc);
  border-bottom-color: var(--accent-color, #0e639c);
}

.skill-marketplace__tab-count {
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 10px;
  background: var(--badge-bg, #333);
  border-radius: 10px;
}

/* Content area */
.skill-marketplace__content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

/* Search */
.skill-marketplace__search {
  margin-bottom: 12px;
}

.skill-marketplace__search-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  background: var(--input-bg, #1e1e1e);
  color: var(--text-primary, #ccc);
}

.skill-marketplace__search-input::placeholder {
  color: var(--text-secondary, #666);
}

/* List */
.skill-marketplace__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Empty state */
.skill-marketplace__empty {
  text-align: center;
  padding: 24px 12px;
  color: var(--text-secondary, #888);
  font-size: 13px;
}

.skill-marketplace__empty-hint {
  font-size: 11px;
  margin-top: 8px;
  color: var(--text-secondary, #666);
}

/* Error state */
.skill-marketplace__error {
  padding: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--error-fg, #f48771);
  background: var(--error-bg, rgba(244, 135, 113, 0.1));
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skill-marketplace__retry-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid var(--error-fg, #f48771);
  border-radius: 3px;
  background: transparent;
  color: var(--error-fg, #f48771);
  cursor: pointer;
}

/* Loading */
.skill-marketplace__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-marketplace__skeleton {
  height: 80px;
  background: var(--card-bg, #252526);
  border-radius: 6px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

/* Skill Card */
.skill-card {
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  padding: 10px;
  background: var(--card-bg, #252526);
}

.skill-card--enabled {
  border-color: var(--accent-color, #0e639c);
}

.skill-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.skill-card__info {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.skill-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #ccc);
}

.skill-card__version {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.skill-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-card__install-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  border: none;
  border-radius: 3px;
  background: var(--button-bg, #0e639c);
  color: var(--button-fg, #fff);
  cursor: pointer;
  transition: background 0.15s;
}

.skill-card__install-btn:hover:not(:disabled) {
  background: var(--button-hover-bg, #1177bb);
}

.skill-card__install-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.skill-card__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.skill-card__installed {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--success-fg, #89d185);
}

.skill-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skill-card__author {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.skill-card__nsid {
  font-size: 10px;
  color: var(--text-secondary, #666);
  font-family: monospace;
}

.skill-card__source {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--badge-bg, #333);
  color: var(--text-secondary, #aaa);
  border-radius: 10px;
}

.skill-card__tags {
  display: flex;
  gap: 4px;
}

.skill-card__tag {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--badge-bg, #333);
  color: var(--text-secondary, #aaa);
  border-radius: 10px;
}

.skill-card__description {
  font-size: 12px;
  color: var(--text-primary, #ccc);
  margin: 0;
  line-height: 1.4;
}

/* Toggle switch (same as PluginManager) */
.skill-card__toggle {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
}

.skill-card__toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.skill-card__toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--toggle-off, #555);
  border-radius: 16px;
  transition: 0.2s;
}

.skill-card__toggle-slider::before {
  content: '';
  position: absolute;
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.skill-card__toggle input:checked + .skill-card__toggle-slider {
  background: var(--accent-color, #0e639c);
}

.skill-card__toggle input:checked + .skill-card__toggle-slider::before {
  transform: translateX(12px);
}

.skill-card__remove {
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
}

.skill-card__remove:hover {
  color: var(--error-fg, #f48771);
}
```

### Step 2: Commit

```bash
git add src/components/SkillMarketplace/SkillMarketplace.css
git commit -m "feat(ui): add SkillMarketplace styles"
```

---

## Task 5: Create SkillMarketplace Main Component

**Files:**
- Create: `src/components/SkillMarketplace/SkillMarketplace.tsx`

### Step 1: Create main component

```typescript
// src/components/SkillMarketplace/SkillMarketplace.tsx
/**
 * SkillMarketplace — main view for browsing and managing skills.
 */
import { useState, useEffect, useCallback } from 'react';
import { SkillRegistry } from '../../copilot/skills/skillRegistry';
import { fetchAvailableSkills, getSkillRegistryUrl } from '../../copilot/skills/marketplace';
import type { CommunitySkill } from '../../copilot/skills/communityFormat';
import type { RegisteredSkill } from '../../copilot/skills/registryTypes';
import SkillCard from './SkillCard';
import SkillCardInstalled from './SkillCardInstalled';
import './SkillMarketplace.css';

type Tab = 'browse' | 'installed';

export default function SkillMarketplace() {
  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [searchQuery, setSearchQuery] = useState('');

  // Browse state
  const [availableSkills, setAvailableSkills] = useState<CommunitySkill[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  // Installed state
  const [installedSkills, setInstalledSkills] = useState<RegisteredSkill[]>([]);

  const registry = SkillRegistry.getInstance();

  // Load installed skills
  const loadInstalled = useCallback(() => {
    setInstalledSkills(registry.getAll());
  }, [registry]);

  // Subscribe to registry events
  useEffect(() => {
    loadInstalled();

    const unsub1 = registry.on('skill:registered', loadInstalled);
    const unsub2 = registry.on('skill:unregistered', loadInstalled);
    const unsub3 = registry.on('skill:enabled', loadInstalled);
    const unsub4 = registry.on('skill:disabled', loadInstalled);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [registry, loadInstalled]);

  // Fetch available skills
  const loadAvailable = useCallback(async () => {
    const url = getSkillRegistryUrl();
    if (!url) {
      setBrowseError('Registry URL not configured. Set it in Settings.');
      return;
    }

    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const skills = await fetchAvailableSkills(searchQuery || undefined);
      setAvailableSkills(skills);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setBrowseLoading(false);
    }
  }, [searchQuery]);

  // Load available when switching to browse tab
  useEffect(() => {
    if (activeTab === 'browse') {
      loadAvailable();
    }
  }, [activeTab, loadAvailable]);

  // Install skill
  const handleInstall = useCallback(async (skill: CommunitySkill) => {
    const id = skill.metadata.id;
    setInstallingIds(prev => new Set(prev).add(id));

    try {
      await registry.register(skill);
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [registry]);

  // Toggle enable/disable
  const handleToggle = useCallback(async (nsid: string, enabled: boolean) => {
    if (enabled) {
      await registry.enable(nsid);
    } else {
      await registry.disable(nsid);
    }
  }, [registry]);

  // Uninstall
  const handleRemove = useCallback(async (nsid: string) => {
    await registry.unregister(nsid);
  }, [registry]);

  // Filter skills
  const filteredInstalled = installedSkills.filter(s =>
    s.skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.nsid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAvailable = availableSkills.filter(s =>
    s.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.metadata.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const installedCount = installedSkills.length;

  return (
    <div className="skill-marketplace">
      <div className="skill-marketplace__tabs">
        <button
          className={`skill-marketplace__tab ${activeTab === 'browse' ? 'skill-marketplace__tab--active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          Browse
        </button>
        <button
          className={`skill-marketplace__tab ${activeTab === 'installed' ? 'skill-marketplace__tab--active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed
          <span className="skill-marketplace__tab-count">{installedCount}</span>
        </button>
      </div>

      <div className="skill-marketplace__content">
        <div className="skill-marketplace__search">
          <input
            type="text"
            className="skill-marketplace__search-input"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTab === 'browse' && (
          <>
            {browseError && (
              <div className="skill-marketplace__error">
                <span>{browseError}</span>
                <button className="skill-marketplace__retry-btn" onClick={loadAvailable}>
                  Retry
                </button>
              </div>
            )}

            {browseLoading ? (
              <div className="skill-marketplace__loading">
                <div className="skill-marketplace__skeleton" />
                <div className="skill-marketplace__skeleton" />
                <div className="skill-marketplace__skeleton" />
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div className="skill-marketplace__empty">
                <p>No skills found</p>
                <p className="skill-marketplace__empty-hint">
                  {searchQuery ? 'Try a different search term' : 'Configure a registry URL in Settings'}
                </p>
              </div>
            ) : (
              <div className="skill-marketplace__list">
                {filteredAvailable.map(skill => (
                  <SkillCard
                    key={skill.metadata.id}
                    metadata={skill.metadata}
                    isInstalled={registry.has(skill.metadata.id)}
                    isInstalling={installingIds.has(skill.metadata.id)}
                    onInstall={() => handleInstall(skill)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'installed' && (
          filteredInstalled.length === 0 ? (
            <div className="skill-marketplace__empty">
              <p>No skills installed</p>
              <p className="skill-marketplace__empty-hint">
                Browse the marketplace to find skills
              </p>
            </div>
          ) : (
            <div className="skill-marketplace__list">
              {filteredInstalled.map(skill => (
                <SkillCardInstalled
                  key={skill.nsid}
                  skill={skill}
                  onToggle={enabled => handleToggle(skill.nsid, enabled)}
                  onRemove={() => handleRemove(skill.nsid)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add src/components/SkillMarketplace/SkillMarketplace.tsx
git commit -m "feat(ui): add SkillMarketplace main component with tabs"
```

---

## Task 6: Wire Up to Sidebar

**Files:**
- Modify: `src/components/Sidebar/Sidebar.tsx`

### Step 1: Import SkillMarketplace and add to viewTitles

```typescript
import SkillMarketplace from '../SkillMarketplace/SkillMarketplace';
```

Add to `viewTitles`:
```typescript
const viewTitles: Record<SidebarView, string> = {
  explorer: 'Pattern Explorer',
  measurements: 'Measurements',
  grading: 'Grading',
  nesting: 'Nesting',
  files: 'File Browser',
  plugins: 'Plugins',
  skills: 'Skills',    // NEW
  settings: 'Settings',
  simulation: 'Simulation',
  parametric: 'Parametric',
  history: 'History',
};
```

### Step 2: Add skills view rendering

In the render section, add:
```typescript
{activeView === 'skills' && <SkillMarketplace />}
```

### Step 3: Run build to verify

Run: `npm run build`
Expected: Build succeeds

### Step 4: Commit

```bash
git add src/components/Sidebar/Sidebar.tsx
git commit -m "feat(ui): wire SkillMarketplace to Sidebar"
```

---

## Task 7: Create Sample Skills JSON

**Files:**
- Create: `public/skills-registry.json`

### Step 1: Create sample registry file

```json
[
  {
    "schemaVersion": "1.0.0",
    "metadata": {
      "id": "community:jeans",
      "name": "JeansSkill",
      "version": "1.0.0",
      "author": "openclo-community",
      "description": "5-pocket classic jeans construction with yoke and fly front",
      "tags": ["pants", "denim", "casual"],
      "license": "MIT"
    },
    "skill": {
      "name": "jeans",
      "triggers": ["jeans", "denim pants", "5-pocket", "pantalón vaquero"],
      "description": "Draft classic 5-pocket jeans with fly front and yoke back",
      "methods": [
        {
          "name": "Classic 5-Pocket",
          "origin": "US",
          "description": "Traditional Levi's-style construction",
          "formulas": {}
        }
      ],
      "formulas": {},
      "easeTable": {
        "denim": { "hip": 5, "thigh": 4 }
      },
      "constructionSteps": [
        { "order": 1, "instruction": "Draft front panel with pocket placement", "toolCalls": [] },
        { "order": 2, "instruction": "Draft back panel with yoke seam", "toolCalls": [] },
        { "order": 3, "instruction": "Add fly front extension", "toolCalls": [] }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "metadata": {
      "id": "community:corset",
      "name": "CorsetSkill",
      "version": "1.2.0",
      "author": "historical-patterns",
      "description": "Victorian-era overbust corset with steel boning channels",
      "tags": ["historical", "corset", "structured"],
      "license": "CC-BY-SA-4.0"
    },
    "skill": {
      "name": "corset",
      "triggers": ["corset", "corsé", "victorian corset", "overbust"],
      "description": "Draft Victorian overbust corset with boning channels",
      "methods": [
        {
          "name": "Victorian Overbust",
          "origin": "UK",
          "description": "Period-accurate 1880s construction",
          "formulas": {}
        }
      ],
      "formulas": {},
      "easeTable": {
        "coutil": { "bust": -2, "waist": -4 }
      },
      "constructionSteps": [
        { "order": 1, "instruction": "Draft center front panel", "toolCalls": [] },
        { "order": 2, "instruction": "Draft side panels with boning channels", "toolCalls": [] },
        { "order": 3, "instruction": "Draft center back with lacing allowance", "toolCalls": [] }
      ]
    }
  }
]
```

### Step 2: Commit

```bash
git add public/skills-registry.json
git commit -m "feat(data): add sample skills registry JSON"
```

---

## Task 8: Run Full Test Suite and Build

### Step 1: Run tests

Run: `npm test -- --run`
Expected: All tests pass

### Step 2: Run build

Run: `npm run build`
Expected: Build succeeds

### Step 3: Manual smoke test

1. Start dev server: `npm run dev`
2. Click Sparkles icon in ActivityBar
3. Verify "Installed" tab shows 5 core skills
4. Set registry URL in Settings: `http://localhost:5173/skills-registry.json`
5. Verify "Browse" tab loads sample skills
6. Install a skill and verify it appears in Installed tab

### Step 4: Final commit

```bash
git add -A
git commit -m "feat(ui): complete Skill Marketplace implementation

Issue #172: Skill Marketplace UI

- SkillMarketplace component with Browse/Installed tabs
- SkillCard for available skills
- SkillCardInstalled with enable/disable/remove
- VS Code-style styling
- Integration with SkillRegistry (IndexedDB)
- Sample skills registry JSON

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Step 5: Push

```bash
git push
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add 'skills' to ActivityBar with Sparkles icon |
| 2 | Create SkillCard component (browse) |
| 3 | Create SkillCardInstalled component (toggle/remove) |
| 4 | Create SkillMarketplace CSS |
| 5 | Create SkillMarketplace main component |
| 6 | Wire up to Sidebar |
| 7 | Create sample skills JSON |
| 8 | Test and final commit |
