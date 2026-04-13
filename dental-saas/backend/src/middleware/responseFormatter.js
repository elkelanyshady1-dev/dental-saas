const responseFormatter = (req, res, next) => {
    res.success = (data, message = "Success", statusCode = 200) => {
        return res.status(statusCode).json({
            success: true,
            message,
            requestId: req.requestId,  // X-Request-ID for client-side correlation
            data
        });
    };

    res.created = (data, message = "Resource created successfully") => {
        return res.status(201).json({
            success: true,
            message,
            requestId: req.requestId,
            data
        });
    };

    res.error = (message = "Server Error", statusCode = 500, errorCode = "INTERNAL_ERROR") => {
        return res.status(statusCode).json({
            success: false,
            message,
            errorCode,
            requestId: req.requestId  // Included in error bodies so frontend can log it
        });
    };

    next();
};

module.exports = responseFormatter;

