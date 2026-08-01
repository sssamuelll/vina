#!/usr/bin/env bash
#
# Vina.ai — Competitive Parity Roadmap Issue Creator
# =====================================================
# Creates GitHub issues for every feature gap identified in
# docs/specs/COMPETITIVE-GAP-ANALYSIS.md
#
# Prerequisites:
#   gh auth login
#
# Usage:
#   chmod +x scripts/create-roadmap-issues.sh
#   ./scripts/create-roadmap-issues.sh
#
# Each issue references the gap analysis spec and existing related issues.
# Issues are created with appropriate labels. Run once — duplicates are
# prevented by checking existing issue titles.

set -euo pipefail

REPO="sssamuelll/openclo"
DELAY=2  # seconds between API calls to avoid rate limiting

# Ensure labels exist
ensure_label() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" 2>/dev/null || true
}

echo "=== Ensuring labels exist ==="
ensure_label "tier-1-critical"       "d73a4a" "Critical competitive gap — blocks adoption"
ensure_label "tier-2-important"      "e4a221" "Important differentiator — expected within first year"
ensure_label "tier-3-nice-to-have"   "0e8a16" "Nice to have — adds depth but not a blocker"
ensure_label "competitive-parity"    "1d76db" "Feature needed for CLO3D/Browzwear parity"
ensure_label "new-subsystem"         "5319e7" "Requires building an entirely new subsystem"
ensure_label "enhancement"           "a2eeef" "New feature or request"
ensure_label "simulation"            "fbca04" "Cloth simulation and physics"
ensure_label "rendering"             "c5def5" "3D rendering and visualization"
ensure_label "materials"             "bfd4f2" "Fabric and material system"
ensure_label "avatar"                "d4c5f9" "Avatar system"
ensure_label "production"            "f9d0c4" "Production output and manufacturing"
ensure_label "grading"               "fef2c0" "Grading and sizing"
ensure_label "animation"             "e99695" "Animation system"
ensure_label "collaboration"         "c2e0c6" "Collaboration and cloud features"
ensure_label "api"                   "bfdadc" "API and automation"
ensure_label "sewing"                "d876e3" "Sewing and construction"

echo ""
echo "=== Creating issues ==="

