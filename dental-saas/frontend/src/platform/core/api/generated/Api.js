/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

import axios from "axios";
export var ContentType;
(function (ContentType) {
  ContentType["Json"] = "application/json";
  ContentType["JsonApi"] = "application/vnd.api+json";
  ContentType["FormData"] = "multipart/form-data";
  ContentType["UrlEncoded"] = "application/x-www-form-urlencoded";
  ContentType["Text"] = "text/plain";
})(ContentType || (ContentType = {}));
export class HttpClient {
  instance;
  securityData = null;
  securityWorker;
  secure;
  format;
  constructor({ securityWorker, secure, format, ...axiosConfig } = {}) {
    this.instance = axios.create({
      ...axiosConfig,
      baseURL: axiosConfig.baseURL || "/api/platform",
    });
    this.secure = secure;
    this.format = format;
    this.securityWorker = securityWorker;
  }
  setSecurityData = (data) => {
    this.securityData = data;
  };
  mergeRequestParams(params1, params2) {
    const method = params1.method || (params2 && params2.method);
    return {
      ...this.instance.defaults,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...((method && this.instance.defaults.headers[method.toLowerCase()]) ||
          {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }
  stringifyFormItem(formItem) {
    if (typeof formItem === "object" && formItem !== null) {
      return JSON.stringify(formItem);
    } else {
      return `${formItem}`;
    }
  }
  createFormData(input) {
    if (input instanceof FormData) {
      return input;
    }
    return Object.keys(input || {}).reduce((formData, key) => {
      const property = input[key];
      const propertyContent = property instanceof Array ? property : [property];
      for (const formItem of propertyContent) {
        const isFileType = formItem instanceof Blob || formItem instanceof File;
        formData.append(
          key,
          isFileType ? formItem : this.stringifyFormItem(formItem),
        );
      }
      return formData;
    }, new FormData());
  }
  request = async ({ secure, path, type, query, format, body, ...params }) => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const responseFormat = format || this.format || undefined;
    if (
      type === ContentType.FormData &&
      body &&
      body !== null &&
      typeof body === "object"
    ) {
      body = this.createFormData(body);
    }
    if (
      type === ContentType.Text &&
      body &&
      body !== null &&
      typeof body !== "string"
    ) {
      body = JSON.stringify(body);
    }
    return this.instance.request({
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type ? { "Content-Type": type } : {}),
      },
      params: query,
      responseType: responseFormat,
      data: body,
      url: path,
    });
  };
}
/**
 * @title DentalSaaS Platform API
 * @version 1.0.0
 * @baseUrl /api/platform
 *
 * Sovereign Platform Plane API for DentalSaaS.
 * Governs multi-tenant administration, capability enforcement
 * and distributed governance (v19.3).
 */
