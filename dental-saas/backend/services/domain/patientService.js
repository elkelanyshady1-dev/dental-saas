const Patient = require("../../models/Patient");
const buildTenantFilter = require("../../utils/tenantQuery");

/**
 * Patient Domain Service
 * Encapsulates business rules for patient management.
 */
class PatientService {
    async getPatients(req, search, page = 1, limit = 20) {
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const query = buildTenantFilter(req);

        if (search) {
            const words = search.toLowerCase().trim().split(/\s+/);
            query.$and = words.map((word) => ({
                fullName: { $regex: word, $options: "i" },
            }));
        }

        const [patients, total] = await Promise.all([
            Patient.find(query)
                .populate("firstVisitBranchId", "name")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Patient.countDocuments(query),
        ]);

        return {
            patients,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        };
    }

    async getPatient(req, id) {
        const query = buildTenantFilter(req, { _id: id });
        const patient = await Patient.findOne(query).populate("firstVisitBranchId", "name");

        if (!patient) {
            throw new Error("Patient not found");
        }

        return patient;
    }
}

module.exports = new PatientService();