create_issue() {
  local title="$1"
  local labels="$2"
  local body_file="$3"

  # Check if issue already exists
  existing=$(gh issue list --repo "$REPO" --search "\"$title\"" --json number --jq '.[0].number' 2>/dev/null || echo "")
  if [ -n "$existing" ]; then
    echo "SKIP: #$existing already exists — $title"
    return
  fi

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --label "$labels" \
    --body-file "$body_file"

  echo "CREATED: $title"
  sleep "$DELAY"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ISSUES_DIR="$SCRIPT_DIR/../docs/issues"

# ─── TIER 1: Critical ───────────────────────────────────────────────

create_issue \
  "feat: Fit Analysis System — stress, strain, fit/ease, and pressure maps" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement,simulation" \
  "$ISSUES_DIR/219-fit-analysis-system.md"

create_issue \
  "feat: PBR Material & Texture Map System — diffuse, normal, roughness on cloth" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement,materials,rendering" \
  "$ISSUES_DIR/220-pbr-material-texture-system.md"

create_issue \
  "feat: Colorway Management System — multi-colorway with per-colorway materials" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement,materials" \
  "$ISSUES_DIR/221-colorway-management-system.md"

create_issue \
  "feat: Print & Graphic Placement Engine — 2D/3D artwork, all-over print, UV tiling" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement" \
  "$ISSUES_DIR/222-print-graphic-placement.md"

create_issue \
  "feat: Tech Pack & BOM Generation — auto bill of materials, spec sheets, cost estimation" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement,production" \
  "$ISSUES_DIR/223-techpack-bom-generation.md"

create_issue \
  "feat: Trim & Hardware Library — buttons, zippers, snaps, custom OBJ trims" \
  "tier-1-critical,competitive-parity,new-subsystem,enhancement" \
  "$ISSUES_DIR/224-trim-hardware-library.md"

# ─── TIER 2: Important ──────────────────────────────────────────────

create_issue \
  "feat: 3D Rendering Pipeline — HDRI environments, PBR viewport, turntable, custom lighting" \
  "tier-2-important,competitive-parity,enhancement,rendering" \
  "$ISSUES_DIR/225-3d-rendering-pipeline.md"

create_issue \
  "feat: Pleats, Folds & Elastic Simulation" \
  "tier-2-important,competitive-parity,enhancement,sewing,simulation" \
  "$ISSUES_DIR/226-pleats-folds-elastic.md"

create_issue \
  "feat: Advanced Grading System — RUL import/export, nested overlay, per-point, 3D review" \
  "tier-2-important,competitive-parity,enhancement,grading" \
  "$ISSUES_DIR/227-advanced-grading-system.md"

create_issue \
  "feat: 3D Garment Measurement — measurement tapes, POM, 2D vs 3D comparison" \
  "tier-2-important,competitive-parity,enhancement" \
  "$ISSUES_DIR/228-3d-garment-measurement.md"

create_issue \
  "feat: Avatar Posing & Deformation — IK/FK joints, morph targets, size sets" \
  "tier-2-important,competitive-parity,enhancement,avatar" \
  "$ISSUES_DIR/229-avatar-posing-deformation.md"

create_issue \
  "feat: Keyframe Animation & Video Export — timeline, camera motion, MP4 rendering" \
  "tier-2-important,competitive-parity,new-subsystem,enhancement,animation" \
  "$ISSUES_DIR/230-keyframe-animation-system.md"

create_issue \
  "feat: Multi-Format 3D Export — FBX, glTF/GLB, USD, Alembic" \
  "tier-2-important,competitive-parity,enhancement,production" \
  "$ISSUES_DIR/231-multi-format-3d-export.md"

create_issue \
  "feat: GPU-Accelerated Cloth Simulation via WebGPU Compute Shaders" \
  "tier-2-important,competitive-parity,enhancement,simulation" \
  "$ISSUES_DIR/232-webgpu-cloth-simulation.md"

create_issue \
  "feat: Pattern Nesting & Fabric Consumption Calculator" \
  "tier-2-important,competitive-parity,enhancement,production" \
  "$ISSUES_DIR/233-nesting-fabric-consumption.md"

create_issue \
  "feat: Pantone & Color Library System — TCX, TSX, TN + palette import/export" \
  "tier-2-important,competitive-parity,enhancement,materials" \
  "$ISSUES_DIR/234-pantone-color-library.md"

create_issue \
  "feat: AI/PSD/AI Artwork Import Pipeline" \
  "tier-2-important,competitive-parity,enhancement" \
  "$ISSUES_DIR/235-artwork-import-pipeline.md"

create_issue \
  "feat: Cloud Review & 3D Annotations — browser-based garment review with spatial comments" \
  "tier-2-important,competitive-parity,enhancement,collaboration" \
  "$ISSUES_DIR/236-cloud-review-annotations.md"

create_issue \
  "feat: Ray Tracing / Path Tracing Renderer" \
  "tier-2-important,competitive-parity,enhancement,rendering" \
  "$ISSUES_DIR/237-ray-tracing-renderer.md"

# ─── TIER 3: Nice to Have ───────────────────────────────────────────

create_issue \
  "feat: Seam Realism — puckering, bulk/thickness, tack/basting stitch" \
  "tier-3-nice-to-have,competitive-parity,enhancement,sewing" \
  "$ISSUES_DIR/238-seam-realism-effects.md"

create_issue \
  "feat: Advanced Simulation Controls — wind, steam/press, freeze patterns, quality presets" \
  "tier-3-nice-to-have,competitive-parity,enhancement,simulation" \
  "$ISSUES_DIR/239-advanced-simulation-controls.md"

create_issue \
  "feat: Non-Linear Material Response — stress-strain curves beyond linear compliance" \
  "tier-3-nice-to-have,competitive-parity,enhancement,simulation,materials" \
  "$ISSUES_DIR/240-nonlinear-material-response.md"

create_issue \
  "feat: AI Pattern Drafter — parametric generation from body measurements" \
  "tier-3-nice-to-have,competitive-parity,enhancement" \
  "$ISSUES_DIR/241-ai-pattern-drafter.md"

create_issue \
  "feat: Image Trace Tool — trace reference images to create patterns" \
  "tier-3-nice-to-have,competitive-parity,enhancement" \
  "$ISSUES_DIR/242-image-trace-tool.md"

create_issue \
  "feat: Procedural Materials — SBSAR/Substance Designer support" \
  "tier-3-nice-to-have,competitive-parity,enhancement,materials" \
  "$ISSUES_DIR/243-procedural-materials-sbsar.md"

create_issue \
  "feat: Multilayered Fabric Composites — bonded/fused/laminated material stacks" \
  "tier-3-nice-to-have,competitive-parity,enhancement,materials" \
  "$ISSUES_DIR/244-multilayered-fabrics.md"

create_issue \
  "feat: Knit Swatch Editor — stitch-level knitwear design and simulation" \
  "tier-3-nice-to-have,competitive-parity,new-subsystem,enhancement,materials" \
  "$ISSUES_DIR/245-knit-swatch-editor.md"

create_issue \
  "feat: Soft/Deformable Avatars — avatar deforms under garment pressure" \
  "tier-3-nice-to-have,competitive-parity,enhancement,avatar,simulation" \
  "$ISSUES_DIR/246-soft-deformable-avatars.md"

create_issue \
  "feat: AI Pose Generator — generate avatar poses from text or reference images" \
  "tier-3-nice-to-have,competitive-parity,enhancement,avatar" \
  "$ISSUES_DIR/247-ai-pose-generator.md"

create_issue \
  "feat: Dress Form Avatars — mannequin models for draping" \
  "tier-3-nice-to-have,competitive-parity,enhancement,avatar" \
  "$ISSUES_DIR/248-dress-form-avatars.md"

create_issue \
  "feat: PLM Integration — connect to product lifecycle management systems" \
  "tier-3-nice-to-have,competitive-parity,enhancement,collaboration" \
  "$ISSUES_DIR/249-plm-integration.md"

create_issue \
  "feat: Headless CLI, Scripting API & Batch Processing" \
  "tier-3-nice-to-have,competitive-parity,enhancement,api" \
  "$ISSUES_DIR/250-headless-cli-scripting-api.md"

create_issue \
  "feat: FBX/COLLADA Motion Import & Alembic Animation Cache" \
  "tier-3-nice-to-have,competitive-parity,enhancement,animation" \
  "$ISSUES_DIR/251-motion-import-alembic-cache.md"

echo ""
echo "=== Done ==="
echo "All competitive parity issues have been created."
echo "See docs/specs/COMPETITIVE-GAP-ANALYSIS.md for the full feature mapping."