export class Api extends HttpClient {
  auth = {
    /**
     * No description
     *
     * @tags Auth
     * @name LoginCreate
     * @summary Platform superadmin login
     * @request POST:/auth/login
     */
    loginCreate: (data, params = {}) =>
      this.request({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name Verify2FaCreate
     * @summary Complete TOTP two-factor authentication
     * @request POST:/auth/verify-2fa
     */
    verify2FaCreate: (data, params = {}) =>
      this.request({
        path: `/auth/verify-2fa`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name RefreshCreate
     * @summary Refresh access token using HttpOnly refresh cookie
     * @request POST:/auth/refresh
     */
    refreshCreate: (params = {}) =>
      this.request({
        path: `/auth/refresh`,
        method: "POST",
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name ProfileList
     * @summary Get current platform user profile
     * @request GET:/auth/profile
     */
    profileList: (params = {}) =>
      this.request({
        path: `/auth/profile`,
        method: "GET",
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaSetupCreate
     * @summary Initiate 2FA TOTP setup for the authenticated user
     * @request POST:/2fa/setup
     * @secure
     */
    "2FaSetupCreate": (params = {}) =>
      this.request({
        path: `/2fa/setup`,
        method: "POST",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaCompleteSetupCreate
     * @summary Verify and complete 2FA setup
     * @request POST:/2fa/complete-setup
     * @secure
     */
    "2FaCompleteSetupCreate": (data, params = {}) =>
      this.request({
        path: `/2fa/complete-setup`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaDisableCreate
     * @summary Disable 2FA for authenticated user
     * @request POST:/2fa/disable
     * @secure
     */
    "2FaDisableCreate": (data, params = {}) =>
      this.request({
        path: `/2fa/disable`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  governance = {
    /**
     * No description
     *
     * @tags Governance
     * @name CapabilitiesList
     * @summary Get resolved capability matrix for the authenticated platform user
     * @request GET:/capabilities
     * @secure
     */
    capabilitiesList: (params = {}) =>
      this.request({
        path: `/capabilities`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Governance
     * @name FeatureFlagsList
     * @summary Get active platform feature flag registry
     * @request GET:/feature-flags
     * @secure
     */
    featureFlagsList: (params = {}) =>
      this.request({
        path: `/feature-flags`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * @description Opens a Server-Sent Events stream. Pushes flag updates in real-time. Only registered when `PLATFORM_MODE=ENTERPRISE`. Client should use `EventSource` with `withCredentials: true`.
     *
     * @tags Governance
     * @name FeatureFlagsStreamList
     * @summary SSE real-time feature flag stream (Enterprise mode only)
     * @request GET:/feature-flags/stream
     * @secure
     */
    featureFlagsStreamList: (params = {}) =>
      this.request({
        path: `/feature-flags/stream`,
        method: "GET",
        secure: true,
        ...params,
      }),
  };
  dashboard = {
    /**
     * No description
     *
     * @tags Dashboard
     * @name DashboardList
     * @summary Platform dashboard summary
     * @request GET:/dashboard
     * @secure
     */
    dashboardList: (params = {}) =>
      this.request({
        path: `/dashboard`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Dashboard
     * @name SearchList
     * @summary Global platform-wide search
     * @request GET:/search
     * @secure
     */
    searchList: (query, params = {}) =>
      this.request({
        path: `/search`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),
  };
  audit = {
    /**
     * No description
     *
     * @tags Audit
     * @name AuditFrontendEventCreate
     * @summary Log an audited frontend action
     * @request POST:/audit/frontend-event
     * @secure
     */
    auditFrontendEventCreate: (data, params = {}) =>
      this.request({
        path: `/audit/frontend-event`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Audit
     * @name PerformanceMetricCreate
     * @summary Log a frontend performance metric
     * @request POST:/performance-metric
     * @secure
     */
    performanceMetricCreate: (data, params = {}) =>
      this.request({
        path: `/performance-metric`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Audit
     * @name AuditLogsList
     * @summary Platform-wide audit log (superadmin only)
     * @request GET:/audit-logs
     * @secure
     */
    auditLogsList: (query, params = {}) =>
      this.request({
        path: `/audit-logs`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * @description Recomputes SHA-256 hashes chronologically. Detects any tampering in the audit log chain. Only available when `PLATFORM_MODE=ENTERPRISE`.
     *
     * @tags Audit
     * @name AuditVerifyChainList
     * @summary Verify immutable audit hash chain (Enterprise + superadmin only)
     * @request GET:/audit/verify-chain
     * @secure
     */
    auditVerifyChainList: (params = {}) =>
      this.request({
        path: `/audit/verify-chain`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  analytics = {
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsList
     * @summary Platform-wide analytics summary
     * @request GET:/analytics
     * @secure
     */
    analyticsList: (params = {}) =>
      this.request({
        path: `/analytics`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsEventsList
     * @summary Latest platform events
     * @request GET:/analytics/events
     * @secure
     */
    analyticsEventsList: (params = {}) =>
      this.request({
        path: `/analytics/events`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsRevenueList
     * @summary Platform revenue analytics
     * @request GET:/analytics/revenue
     * @secure
     */
    analyticsRevenueList: (params = {}) =>
      this.request({
        path: `/analytics/revenue`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Analytics
     * @name MetricsSalesList
     * @summary Sales metrics dashboard
     * @request GET:/metrics/sales
     * @secure
     */
    metricsSalesList: (params = {}) =>
      this.request({
        path: `/metrics/sales`,
        method: "GET",
        secure: true,
        ...params,
      }),
  };
  organizations = {
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsList
     * @summary List all organizations
     * @request GET:/organizations
     * @secure
     */
    organizationsList: (params = {}) =>
      this.request({
        path: `/organizations`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsCreate
     * @summary Provision a new organization (superadmin only)
     * @request POST:/organizations
     * @secure
     */
    organizationsCreate: (data, params = {}) =>
      this.request({
        path: `/organizations`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsDetail
     * @summary Get organization details
     * @request GET:/organizations/{id}
     * @secure
     */
    organizationsDetail: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsStatusPartialUpdate
     * @summary Update organization status (active/suspended)
     * @request PATCH:/organizations/{id}/status
     * @secure
     */
    organizationsStatusPartialUpdate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/status`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsConfigurationList
     * @summary Get organization configuration
     * @request GET:/organizations/{id}/configuration
     * @secure
     */
    organizationsConfigurationList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/configuration`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsConfigurationPartialUpdate
     * @summary Update organization configuration
     * @request PATCH:/organizations/{id}/configuration
     * @secure
     */
    organizationsConfigurationPartialUpdate: (
      { id, ...query },
      data,
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/configuration`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsAnalyticsList
     * @summary Get organization-level analytics
     * @request GET:/organizations/{id}/analytics
     * @secure
     */
    organizationsAnalyticsList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/analytics`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsAuditLogsList
     * @summary Get audit logs scoped to a specific organization
     * @request GET:/organizations/{id}/audit-logs
     * @secure
     */
    organizationsAuditLogsList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/audit-logs`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersList
     * @summary List users in an organization
     * @request GET:/organizations/{id}/users
     * @secure
     */
    organizationsUsersList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/users`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersDetail
     * @summary Get user details within an organization
     * @request GET:/organizations/{id}/users/{userId}
     * @secure
     */
    organizationsUsersDetail: ({ id, userId, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/users/${userId}`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersPartialUpdate
     * @summary Update a user within an organization
     * @request PATCH:/organizations/{id}/users/{userId}
     * @secure
     */
    organizationsUsersPartialUpdate: (
      { id, userId, ...query },
      data,
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/users/${userId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesList
     * @summary List branches of an organization
     * @request GET:/organizations/{id}/branches
     * @secure
     */
    organizationsBranchesList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/branches`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesCreate
     * @summary Create a new branch
     * @request POST:/organizations/{id}/branches
     * @secure
     */
    organizationsBranchesCreate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/branches`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesDetail
     * @summary Get branch details
     * @request GET:/organizations/{id}/branches/{branchId}
     * @secure
     */
    organizationsBranchesDetail: ({ id, branchId, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesPartialUpdate
     * @summary Update branch
     * @request PATCH:/organizations/{id}/branches/{branchId}
     * @secure
     */
    organizationsBranchesPartialUpdate: (
      { id, branchId, ...query },
      data,
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesStatusPartialUpdate
     * @summary Update branch status (active/suspended)
     * @request PATCH:/organizations/{id}/branches/{branchId}/status
     * @secure
     */
    organizationsBranchesStatusPartialUpdate: (
      { id, branchId, ...query },
      data,
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}/status`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesAnalyticsList
     * @summary Get analytics for a specific branch
     * @request GET:/organizations/{id}/branches/{branchId}/analytics
     * @secure
     */
    organizationsBranchesAnalyticsList: (
      { id, branchId, ...query },
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}/analytics`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesConfigurationList
     * @summary Get branch configuration
     * @request GET:/organizations/{id}/branches/{branchId}/configuration
     * @secure
     */
    organizationsBranchesConfigurationList: (
      { id, branchId, ...query },
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}/configuration`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesConfigurationPartialUpdate
     * @summary Update branch configuration
     * @request PATCH:/organizations/{id}/branches/{branchId}/configuration
     * @secure
     */
    organizationsBranchesConfigurationPartialUpdate: (
      { id, branchId, ...query },
      data,
      params = {},
    ) =>
      this.request({
        path: `/organizations/${id}/branches/${branchId}/configuration`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  billing = {
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsInvoicesList
     * @summary List invoices for an organization
     * @request GET:/organizations/{id}/invoices
     * @secure
     */
    organizationsInvoicesList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/invoices`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsManualPaymentCreate
     * @summary Record a manual payment for an organization
     * @request POST:/organizations/{id}/manual-payment
     * @secure
     */
    organizationsManualPaymentCreate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/manual-payment`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsGeneratePaymentLinkCreate
     * @summary Generate a payment link for an organization
     * @request POST:/organizations/{id}/generate-payment-link
     * @secure
     */
    organizationsGeneratePaymentLinkCreate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/generate-payment-link`,
        method: "POST",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name InvoicesDetail
     * @summary Get invoice details
     * @request GET:/invoices/{invoiceId}
     * @secure
     */
    invoicesDetail: ({ invoiceId, ...query }, params = {}) =>
      this.request({
        path: `/invoices/${invoiceId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name InvoicesStatusPartialUpdate
     * @summary Update invoice status
     * @request PATCH:/invoices/{invoiceId}/status
     * @secure
     */
    invoicesStatusPartialUpdate: ({ invoiceId, ...query }, data, params = {}) =>
      this.request({
        path: `/invoices/${invoiceId}/status`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name OrgsBillingList
     * @summary Get org billing overview (superadmin only)
     * @request GET:/orgs/{orgId}/billing
     * @secure
     */
    orgsBillingList: ({ orgId, ...query }, params = {}) =>
      this.request({
        path: `/orgs/${orgId}/billing`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Billing
     * @name OrgsInvoicesGenerateCreate
     * @summary Manually generate an invoice for an org (superadmin only)
     * @request POST:/orgs/{orgId}/invoices/generate
     * @secure
     */
    orgsInvoicesGenerateCreate: ({ orgId, ...query }, params = {}) =>
      this.request({
        path: `/orgs/${orgId}/invoices/generate`,
        method: "POST",
        secure: true,
        ...params,
      }),
  };
  subscriptions = {
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsExtendPartialUpdate
     * @summary Extend organization subscription
     * @request PATCH:/organizations/{id}/extend
     * @secure
     */
    organizationsExtendPartialUpdate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/extend`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsSuspendPartialUpdate
     * @summary Suspend organization
     * @request PATCH:/organizations/{id}/suspend
     * @secure
     */
    organizationsSuspendPartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/suspend`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsReactivatePartialUpdate
     * @summary Reactivate suspended organization
     * @request PATCH:/organizations/{id}/reactivate
     * @secure
     */
    organizationsReactivatePartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/reactivate`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsCancelCreate
     * @summary Cancel organization subscription
     * @request POST:/organizations/{id}/cancel
     * @secure
     */
    organizationsCancelCreate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/cancel`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsAdjustCreditsCreate
     * @summary Manually adjust organization credits
     * @request POST:/organizations/{id}/adjust-credits
     * @secure
     */
    organizationsAdjustCreditsCreate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${id}/adjust-credits`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsAutoRenewPartialUpdate
     * @summary Toggle auto-renew for organization
     * @request PATCH:/organizations/{id}/auto-renew
     * @secure
     */
    organizationsAutoRenewPartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/organizations/${id}/auto-renew`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsPlanPartialUpdate
     * @summary Assign a plan to an organization
     * @request PATCH:/organizations/{orgId}/plan
     * @secure
     */
    organizationsPlanPartialUpdate: ({ orgId, ...query }, data, params = {}) =>
      this.request({
        path: `/organizations/${orgId}/plan`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgSubscriptionList
     * @summary Get subscription overview for an organization
     * @request GET:/org/{orgId}/subscription
     * @secure
     */
    orgSubscriptionList: ({ orgId, ...query }, params = {}) =>
      this.request({
        path: `/org/${orgId}/subscription`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgUsageList
     * @summary Get usage metrics for an organization
     * @request GET:/org/{orgId}/usage
     * @secure
     */
    orgUsageList: ({ orgId, ...query }, params = {}) =>
      this.request({
        path: `/org/${orgId}/usage`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgChangePlanCreate
     * @summary Change organization plan
     * @request POST:/org/{orgId}/change-plan
     * @secure
     */
    orgChangePlanCreate: ({ orgId, ...query }, data, params = {}) =>
      this.request({
        path: `/org/${orgId}/change-plan`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgAddAddonCreate
     * @summary Add an add-on to an organization
     * @request POST:/org/{orgId}/add-addon
     * @secure
     */
    orgAddAddonCreate: ({ orgId, ...query }, data, params = {}) =>
      this.request({
        path: `/org/${orgId}/add-addon`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgRemoveAddonDelete
     * @summary Remove an add-on from an organization
     * @request DELETE:/org/{orgId}/remove-addon
     * @secure
     */
    orgRemoveAddonDelete: ({ orgId, ...query }, data, params = {}) =>
      this.request({
        path: `/org/${orgId}/remove-addon`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Subscriptions
     * @name TrialsList
     * @summary List all trial organizations (superadmin only)
     * @request GET:/trials
     * @secure
     */
    trialsList: (params = {}) =>
      this.request({
        path: `/trials`,
        method: "GET",
        secure: true,
        ...params,
      }),
  };
  plans = {
    /**
     * No description
     *
     * @tags Plans
     * @name PlansList
     * @summary List all plans
     * @request GET:/plans
     * @secure
     */
    plansList: (params = {}) =>
      this.request({
        path: `/plans`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Plans
     * @name PlansCreate
     * @summary Create a plan (superadmin only)
     * @request POST:/plans
     * @secure
     */
    plansCreate: (data, params = {}) =>
      this.request({
        path: `/plans`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Plans
     * @name PlansUpdate
     * @summary Update a plan (superadmin only)
     * @request PUT:/plans/{id}
     * @secure
     */
    plansUpdate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/plans/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Plans
     * @name PlansStatusPartialUpdate
     * @summary Activate or archive a plan
     * @request PATCH:/plans/{id}/status
     * @secure
     */
    plansStatusPartialUpdate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/plans/${id}/status`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Plans
     * @name PlansUsageList
     * @summary Get usage statistics for a plan
     * @request GET:/plans/{id}/usage
     * @secure
     */
    plansUsageList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/plans/${id}/usage`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Plans
     * @name AddonsList
     * @summary List available add-ons
     * @request GET:/addons
     * @secure
     */
    addonsList: (params = {}) =>
      this.request({
        path: `/addons`,
        method: "GET",
        secure: true,
        ...params,
      }),
  };
  coupons = {
    /**
     * No description
     *
     * @tags Coupons
     * @name CouponsCreate
     * @summary Create a discount coupon (superadmin only)
     * @request POST:/coupons
     * @secure
     */
    couponsCreate: (data, params = {}) =>
      this.request({
        path: `/coupons`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Coupons
     * @name CouponsUpdate
     * @summary Update a coupon (superadmin only)
     * @request PUT:/coupons/{id}
     * @secure
     */
    couponsUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/coupons/${id}`,
        method: "PUT",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Coupons
     * @name CampaignsCreate
     * @summary Create a marketing campaign (superadmin only)
     * @request POST:/campaigns
     * @secure
     */
    campaignsCreate: (params = {}) =>
      this.request({
        path: `/campaigns`,
        method: "POST",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Coupons
     * @name CampaignsUpdate
     * @summary Update a campaign (superadmin only)
     * @request PUT:/campaigns/{id}
     * @secure
     */
    campaignsUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/campaigns/${id}`,
        method: "PUT",
        secure: true,
        ...params,
      }),
  };
  features = {
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesList
     * @summary List all platform feature flags (managed)
     * @request GET:/features
     * @secure
     */
    featuresList: (params = {}) =>
      this.request({
        path: `/features`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesCreate
     * @summary Create a platform feature (superadmin only)
     * @request POST:/features
     * @secure
     */
    featuresCreate: (params = {}) =>
      this.request({
        path: `/features`,
        method: "POST",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesUpdate
     * @summary Update a feature (superadmin only)
     * @request PUT:/features/{id}
     * @secure
     */
    featuresUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/features/${id}`,
        method: "PUT",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Features
     * @name OrgFeaturePartialUpdate
     * @summary Override a feature flag for a specific organization
     * @request PATCH:/org/{orgId}/feature/{key}
     * @secure
     */
    orgFeaturePartialUpdate: ({ orgId, key, ...query }, params = {}) =>
      this.request({
        path: `/org/${orgId}/feature/${key}`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
  };
  support = {
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketsList
     * @summary List all platform support tickets
     * @request GET:/support/tickets
     * @secure
     */
    supportTicketsList: (params = {}) =>
      this.request({
        path: `/support/tickets`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketForensicList
     * @summary Get forensic context for a support ticket
     * @request GET:/support/ticket/{id}/forensic
     * @secure
     */
    supportTicketForensicList: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/support/ticket/${id}/forensic`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketAssignPartialUpdate
     * @summary Assign a ticket to a support agent
     * @request PATCH:/support/ticket/{id}/assign
     * @secure
     */
    supportTicketAssignPartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/support/ticket/${id}/assign`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketApproveRefundCreate
     * @summary Approve a refund for a support ticket
     * @request POST:/support/ticket/{id}/approve-refund
     * @secure
     */
    supportTicketApproveRefundCreate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/support/ticket/${id}/approve-refund`,
        method: "POST",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketMessageCreate
     * @summary Add a message to a support ticket
     * @request POST:/support/ticket/{id}/message
     * @secure
     */
    supportTicketMessageCreate: ({ id, ...query }, data, params = {}) =>
      this.request({
        path: `/support/ticket/${id}/message`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  profile = {
    /**
     * No description
     *
     * @tags Profile
     * @name GetProfile
     * @summary Get authenticated platform user profile
     * @request GET:/me
     * @secure
     */
    getProfile: (params = {}) =>
      this.request({
        path: `/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Profile
     * @name PutProfile
     * @summary Update authenticated platform user profile
     * @request PUT:/me
     * @secure
     */
    putProfile: (data, params = {}) =>
      this.request({
        path: `/me`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Profile
     * @name ChangePasswordUpdate
     * @summary Change platform user password
     * @request PUT:/change-password
     * @secure
     */
    changePasswordUpdate: (data, params = {}) =>
      this.request({
        path: `/change-password`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Profile
     * @name UsersManageCredentialsPartialUpdate
     * @summary Admin credential management for platform users
     * @request PATCH:/users/{userId}/manage-credentials
     * @secure
     */
    usersManageCredentialsPartialUpdate: ({ userId, ...query }, params = {}) =>
      this.request({
        path: `/users/${userId}/manage-credentials`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
  };
  notifications = {
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsList
     * @summary Get platform notifications for authenticated user
     * @request GET:/notifications
     * @secure
     */
    notificationsList: (params = {}) =>
      this.request({
        path: `/notifications`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsReadAllPartialUpdate
     * @summary Mark all notifications as read
     * @request PATCH:/notifications/read-all
     * @secure
     */
    notificationsReadAllPartialUpdate: (params = {}) =>
      this.request({
        path: `/notifications/read-all`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsReadPartialUpdate
     * @summary Mark a specific notification as read
     * @request PATCH:/notifications/{id}/read
     * @secure
     */
    notificationsReadPartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/notifications/${id}/read`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
  };
  settings = {
    /**
     * No description
     *
     * @tags Settings
     * @name SettingsList
     * @summary Get global platform settings
     * @request GET:/settings
     * @secure
     */
    settingsList: (params = {}) =>
      this.request({
        path: `/settings`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags Settings
     * @name SettingsUpdate
     * @summary Update global platform settings (superadmin only)
     * @request PUT:/settings
     * @secure
     */
    settingsUpdate: (data, params = {}) =>
      this.request({
        path: `/settings`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  userGovernance = {
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformList
     * @summary List all platform superadmin users
     * @request GET:/users/platform
     * @secure
     */
    usersPlatformList: (params = {}) =>
      this.request({
        path: `/users/platform`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformDetail
     * @summary Get platform user details + audit trail (superadmin only)
     * @request GET:/users/platform/{id}
     * @secure
     */
    usersPlatformDetail: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/users/platform/${id}`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformForceLogoutPartialUpdate
     * @summary Force logout all sessions for a platform user
     * @request PATCH:/users/platform/{id}/force-logout
     * @secure
     */
    usersPlatformForceLogoutPartialUpdate: ({ id, ...query }, params = {}) =>
      this.request({
        path: `/users/platform/${id}/force-logout`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgDetail
     * @summary List org users (governance view)
     * @request GET:/users/org/{orgId}
     * @secure
     */
    usersOrgDetail: ({ orgId, ...query }, params = {}) =>
      this.request({
        path: `/users/org/${orgId}`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgUserDetail
     * @summary Get org user detail (governance view)
     * @request GET:/users/org/{orgId}/{userId}
     * @secure
     */
    usersOrgUserDetail: ({ orgId, userId, ...query }, params = {}) =>
      this.request({
        path: `/users/org/${orgId}/${userId}`,
        method: "GET",
        secure: true,
        ...params,
      }),
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgForceLogoutPartialUpdate
     * @summary Force logout all sessions for an org user
     * @request PATCH:/users/org/{orgId}/{userId}/force-logout
     * @secure
     */
    usersOrgForceLogoutPartialUpdate: (
      { orgId, userId, ...query },
      params = {},
    ) =>
      this.request({
        path: `/users/org/${orgId}/${userId}/force-logout`,
        method: "PATCH",
        secure: true,
        ...params,
      }),
  };
}
