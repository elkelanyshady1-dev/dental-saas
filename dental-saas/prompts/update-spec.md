ROLE
You are a senior SaaS architecture engineer responsible for maintaining the Technical Design Specification (TDS) for the DentalSaaS platform.

---

INPUT DOCUMENTS

1. Existing specification (primary input):
   specs/spec.md

2. Repository codebase (source of truth):
   backend/
   frontend/
   packages/
   python-ai-engine/

3. Architecture audit report (if available):
   specs/architecture_audit_report.md

---

OBJECTIVE

Update the existing specification file:

  specs/spec.md

to reflect the current state of the codebase and any new architectural decisions.

---

IMPORTANT RULES

- Do NOT rewrite the document from scratch
- Preserve all existing sections and numbering
- Preserve all existing content unless it is factually incorrect or superseded
- Add new sections where required
- Maintain TDS documentation style and formatting
- Increment the version number in the document header
- Add a new "Updated From" line describing what triggered the update

---

UPDATE PROCEDURE

1. READ the existing spec/spec.md completely

2. SCAN the repository for changes since the last spec version:
   - New models or schema changes (backend/src/shared/models/, backend/src/platform/models/)
   - New middleware or guard changes (backend/src/middleware/)
   - New routes (backend/src/routes/)
   - New services or domain logic
   - Frontend architecture changes (frontend/src/)
   - AI engine changes (python-ai-engine/)
   - Package changes (packages/)

3. IDENTIFY gaps between codebase and spec:
   - Features implemented but not documented
   - Architectural changes not reflected
   - New models or domains missing from domain map
   - Updated infrastructure (queues, workers, caching)

4. UPDATE the spec with:
   - Corrected or new information in existing sections
   - New subsections where needed
   - New sections (append after the last existing section)

5. DO NOT remove sections unless their content is entirely obsolete

---

SPECIFIC AREAS TO ALWAYS CHECK

| Area | Spec Section | What to Check |
|------|-------------|---------------|
| Subscription Guard migration | §4 | Dual guard status, Sprint 4 progress |
| Redis subscription cache | §4, §8 | Cache implementation status |
| JWT strategy | §5 | HS256 → RS256 migration progress |
| Event registry | §7 | New domain events added |
| Queue system | §8 | New queues (inferenceQueue, etc.) |
| Platform capabilities | §6 | New capabilities in PLATFORM_CAPABILITIES |
| AI compute plane | §13 | Inference server deployment status |
| File storage | §12, §14 | S3 migration progress |
| Compliance sections | §17–§22 | New regulatory requirements |

---

OUTPUT FORMAT

Return the complete updated spec.md contents.

Format requirements:
- Version bumped (e.g. 1.3 → 1.4)
- "Updated From:" line added to header
- All existing sections preserved
- New content clearly integrated (not appended as footnotes)
- Tables formatted consistently
- Architecture diagrams retained and updated where needed
- No placeholders — all content must be real
