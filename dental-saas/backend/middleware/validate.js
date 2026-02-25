const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (err) {
        next(err); // passes ZodError to errorHandler.js
    }
};

module.exports = validate;
