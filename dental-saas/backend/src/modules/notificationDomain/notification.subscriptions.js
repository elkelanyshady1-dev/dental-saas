/**
 * notification.subscriptions.js
 *
 * Registers all eventBus listeners that feed the Notification Engine.
 * Call this ONCE at server startup (in app.js or server.js).
 *
 * Rules:
 *  - Each handler calls enqueueNotification — never creates DB records directly.
 *  - organizationId MUST come from the emitted event payload — never from client.
 *  - Handlers are non-blocking and non-fatal on error.
 */

const eventBus = require("../../core/eventBus");
const {
  enqueueNotification
} = require("./notification.service");
const events = require("../../core/domainEvents");
const logger = require("@utils/logger");

/** Safe wrapper — subscription errors NEVER crash the process */
function safeHandler(name, fn) {
  return async payload => {
    try {
      await fn(payload);
    } catch (err) {
      logger.error({
        event: name,
        err: err.message
      }, "[NotificationSub] Handler error");
    }
  };
}

// ── PATIENT_CREATED ───────────────────────────────────────────────────────────
eventBus.on(events.PATIENT_CREATED, safeHandler("PATIENT_CREATED", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "PATIENT_CREATED",
    title: "New Patient Added",
    message: `Patient "${payload.patientName || "New patient"}" has been created.`,
    entityType: "PATIENT",
    entityId: payload.patientId,
    priority: "normal"
  });
}));

// ── APPOINTMENT_CREATED / APPOINTMENT_BOOKED ──────────────────────────────────
const onAppointment = safeHandler("APPOINTMENT_CREATED", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "APPOINTMENT_BOOKED",
    title: "Appointment Scheduled",
    message: `A new appointment has been scheduled${payload.patientName ? ` for ${payload.patientName}` : ""}.`,
    entityType: "APPOINTMENT",
    entityId: payload.appointmentId,
    priority: "normal"
  });
});
eventBus.on(events.APPOINTMENT_CREATED, onAppointment);
eventBus.on(events.PATIENT_BOOKING_REQUESTED, safeHandler("BOOKING_REQUESTED", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "BOOKING_REQUESTED",
    title: "New Booking Request",
    message: `A booking request is pending approval${payload.patientName ? ` from ${payload.patientName}` : ""}.`,
    entityType: "BOOKING_REQUEST",
    entityId: payload.bookingRequestId,
    priority: "normal"
  });
}));

// ── INVOICE_OVERDUE ───────────────────────────────────────────────────────────
eventBus.on(events.INVOICE_OVERDUE, safeHandler("INVOICE_OVERDUE", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "INVOICE_OVERDUE",
    title: "Invoice Overdue",
    message: `Invoice${payload.invoiceNumber ? ` #${payload.invoiceNumber}` : ""} is overdue${payload.amount ? ` — ${payload.amount}` : ""}.`,
    entityType: "INVOICE",
    entityId: payload.invoiceId,
    priority: "high",
    metadata: {
      allowedRoles: ["admin", "receptionist", "accountant"]
    }
  });
}));

// ── SECURITY_ALERT ────────────────────────────────────────────────────────────
eventBus.on(events.SECURITY_ALERT, safeHandler("SECURITY_ALERT", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "SECURITY_ALERT",
    title: "Security Alert",
    message: payload.message || "A security event was detected on your account.",
    priority: "high",
    metadata: {
      allowedRoles: ["admin"],
      ...(payload.metadata || {})
    }
  });
}));

// ── ORG_LOGO_UPDATED ──────────────────────────────────────────────────────────
eventBus.on(events.ORG_LOGO_UPDATED, safeHandler("ORG_LOGO_UPDATED", async payload => {
  if (!payload?.organizationId) return;
  await enqueueNotification({
    type: "ORG_LOGO_UPDATED",
    title: "Organization Logo Updated",
    message: "The organization logo has been updated successfully.",
    priority: "low",
    metadata: {
      allowedRoles: ["admin"]
    }
  });
}));
logger.info("[NotificationSub] All notification event subscriptions registered");