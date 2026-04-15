exports.successResponse = (res, data, metaOrStatus = {}, extraMeta = null) => {
    // If metaOrStatus is a number, it's an HTTP status code (e.g., 201 for create)
    const status = typeof metaOrStatus === "number" ? metaOrStatus : 200;
    const pagination = typeof metaOrStatus === "object" && !Array.isArray(metaOrStatus)
        ? metaOrStatus
        : null;

    const body = { success: true, data, error: null };
    if (pagination && Object.keys(pagination).length > 0) {
        body.pagination = pagination;
    }
    // `extraMeta` is a top-level `meta` envelope — used for out-of-band flags
    // like `{ forceRefresh: true }` that the frontend consumes independently
    // of the `data` payload. Back-compat: absent unless explicitly provided.
    if (extraMeta && typeof extraMeta === "object" && Object.keys(extraMeta).length > 0) {
        body.meta = extraMeta;
    }

    return res.status(status).json(body);
};

exports.errorResponse = (res, message, code = "GENERIC_ERROR", status = 400) => {
    return res.status(status).json({
        success: false,
        data: null,
        error: { code, message }
    });
};
