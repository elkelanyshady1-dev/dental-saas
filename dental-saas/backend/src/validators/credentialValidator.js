const { z } = require("zod");

const manageCredentialsSchema = z.object({
    mode: z.enum([
        "force_logout",
        "set_password",
        "temporary_password",
        "send_reset_email"
    ]),
    password: z.string().min(8).optional(), // Required for set_password
});

module.exports = {
    manageCredentialsSchema
};
