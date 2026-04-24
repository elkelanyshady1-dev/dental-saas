// Wrapper to eliminate try/catch blocks in controllers
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        // TEMP DEBUG checkpoint — remove after root cause identified.
        // Proves the error originated inside an asyncHandler-wrapped
        // controller (as opposed to global middleware). Does not swallow
        // or mutate the error — just logs then forwards to errorHandler.
        console.error(
            "🔥 ASYNC_HANDLER CAUGHT",
            req.method, req.originalUrl,
            "| err.name:", err?.name,
            "| err.message:", err?.message,
            "| err.statusCode:", err?.statusCode,
            "| err.code:", err?.code
        );
        next(err);
    });
};

module.exports = asyncHandler;
