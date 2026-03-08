## Summary

Build a cloud-based garment review platform with browser-based 3D viewing and spatial annotations (3D comments). Enables remote design review between designers, pattern makers, and buyers without requiring the full application.

**Competitive context:** CLO3D offers CLO-SET (cloud viewer with annotations, review rooms, and team workspaces). Browzwear offers Stylezone. Both are increasingly central to digital-first fashion workflows.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §14 — Collaboration](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### 3D Web Viewer
- Lightweight browser-based garment viewer (no login required for shared links)
- Pan, rotate, zoom with standard mouse/touch controls
- View all colorways
- Toggle fit analysis maps
- Responsive design for mobile viewing

### 3D Spatial Annotations
- Click on 3D garment surface to place annotation pin
- Add text comment at annotation point
- Annotations visible to all reviewers
- Thread replies on annotations
- Resolve/unresolve status per annotation
- Export annotations as PDF report

### Review Workflow
- Share garment via unique URL
- Invite reviewers by email
- Review status: pending, approved, needs revision
- Side-by-side comparison of multiple styles or colorways
- Version history: compare previous iterations

### Team Workspaces
- Create team with invited members
- Shared project folders
- Role-based access (viewer, commenter, editor)
- Activity feed showing recent changes and comments

---

## Implementation Notes

This is a full-stack feature requiring:
- Cloud storage for garment files (glTF export → CDN)
- Backend API for annotations, reviews, and user management
- Authentication system (OAuth 2.0)
- Real-time annotation sync (WebSocket or SSE)

## Related Issues

- #15 — Cloud infrastructure (existing — auth, storage, versioning)
- #231 — Multi-Format 3D Export (viewer loads glTF exports)

## Acceptance Criteria

- [ ] Garments shareable via unique URL
- [ ] 3D web viewer loads garment with pan/rotate/zoom
- [ ] Spatial annotations placeable on 3D surface
- [ ] Comment threads on annotations
- [ ] Review status tracking (pending/approved/revision)
- [ ] Team workspaces with role-based access
- [ ] Mobile-responsive viewer
- [ ] Annotation export as PDF
