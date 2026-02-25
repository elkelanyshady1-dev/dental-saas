const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log the full error to Pino in development or specific errors in prod
    logger.error({
        err,
        stack: err.stack,
        route: req.originalUrl,
        method: req.method,
        user: req.user ? { id: req.user._id, platformRole: req.user.platformRole } : null
    }, `[PLATFORM_ERROR_DEBUG] ${err.message}`);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found`;
        error = new Error(message);
        error.statusCode = 404;
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = new Error(message);
        error.statusCode = 400;
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

    const statusCode = error.statusCode || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: error.message || 'Server Error',
        errorCode: err.errorCode || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
