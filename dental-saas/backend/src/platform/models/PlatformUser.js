const mongoose = require("mongoose");
const platformUserSchema = new mongoose.Schema({
  // ── Name fields ──────────────────────────────────────────────────────────
  // firstName + lastName are the authoritative split fields.
  // `name` is kept in sync by the pre-save hook below (backward-compat).
  firstName: {
    type: String,
    default: null
  },
  lastName: {
    type: String,
    default: null
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true,
    select: false,
    validate: {
      validator: function (v) {
        return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
      },
      message: "Password must be a valid bcrypt hash"
    }
  },
  role: {
    type: String,
    enum: ["superadmin", "finance_admin", "operations_admin", "analyst"],
    default: "analyst",
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  passwordResetExpires: Date,
  // 🔒 v1.3.5 - Superadmin 2FA & Lockout
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecretEncrypted: {
    type: String,
    // AES-256-GCM encrypted
    select: false
  },
  recoveryCodes: [{
    codeHash: String,
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date
  }],
  failed2FAAttempts: {
    type: Number,
    default: 0
  },
  lastFailed2FAAt: Date,
  twoFALockedUntil: Date,
  trustedIPs: [{
    ip: String,
    lastUsedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // v20.2 — Last successful login timestamp for audit UX and anomaly detection
  lastLogin: {
    type: Date,
    default: null
  },
  // v24.0 — Invite-based onboarding fields
  inviteToken: {
    type: String,
    select: false // hashed token — never sent to client
  },
  inviteTokenExpires: {
    type: Date
  },
  // v25.0 — Visual identity & contact fields
  profileImage: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  whatsapp: {
    type: String,
    default: null
  },
  jobTitle: {
    type: String,
    default: null
  },
  department: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// ── Virtual: displayName ──────────────────────────────────────────────────────
platformUserSchema.virtual("displayName").get(function () {
  if (this.firstName || this.lastName) {
    return [this.firstName, this.lastName].filter(Boolean).join(" ");
  }
  return this.name;
});

// ── Pre-save: keep `name` in sync with firstName + lastName ──────────────────
platformUserSchema.pre("save", async function () {
  if (this.firstName || this.lastName) {
    this.name = [this.firstName, this.lastName].filter(Boolean).join(" ");
  }
});
platformUserSchema.index({
  name: 1
});
platformUserSchema.index({
  email: 1
}, {
  unique: true
});
const modelName = "PlatformUser";
module.exports = {
  modelName,
  schema: platformUserSchema
};