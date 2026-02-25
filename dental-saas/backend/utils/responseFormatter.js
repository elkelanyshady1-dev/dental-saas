exports.successResponse = (res, data, meta = {}) => {
    return res.status(200).json({
        success: true,
        data,
        meta,
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
