const Role = require("../models/Role");

const initializeRolesForOrganization = async (organizationId) => {

    const roles = {
        org_admin: await Role.create({
            name: "org_admin",
            organizationId,
            isSystemRole: true,
            permissions: {
                patients: { read: true, create: true, update: true, delete: true },
                appointments: { read: true, create: true, update: true, delete: true },
                recalls: { read: true, create: true, update: true, delete: true },
                families: { read: true, create: true, update: true, delete: true },
                accounting: { read: true, create: true, update: true, delete: true },
                orthodontics: { read: true, create: true, update: true, delete: true },
                calendar: { read: true, multiBranchView: true },
            },
        }),

        doctor: await Role.create({
            name: "doctor",
            organizationId,
            isSystemRole: true,
            permissions: {
                patients: { read: true, create: true, update: true, delete: false },
                appointments: { read: true, create: true, update: true, delete: false },
                recalls: { read: true, create: true, update: false, delete: false },
                families: { read: true, create: true, update: false, delete: false },
                accounting: { read: false, create: false, update: false, delete: false },
                orthodontics: { read: true, create: true, update: true, delete: false },
                calendar: { read: true, multiBranchView: false },
            },
        }),

        assistant: await Role.create({
            name: "assistant",
            organizationId,
            isSystemRole: true,
            permissions: {
                patients: { read: true, create: false, update: false, delete: false },
                appointments: { read: true, create: true, update: true, delete: false },
                recalls: { read: true, create: false, update: false, delete: false },
                families: { read: true, create: false, update: false, delete: false },
                accounting: { read: false, create: false, update: false, delete: false },
                orthodontics: { read: false, create: false, update: false, delete: false },
                calendar: { read: true, multiBranchView: false },
            },
        }),

        receptionist: await Role.create({
            name: "receptionist",
            organizationId,
            isSystemRole: true,
            permissions: {
                patients: { read: true, create: true, update: false, delete: false },
                appointments: { read: true, create: true, update: true, delete: false },
                recalls: { read: true, create: true, update: true, delete: false },
                families: { read: true, create: true, update: true, delete: false },
                accounting: { read: true, create: false, update: false, delete: false },
                orthodontics: { read: false, create: false, update: false, delete: false },
                calendar: { read: true, multiBranchView: false },
            },
        }),
    };

    return roles;
};

module.exports = initializeRolesForOrganization;