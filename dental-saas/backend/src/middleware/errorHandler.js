const logger = require("../utils/logger");
const { getRequestId } = require("../platform/context/requestContextStore");


const errorHandler = (err, req, res, next) => {
    // Resolve requestId from AsyncLocalStorage first, then req fallback
    const requestId = getRequestId() || req.requestId || req.correlationId || null;

    // Safe message extraction — handles circular error objects (e.g. MongoDB session errors)
    const safeMessage = (typeof err.message === 'string') ? err.message : 'Server Error';
    const safeStack = (typeof err.stack === 'string') ? err.stack : undefined;

    // Log with safe-serialize to handle MongoDB circular objects
    try {
        logger.error({
            errName: err.name,
            errMsg: safeMessage,
            route: req.originalUrl,
            method: req.method,
            stack: safeStack,
            requestId,             // ← enables direct log correlation
        }, `[ERROR_HANDLER] ${safeMessage}`);
    } catch (logErr) {
        console.error('[ErrorHandler] logger.error failed:', logErr.message);
    }

    // log the error and then build a safe response object
    let error = new Error(safeMessage);
    error.statusCode = err.statusCode || err.status || 500;

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found`;
        error = new Error(message);
        error.statusCode = 404;
    }

    // Mongoose duplicate key — early-return with structured field-level error
    if (err.code === 11000) {
        const rawField = Object.keys(err.keyValue || {})[0] || 'field';

        // Human-readable field label map — extend as new unique indexes are added
        const FIELD_LABEL_MAP = {
            email: 'Admin email',
            adminEmail: 'Admin email',
            name: 'Organization name',
            slug: 'Organization slug',
            templateCode: 'Plan template code',
            invoiceNumber: 'Invoice number',
        };

        const label = FIELD_LABEL_MAP[rawField] || rawField;

        try {
            logger.warn(
                { rawField, route: req.originalUrl, method: req.method },
                `[ERROR_HANDLER] DUPLICATE_FIELD: ${rawField}`
            );
        } catch (_) { /* non-fatal */ }

        return res.status(400).json({
            success: false,
            code: 'DUPLICATE_FIELD',
            message: `${label} already exists`,
            field: rawField,
            requestId,
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = err.errors || {};
        const message = Object.values(errors).map(val => val.message).join(', ');
        error = new Error(message);
        error.statusCode = 400;
    }

    // Zod validation error
    if (err.name === 'ZodError') {
        const issues = err.issues || err.errors || [];
        const message = issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        error = new Error(message);
        error.statusCode = 400;
    }

    const statusCode = error.statusCode || err.statusCode || err.status || 500;

    try {
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Server Error',
            errorCode: err.errorCode || 'INTERNAL_ERROR',
            requestId,             // ← always present so frontend/support can trace the request
            ...(process.env.NODE_ENV === 'development' && { stack: safeStack })
        });
    } catch (jsonErr) {
        // Last resort — avoid crashing if JSON.stringify fails
        res.status(statusCode).json({
            success: false,
            message: 'Server Error (serialization failed)',
            errorCode: 'SERIALIZATION_ERROR',
            requestId,
        });
    }
};

module.exports = errorHandler;
