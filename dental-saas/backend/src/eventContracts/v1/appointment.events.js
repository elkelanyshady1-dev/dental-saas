module.exports = {
    APPOINTMENT_REQUESTED: {
        version: 1,
        payloadShape: {
            organizationId: "string",
            bookingId: "string",
            actorId: "string"
        }
    },
    APPOINTMENT_CREATED: {
        version: 1,
        payloadShape: {
            organizationId: "string",
            appointmentId: "string",
            patientId: "string",
            actorId: "string"
        }
    }
};
