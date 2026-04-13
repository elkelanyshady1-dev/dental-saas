import { portalApi } from '@/modules/patientDomain/shared/api/patientDomain.api';

class PatientPortalService {
    async getProfile() {
        return portalApi.get('/portal/profile');
    }

    async getBookingSlots(branchId, date) {
        return portalApi.get(`/portal/booking/slots?branchId=${branchId}&date=${date}`);
    }

    async submitBookingRequest(bookingData) {
        return portalApi.post('/portal/booking/request', bookingData);
    }

    async getClinicalRecord() {
        return portalApi.get('/portal/clinical');
    }

    async updateMedicalHistory(medicalData) {
        return portalApi.put('/portal/clinical', medicalData);
    }

    async getFinancialSummary() {
        return portalApi.get('/portal/financial/summary');
    }
}

export default new PatientPortalService();
