exports.successResponse = (res, data, metaOrStatus = {}) => {
    // If metaOrStatus is a number, it's an HTTP status code (e.g., 201 for create)
    const status = typeof metaOrStatus === "number" ? metaOrStatus : 200;
    const meta = typeof metaOrStatus === "object" ? metaOrStatus : {};

    return res.status(status).json({
        success: true,
        data,
        ...(meta && Object.keys(meta).length > 0 ? { pagination: meta } : {}),
        error: null
    });
};

exports.errorResponse = (res, message, code = "GENERIC_ERROR", status = 400) => {
    return res.status(status).json({
        success: false,
        data: null,
        error: { code, message }
    });
};
