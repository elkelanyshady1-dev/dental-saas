# 📘 DENTAL SAAS — FINAL MONGOOSE MODELS (TDS)

---

# 🟦 PLATFORM DB MODELS (`platform_db`)

---

## 1. Organization

```javascript
// src/platform/models/Organization.model.js

const mongoose = require("mongoose");

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true },

  // 🔥 CLUSTER ROUTING (LOAD-BASED)
  cluster: {
    type: String,
    required: true,
    index: true
  },

  plan: {
    type: String,
    enum: ["free", "pro", "enterprise"],
    default: "free"
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = {
  modelName: "Organization",
  schema: OrganizationSchema
};
```

---

## 2. Platform User (Admin / Owner)

```javascript
// src/platform/models/PlatformUser.model.js

const mongoose = require("mongoose");

const PlatformUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },

  role: {
    type: String,
    enum: ["admin", "support"],
    default: "admin"
  }

}, { timestamps: true });

module.exports = {
  modelName: "PlatformUser",
  schema: PlatformUserSchema
};
```

---

## 3. Refresh Token

```javascript
// src/platform/models/RefreshToken.model.js

const mongoose = require("mongoose");

const RefreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },

  tokenHash: { type: String, required: true, index: true },

  expiresAt: { type: Date, required: true },

  revoked: { type: Boolean, default: false }

}, { timestamps: true });

module.exports = {
  modelName: "RefreshToken",
  schema: RefreshTokenSchema
};
```

---

## 4. Event Outbox (Platform)

```javascript
// src/platform/models/EventOutbox.model.js

const mongoose = require("mongoose");

const EventOutboxSchema = new mongoose.Schema({
  type: { type: String, required: true },

  payload: { type: Object, required: true },

  status: {
    type: String,
    enum: ["pending", "processing", "processed", "failed"],
    default: "pending",
    index: true
  }

}, { timestamps: true });

module.exports = {
  modelName: "EventOutbox",
  schema: EventOutboxSchema
};
```

---

# 🟩 ORG DB MODELS (`org_<orgId>_db`)

---

## 1. Patient (AGGREGATE ROOT)

```javascript
// src/modules/patient/models/Patient.model.js

const mongoose = require("mongoose");

const PatientSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },

  personal: {
    name: String,
    phone: String,
    gender: String,
    dob: Date
  },

  medical: {
    allergies: [String],
    conditions: [String]
  },

  financial: {
    balance: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 }
  },

  recalls: [
    {
      date: Date,
      note: String,
      status: String
    }
  ]

}, { timestamps: true });

module.exports = {
  modelName: "Patient",
  schema: PatientSchema
};
```

---

## 2. User (Clinic Staff)

```javascript
// src/modules/user/models/User.model.js

const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },

  name: String,
  email: String,

  roleId: mongoose.Schema.Types.ObjectId,
  branchId: mongoose.Schema.Types.ObjectId

}, { timestamps: true });

module.exports = {
  modelName: "User",
  schema: UserSchema
};
```

---

## 3. Appointment

```javascript
// src/modules/appointment/models/Appointment.model.js

const mongoose = require("mongoose");

const AppointmentSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, index: true },

  date: { type: Date, index: true },
  status: String,

  notes: String,

  visit: {
    diagnosis: String,
    procedures: [String]
  }

}, { timestamps: true });

module.exports = {
  modelName: "Appointment",
  schema: AppointmentSchema
};
```

---

## 4. Orthodontic Case (🔥 CORE)

```javascript
// src/modules/ortho/models/OrthodonticCase.model.js

const mongoose = require("mongoose");

const OrthodonticCaseSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, index: true },

  status: String,

  // ================= RECORD SETS =================
  recordSets: [
    {
      type: String, // pre, mid, post
      date: Date,

      files: [
        {
          fileId: mongoose.Schema.Types.ObjectId,
          type: String
        }
      ]
    }
  ],

  // ================= SNAPSHOTS =================
  snapshots: [
    {
      name: String,
      createdAt: Date,

      teeth: [
        {
          toothNumber: Number,

          brackets: {
            type: String,
            position: Number,
            prescription: String
          },

          tads: {
            placed: Boolean,
            position: String
          },

          movements: [
            {
              type: String,
              value: Number
            }
          ]
        }
      ]
    }
  ],

  // ================= ANALYSIS =================
  analysis: {
    cephAnalysisId: mongoose.Schema.Types.ObjectId,
    problems: [String],
    goals: [String]
  },

  // ================= PLAN =================
  treatmentPlan: {
    steps: [
      {
        stage: Number,
        actions: [String]
      }
    ]
  },

  // ================= VISITS =================
  visits: [
    {
      date: Date,
      notes: String,

      procedures: [
        {
          type: String,
          teeth: [Number]
        }
      ]
    }
  ]

}, { timestamps: true });

module.exports = {
  modelName: "OrthodonticCase",
  schema: OrthodonticCaseSchema
};
```

---

## 5. Financial (MERGED)

```javascript
// src/modules/finance/models/Financial.model.js

const mongoose = require("mongoose");

const FinancialSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, index: true },

  invoices: [
    {
      amount: Number,
      status: String,
      createdAt: Date
    }
  ],

  payments: [
    {
      amount: Number,
      method: String,
      date: Date
    }
  ]

}, { timestamps: true });

module.exports = {
  modelName: "Financial",
  schema: FinancialSchema
};
```

---

## 6. File (U-CAP)

```javascript
// src/modules/file/models/File.model.js

const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, index: true },

  type: {
    type: String,
    enum: ["photo", "dicom", "stl", "document"]
  },

  fileKey: { type: String, required: true, unique: true },

  size: Number,
  mimeType: String

}, { timestamps: true });

module.exports = {
  modelName: "File",
  schema: FileSchema
};
```

---

## 7. Inventory

```javascript
// src/modules/inventory/models/Inventory.model.js

const mongoose = require("mongoose");

const InventorySchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },

  items: [
    {
      name: String,
      quantity: Number
    }
  ]

}, { timestamps: true });

module.exports = {
  modelName: "Inventory",
  schema: InventorySchema
};
```

---

## 8. Audit Log

```javascript
// src/modules/audit/models/AuditLog.model.js

const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, index: true },

  action: String,
  userId: mongoose.Schema.Types.ObjectId,

  metadata: Object

}, { timestamps: true });

module.exports = {
  modelName: "AuditLog",
  schema: AuditLogSchema
};
```

---

# 🎯 FINAL RESULT

- ✅ ~10 collections per org
- ✅ Embedded orthodontic system
- ✅ Minimal indexes
- ✅ U-CAP compliant
- ✅ Multi-cluster ready

---

# 🚀 NEXT STEP

Implement:

- getModel(connection, modelDef)
- resolveOrgConnection(orgId)
- cluster-aware dbManager

---

END OF TDS