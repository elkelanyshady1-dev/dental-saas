# Frontend Architecture Rules — Settings Hub

## DATA RULES
- Use DTOs only (see `types/settings.types.js`)
- Never access raw backend fields (`_id`, `__v`, `organizationId`)
- Never store organizationId in frontend state — derived from JWT
- DTO shapes match `specs/contracts/bridges/org*.contract.js` — changes require contract update

## API RULES
- All calls go through `services/settings.api.js`
- `settings.api.js` uses the centralized `api` client from `@/services/api`
- No direct `axios.get()` / `axios.post()` calls in components or hooks
- No data transformation in the API layer — pure DTO passthrough
- organizationId is NEVER sent in requests

## STATE MANAGEMENT RULES
- React Query ONLY — no manual useState for server data
- Query keys defined in `lib/query/queryKeys.js` → `QK.settingsBilling` / `QK.settingsSupport`
- Mutations use `useSimpleMutation` (not optimistic) — server is source of truth
- Mutations MUST invalidate relevant query keys

## SECURITY RULES
- UI permission checks use `useCapability("billing.read")` from `@/hooks/useCapability`
- DO NOT use `useAuth` + raw role checks — FORBIDDEN
- UI permissions ≠ actual security — backend enforces via `authorize()`
- `useCapability` validates against SSOT permission keys

## COMPONENT ARCHITECTURE
```
Component → Hook → API → Backend Bridge → Platform
```

### NEVER:
```
Component → axios (directly)
Component → Backend (without hook)
Component → Platform (bypassing bridge)
```

## HOOK ORGANIZATION
- Billing hooks: `modules/org/settings/hooks/useSettingsBilling.js`
- Support hooks: `modules/org/settings/hooks/useSettingsSupport.js`
- No cross-feature hook imports
- No shared state between billing and support queries

## VIOLATION
Any violation = architectural bug — must be fixed before merge.
