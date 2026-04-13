# Bridge Layer Rules — Architecture Enforcement

## STRICT RULES

- Bridge is NOT a business logic layer
- Bridge MUST NOT mutate platform state (except: support ticket create + comment)
- Bridge MUST NOT access `req.body.organizationId` or `req.params.organizationId`
- Bridge MUST use `extractOrgId(req)` from `@core/security/assertOrgContext` ONLY
- Bridge MUST NOT import org-plane models (only shared + platform models)

## DATA RULES

- All outputs MUST pass through `enforceDTO()` before response
- No raw Mongoose documents may cross the bridge boundary
- Forbidden keys in DTOs: `_id`, `__v`, `organizationId`, `providerSubscriptionId`, `providerPaymentId`, `internalNotes`, `actorId`, `salesOwnerId`, `createdBy`, `metadata`
- All ObjectIds coerced to strings, all dates to ISO strings

## SECURITY RULES

- Always call `extractOrgId(req)` for org identity (JWT-derived)
- Use `assertOrgContext(req, resourceOrgId)` for cross-tenant verification
- Support bridge uses `secureModel(Ticket)` — auto org-scoped
- Billing bridge accesses platform models directly (they ARE platform-plane)
- Never trust client-provided orgId — ever
- Never bypass DTO transformers — ever

## ROUTE GUARD RULES

- Every route MUST use `authorize({ permission: "X.Y" })` for RBAC
- Every handler MUST be wrapped in `asyncHandler()` for error propagation
- Every route MUST have Swagger annotations
- Use CommonJS (`require/module.exports`) — NOT ESM (`import/export`)

## ARCHITECTURE RULE

```
Org User (JWT) → Route Guard → Bridge Service → assertOrgContext → Platform Service → DTO Transformer → enforceDTO → Response
```

NEVER:
```
Org User → Platform Service (directly)
```

## TAXONOMY RULES

All bridge files MUST have one of:
- `@rls-bridge-contract` — Contract definition (ZERO DB)
- `@rls-bridge-guard` — Pure assertion (ZERO DB)
- `@rls-bridge-passthrough` — Pure transformation or route definition (ZERO DB)
- `@rls-transactional` — Uses secureModel for DB access

## VIOLATION RESULT

Any violation = SECURITY BUG. Production deployment BLOCKED.

## FILES IN SCOPE

| File | Annotation | DB Access |
|------|-----------|-----------|
| `orgBilling.contract.js` | `@rls-bridge-contract` | None |
| `orgSupport.contract.js` | `@rls-bridge-contract` | None |
| `assertOrgContext.js` | `@rls-bridge-guard` | None |
| `transformers.js` | `@rls-bridge-passthrough` | None |
| `enforceDTO.js` | `@rls-bridge-passthrough` | None |
| `orgBillingBridge.service.js` | `@rls-bridge-passthrough` | Platform models (direct) |
| `orgSupportBridge.service.js` | `@rls-transactional` | secureModel(Ticket) |
| `settingsBilling.routes.js` | `@rls-bridge-passthrough` | None (route defs) |
| `settingsSupport.routes.js` | `@rls-bridge-passthrough` | None (route defs) |
