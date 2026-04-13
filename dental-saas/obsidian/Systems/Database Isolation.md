# Database Isolation

> **Per-organization database isolation** — each clinic gets its own MongoDB database with connection-level security.

## Architecture

```
DB_MODE = "per-org"
```

### Connection Flow
```
Request → Middleware → req.dbConnection (org-specific) → Model
```

### Model Resolution
```javascript
// ✅ CORRECT — org models
const Model = getModel(req.dbConnection, schema);

// ✅ CORRECT — platform models
const PlatformModel = mongoose.model('PlatformUser');

// ❌ FORBIDDEN — global model for org data
mongoose.model('Patient');
```

## Rules

### Platform vs Org Separation
| Type | Connection | Usage |
|------|-----------|-------|
| Platform models | Global connection | `mongoose.model()` OK |
| Org models | `req.dbConnection` | `getModel()` required |

### Model Registration Pattern
```javascript
// ✅ REQUIRED export shape
module.exports = {
  modelName: 'Patient',
  schema: patientSchema,
  default: patientSchema
};
```

### RLS in Per-Org Mode
- `secureModel` — **OPTIONAL** (defense-in-depth)
- `queryScoper` — **OPTIONAL**
- `systemContext` — **KEEP** (for background jobs)
- Direct `Model.find()` — **ALLOWED** (connection-bound)

## Prohibited Patterns
- ❌ Global `mongoose.model()` for org data
- ❌ Accessing org data via platform connection
- ❌ Using `req.rls.organizationId` for filtering in per-org mode
- ❌ Hard-coding database names in services

## Related
- [[Security Architecture]]
- [[Organization Plane]]
- [[Platform Plane]]

---
#database #isolation #security
