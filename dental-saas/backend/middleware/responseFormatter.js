const responseFormatter = (req, res, next) => {
    res.success = (data, message = "Success", statusCode = 200) => {
        return res.status(statusCode).json({
            success: true,
            message,
            data
        });
    };

    res.created = (data, message = "Resource created successfully") => {
        return res.status(201).json({
            success: true,
            message,
            data
        });
    };

    res.error = (message = "Server Error", statusCode = 500, errorCode = "INTERNAL_ERROR") => {
        return res.status(statusCode).json({
            success: false,
            message,
            errorCode
        });
    };

    next();
};

module.exports = responseFormatter;
