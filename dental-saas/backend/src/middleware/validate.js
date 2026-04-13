const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body); // assign transformed body back
        next();
    } catch (err) {
        next(err); // passes ZodError to errorHandler.js
    }
};

module.exports = validate;
