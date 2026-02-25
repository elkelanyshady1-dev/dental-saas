const express = require("express");
const app = express();
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

const cookieParser = require("cookie-parser");
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

const requestContext = require("./middleware/requestContext");
app.use(requestContext);

const responseFormatter = require("./middleware/responseFormatter");
app.use(responseFormatter);

const cors = require("cors");
const path = require("path");

const isProd = process.env.NODE_ENV === "production";

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: isProd ? 15 * 60 * 1000 : 1 * 60 * 1000, // Prod: 15 min, Dev: 1 min
    max: isProd ? 5 : 20,
    message: "Too many login attempts from this IP, please try again later",
});

const authRoutes = require("./routes/authRoutes");
const platformAuthRoutes = require("./routes/platformAuthRoutes");
const platformRoutes = require("./routes/platformRoutes");
const platformUserRoutes = require("./routes/platformUserRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const publicRoutes = require("./routes/publicRoutes");
const patientRoutes = require("./routes/patientRoutes");
const familyRoutes = require("./routes/familyRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const recallRoutes = require("./routes/recallRoutes");
const healthRoutes = require("./routes/healthRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const protect = require("./middleware/authMiddleware");
const orgProtect = require("./middleware/orgProtect");
const organizationContext = require("./middleware/organizationMiddleware");
const subscriptionGuard = require("./middleware/subscriptionGuard");
const auditLogger = require("./middleware/auditLogger");
const platformAuditLogger = require("./middleware/platformAuditLogger");



const corsOptions = isProd
    ? { origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false }
    : {};

app.use(cors(corsOptions));

app.use("/api/platform/login", loginLimiter, platformAuthRoutes);
app.use("/api/platform", platformAuthRoutes);
// Serve uploaded files (patient photos)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/health", healthRoutes);

// Rate limiters ...
// Public routes ...
app.use("/api/public", publicRoutes);

app.use(subscriptionGuard);
app.use(auditLogger);
app.use(platformAuditLogger);


// ─── API Version 1 Mapping ───
const v1Router = express.Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/organizations", organizationRoutes);
v1Router.use("/platform", platformRoutes);
v1Router.use("/platform/users", platformUserRoutes);
v1Router.use("/patients", patientRoutes);
v1Router.use("/families", familyRoutes);
v1Router.use("/appointments", appointmentRoutes);
v1Router.use("/recalls", recallRoutes);
v1Router.use("/settings", settingsRoutes);

// Mount v1
app.use("/api/v1", v1Router);

// Original routes (maintained for backward compatibility)
// TODO: Deprecate primary /api paths in favor of /api/v1
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/platform/users", platformUserRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/families", familyRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/recalls", recallRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/protected", protect, (req, res) => {
    res.json({
        message: "You accessed protected route",
        user: req.user,
    });
});

app.get(
    "/api/org-test",
    orgProtect,
    organizationContext,
    (req, res) => {
        res.json({
            message: "Organization context working",
            organization: req.organization?.name || "Superadmin access",
        });
    }
);

app.get("/", (req, res) => {
    res.send("Dental SaaS API Running...");
});

// Global Error Handler must be the last middleware
app.use(errorHandler);

module.exports = app;