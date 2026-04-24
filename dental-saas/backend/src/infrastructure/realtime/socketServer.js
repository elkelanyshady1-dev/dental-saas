const {
  Server
} = require("socket.io");
const socketAuth = require("./socketAuth");
const eventBus = require("../../core/eventBus");
const logger = require("../../utils/logger");
const getModel = require("../../core/db/getModel");
const getPlatformModel = require("../../core/db/getPlatformModel");
const { resolveOrgConnection } = require("../../core/db/connectionResolver");
const SharedCaseDef = require("../../modules/orthodontics/models/SharedCase.model");
const ShareLinkDef = require("../../platform/shareLink/ShareLink.model");
const {
  APPOINTMENT_REQUESTED,
  APPOINTMENT_CREATED,
  BOOKING_APPROVED,
  BOOKING_REJECTED
} = require("../../core/domainEvents");
let io;

// ── R6: Connection Metrics ────────────────────────────────────────────────────
// Track active connections per org for observability dashboards.
// Key: orgId → Set<socketId>
const _connectionsByOrg = new Map();
let _totalConnections = 0;
let _totalDisconnections = 0;
const initSocket = server => {
  io = new Server(server, {
    cors: {
      // Credentials (httpOnly cookie) require explicit origin — cannot use "*"
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // ─── Main Namespace (JWT Auth) ────────────────────────────────────────────
  io.use(socketAuth);
  io.on("connection", socket => {
    const {
      organizationId,
      user
    } = socket;
    // JWT payload shape: userId (not id) — set by socketAuth.js line 83
    const userId = user.userId || user.id;
    const connectedAt = Date.now();

    // ── R6: Track connection ─────────────────────────────────────────
    _totalConnections++;
    if (!_connectionsByOrg.has(organizationId)) {
      _connectionsByOrg.set(organizationId, new Set());
    }
    _connectionsByOrg.get(organizationId).add(socket.id);
    const orgCount = _connectionsByOrg.get(organizationId).size;
    logger.info({
      socketId: socket.id,
      userId,
      orgId: organizationId,
      branchId: user.branchId || null,
      orgActiveConnections: orgCount,
      totalConnections: _totalConnections
    }, "[Socket:Connected] New socket connection");

    // 🏢 ORG ISOLATION — all staff in the org share this room
    socket.join(`org:${organizationId}`);

    // 👤 USER ISOLATION — personal notifications / task assignments
    socket.join(`user:${userId}`);

    // Join Branch Room if available in token
    if (user.branchId) {
      socket.join(`branch:${user.branchId}`);
    }
    socket.on("disconnect", reason => {
      // ── R6: Track disconnection ──────────────────────────────────
      _totalDisconnections++;
      const orgSockets = _connectionsByOrg.get(organizationId);
      if (orgSockets) {
        orgSockets.delete(socket.id);
        if (orgSockets.size === 0) {
          _connectionsByOrg.delete(organizationId);
        }
      }
      const lifetime = Date.now() - connectedAt;
      logger.info({
        socketId: socket.id,
        userId,
        orgId: organizationId,
        reason,
        lifetimeMs: lifetime,
        orgActiveConnections: orgSockets?.size || 0,
        totalDisconnections: _totalDisconnections
      }, "[Socket:Disconnected] Socket disconnected");
    });
  });

  // ─── Collab Namespace (Public — Share Token Auth) ──────────────────────────
  // Used by SharedCaseView for real-time comments sync.
  // NO JWT required — validated by share token only.
  //
  // Two-step resolution (v9.4):
  //   1. ShareLink (platform) holds { token → caseId, organizationId }
  //   2. Once orgId is known, SharedCase is fetched from that org's tenant DB
  const ShareLink = getPlatformModel(ShareLinkDef);
  const collabNs = io.of("/collab");
  collabNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.shareToken;
    if (!token) return next(new Error("Share token required"));
    try {
      const link = await ShareLink.findOne({ token, isRevoked: false }).lean();
      if (!link) return next(new Error("Invalid share token"));
      if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
        return next(new Error("Share link expired"));
      }
      const orgConn = await resolveOrgConnection(String(link.orgId));
      const SharedCase = getModel(orgConn, SharedCaseDef);
      const shared = await SharedCase.findOne({
        token,
        isRevoked: false
      }).lean();
      if (!shared) return next(new Error("Invalid share token"));
      if (new Date() > new Date(shared.expiresAt)) return next(new Error("Share link expired"));
      socket.shareId = shared._id.toString();
      socket.shareToken = token;
      socket.organizationId = String(link.orgId);
      socket.collaboratorName = socket.handshake.auth?.name || "Anonymous";
      socket.collaboratorRole = socket.handshake.auth?.role || "doctor";
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });
  collabNs.on("connection", socket => {
    const room = `share:${socket.shareId}`;
    socket.join(room);
    logger.info({
      socketId: socket.id,
      shareId: socket.shareId,
      name: socket.collaboratorName
    }, "[Collab] User joined shared case room");

    // Notify others in room
    socket.to(room).emit("collaborator:joined", {
      name: socket.collaboratorName,
      role: socket.collaboratorRole,
      socketId: socket.id
    });

    // ─── Listen for new comments ────────────────────────
    socket.on("comment:new", commentData => {
      // Broadcast to ALL in room (including sender for confirmation)
      collabNs.to(room).emit("comment:added", {
        ...commentData,
        _fromSocket: socket.id // Client can skip if it's own
      });
    });

    // ─── Typing indicator ───────────────────────────────
    socket.on("typing:start", () => {
      socket.to(room).emit("typing:indicator", {
        name: socket.collaboratorName,
        isTyping: true
      });
    });
    socket.on("typing:stop", () => {
      socket.to(room).emit("typing:indicator", {
        name: socket.collaboratorName,
        isTyping: false
      });
    });
    socket.on("disconnect", () => {
      socket.to(room).emit("collaborator:left", {
        name: socket.collaboratorName,
        role: socket.collaboratorRole
      });
      logger.info({
        socketId: socket.id,
        shareId: socket.shareId,
        name: socket.collaboratorName
      }, "[Collab] User left shared case room");
    });
  });

  // Register Event Bus Listeners for Live Broadcasts
  registerDomainEventListeners();
  return io;
};
const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
const registerDomainEventListeners = () => {
  // Lazy-require to avoid circular dependency during module initialization
  const {
    emitToOrg
  } = require("./eventEmitter");

  // ─── Booking Events (legacy eventBus → versioned emit) ────────────────
  [APPOINTMENT_REQUESTED, APPOINTMENT_CREATED, BOOKING_APPROVED, BOOKING_REJECTED].forEach(event => {
    eventBus.on(event, payload => {
      const {
        organizationId
      } = payload;

      // Versioned event via hardened emitter (R1–R5+R7 enforced)
      emitToOrg(organizationId, "booking.update.v1", {
        type: event.toUpperCase().replace(/\./g, "_"),
        appointmentId: payload.appointmentId || payload._id,
        branchId: payload.branchId,
        timestamp: new Date().toISOString()
      }, {
        skipAuth: false
      });
    });
  });

  // ─── Appointment Domain Events (Phase 13 — real-time calendar sync) ────
  const {
    APPOINTMENT_CREATED: APT_CREATED,
    APPOINTMENT_STATUS_CHANGED: APT_STATUS_CHANGED,
    APPOINTMENT_UPDATED: APT_UPDATED
  } = require("../../core/domainEvents");

  // appointment.created.v1 — emitted by appointmentService.create()
  eventBus.on(APT_CREATED, payload => {
    const {
      organizationId,
      appointmentId,
      branchId,
      patientId,
      dentistId,
      date
    } = payload;
    emitToOrg(organizationId, "appointment.created.v1", {
      id: appointmentId || payload._id,
      branchId,
      patientId,
      dentistId,
      date
    });
  });

  // appointment.updated.v1 — emitted by appointmentService on edit/reschedule
  eventBus.on(APT_UPDATED, payload => {
    const {
      organizationId,
      appointmentId,
      branchId,
      date,
      startTime,
      endTime
    } = payload;
    emitToOrg(organizationId, "appointment.updated.v1", {
      id: appointmentId || payload._id,
      branchId,
      date,
      startTime,
      endTime
    });
  });

  // appointment.status_changed.v1 — emitted by appointmentService.updateStatus()
  eventBus.on(APT_STATUS_CHANGED, payload => {
    const {
      organizationId,
      appointmentId,
      status,
      previousStatus,
      branchId
    } = payload;
    emitToOrg(organizationId, "appointment.status_changed.v1", {
      id: appointmentId || payload._id,
      status,
      previousStatus,
      branchId
    });
  });

  // ─── Patient Domain Events ────────────────────────────────────────────
  const {
    PATIENT_CREATED,
    PATIENT_UPDATED,
    PATIENT_DELETED,
    PATIENT_STATUS_CHANGED,
    PATIENT_BRANCH_UPDATED,
    PATIENT_MEDICAL_UPDATED,
    PATIENT_POLICY_UPDATED
  } = require("../../core/domainEvents");

  // Map internal event → versioned socket event
  const PATIENT_EVENT_MAP = {
    [PATIENT_CREATED]: "patient.created.v1",
    [PATIENT_UPDATED]: "patient.updated.v1",
    [PATIENT_DELETED]: "patient.deleted.v1",
    [PATIENT_STATUS_CHANGED]: "patient.status_changed.v1",
    [PATIENT_BRANCH_UPDATED]: "patient.updated.v1",
    [PATIENT_MEDICAL_UPDATED]: "patient.updated.v1",
    [PATIENT_POLICY_UPDATED]: "patient.updated.v1"
  };
  Object.entries(PATIENT_EVENT_MAP).forEach(([busEvent, socketEvent]) => {
    eventBus.on(busEvent, payload => {
      const {
        organizationId,
        patientId
      } = payload;
      emitToOrg(organizationId, socketEvent, {
        id: patientId || payload._id
      });
    });
  });

  // ─── Audit Domain Events ──────────────────────────────────────────────
  const {
    AUDIT_EVENT_CREATED,
    GOVERNANCE_VIOLATION_DETECTED
  } = require("../../core/domainEvents");
  eventBus.on(AUDIT_EVENT_CREATED, payload => {
    const {
      organizationId
    } = payload;
    if (!organizationId) return;
    emitToOrg(organizationId, "audit.event.v1", {
      type: "AUDIT_EVENT_CREATED",
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId,
      actorId: payload.actorId,
      timestamp: payload.timestamp || new Date().toISOString()
    });
  });
  eventBus.on(GOVERNANCE_VIOLATION_DETECTED, payload => {
    const {
      organizationId
    } = payload;
    if (!organizationId) return;
    emitToOrg(organizationId, "governance.violation.v1", {
      type: "GOVERNANCE_VIOLATION",
      rule: payload.rule,
      severity: payload.severity,
      message: payload.message,
      timestamp: new Date().toISOString()
    });
  });

  // TODO: Add Redis adapter for multi-instance horizontal scaling
};

// ═══════════════════════════════════════════════════════════════
// R6: Connection Metrics Export
// ═══════════════════════════════════════════════════════════════

/**
 * getConnectionMetrics
 *
 * Returns current real-time connection metrics for observability.
 * Can be exposed via an internal admin endpoint or health check.
 *
 * @returns {{ totalConnections: number, totalDisconnections: number, activeByOrg: object }}
 */
function getConnectionMetrics() {
  const activeByOrg = {};
  for (const [orgId, sockets] of _connectionsByOrg.entries()) {
    activeByOrg[orgId] = sockets.size;
  }
  return {
    totalConnections: _totalConnections,
    totalDisconnections: _totalDisconnections,
    activeConnections: _totalConnections - _totalDisconnections,
    activeOrgs: _connectionsByOrg.size,
    activeByOrg
  };
}
module.exports = {
  initSocket,
  getIO,
  getConnectionMetrics
};