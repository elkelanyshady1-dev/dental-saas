/**
 * subscriptionService.js
 * v11.1 Revenue Sovereignty — Platform API Client
 */

import platformApi from '../auth/platformApi';

export const getOrganizations = async () => {
    // v14.0 → v21.0 Canonical: /api/platform/organizations
    const response = await platformApi.get('/organizations');
    return response.data;
};

export const getSubscriptionOverview = async (orgId) => {
    const response = await platformApi.get(`/org/${orgId}/subscription`);
    return response.data;
};

export const cancelSubscription = async (orgId, mode = 'period_end') => {
    const response = await platformApi.post(`/organizations/${orgId}/cancel`, { mode });
    return response.data;
};

export const adjustCredits = async (orgId, amountMinor) => {
    const response = await platformApi.post(`/organizations/${orgId}/adjust-credits`, { amountMinor });
    return response.data;
};

export const getPlans = async () => {
    const response = await platformApi.get('/plans');
    return response.data;
};
