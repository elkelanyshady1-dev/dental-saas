const swaggerJsdoc = require("swagger-jsdoc");

const options = {
    definition: {
        openapi: "3.0.0",

        info: {
            title: "DentalSaaS API",
            version: "1.3.0",
            description: "Enterprise Multi-Tenant SaaS API Documentation",
        },

        servers: [
            {
                url: process.env.BASE_URL || "http://localhost:5000/api/v1",
            },
        ],

        tags: [
            { name: "Authentication", description: "Authentication & session management" },
            { name: "Platform", description: "Platform administration endpoints" },
            { name: "Organization", description: "Organization-level operational endpoints" }
        ],

        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },

            schemas: {

                /* ============================= */
                /* Standard Response Contracts   */
                /* ============================= */

                ApiResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: true },
                        data: { type: "object", nullable: true },
                        meta: { type: "object", nullable: true },
                        error: { type: "object", nullable: true }
                    }
                },

                ErrorResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: false },
                        data: { type: "object", nullable: true, example: null },
                        error: {
                            type: "object",
                            properties: {
                                code: { type: "string", example: "INVALID_CREDENTIALS" },
                                message: { type: "string", example: "Invalid email or password" }
                            }
                        }
                    }
                },

                PaginatedResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: true },
                        data: {
                            type: "array",
                            items: { type: "object" }
                        },
                        meta: {
                            type: "object",
                            properties: {
                                page: { type: "number", example: 1 },
                                limit: { type: "number", example: 10 },
                                total: { type: "number", example: 100 }
                            }
                        },
                        error: { type: "object", nullable: true }
                    }
                },

                /* ============================= */
                /* Core Domain Models            */
                /* ============================= */

                Organization: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        slug: { type: "string" },
                        country: { type: "string" },
                        subscription: {
                            type: "object",
                            properties: {
                                status: { type: "string", example: "active" },
                                tier: { type: "string", example: "pro" },
                                trialEndsAt: { type: "string", format: "date-time" }
                            }
                        },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                User: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        roleId: { type: "string" },
                        organizationId: { type: "string" },
                        isActive: { type: "boolean" },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                Patient: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        phone: { type: "string" },
                        organizationId: { type: "string" },
                        branchId: { type: "string" },
                        isActive: { type: "boolean" },
                        createdAt: { type: "string", format: "date-time" }
                    }
                }

            }
        },

        security: [
            {
                bearerAuth: [],
            },
        ],
    },

    apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;