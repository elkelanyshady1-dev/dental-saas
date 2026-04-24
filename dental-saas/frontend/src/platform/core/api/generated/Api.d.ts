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

export interface PlatformUser {
  id?: string;
  name?: string;
  email?: string;
  role?: "superadmin" | "admin" | "support";
  isActive?: boolean;
  isTwoFactorEnabled?: boolean;
}
export interface Organization {
  id?: string;
  name?: string;
  status?: "active" | "suspended" | "trial" | "cancelled";
  regionCode?: string;
  plan?: string;
  /** @format date-time */
  createdAt?: string;
}
export interface Branch {
  id?: string;
  name?: string;
  status?: string;
}
export interface AuditLog {
  id?: string;
  action?: string;
  actorId?: string;
  currentHash?: string;
  /** @format date-time */
  createdAt?: string;
}
export interface Invoice {
  id?: string;
  total?: number;
  status?: "draft" | "issued" | "paid" | "overdue";
  /** @format date-time */
  issuedAt?: string;
}
/**
 * Key = capability name, Value = boolean (granted/denied)
 * @example {"MANAGE_ADMINS":true,"VIEW_FINANCE":false}
 */
export type CapabilityMap = Record<string, boolean>;
/** @example {"ADVANCED_ANALYTICS":true,"PLATFORM_KILL_SWITCH":false} */
export type FeatureFlagMap = Record<string, boolean>;
export interface Notification {
  id?: string;
  message?: string;
  read?: boolean;
  /** @format date-time */
  createdAt?: string;
}
export interface Plan {
  id?: string;
  name?: string;
  price?: number;
  status?: string;
}
export interface Error {
  message?: string;
  code?: string;
}
export interface LoginCreateData {
  /** JWT access token */
  token?: string;
  user?: PlatformUser;
  requires2FA?: boolean;
}
export type Verify2FaCreateData = any;
export interface RefreshCreateData {
  token?: string;
  user?: PlatformUser;
}
export type ProfileListData = PlatformUser;
export interface CapabilitiesListData {
  /** Key = capability name, Value = boolean (granted/denied) */
  capabilities?: CapabilityMap;
  metadata?: {
    policyVersion?: string;
  };
}
export interface FeatureFlagsListData {
  flags?: FeatureFlagMap;
  /** @example "v1.0" */
  version?: string;
}
export interface DashboardListData {
  message?: string;
  user?: PlatformUser;
}
export interface SearchListParams {
  q: string;
}
export type SearchListData = any;
export type FeatureFlagsStreamListData = string;
export type AuditFrontendEventCreateData = any;
export type PerformanceMetricCreateData = any;
export type AnalyticsListData = any;
export type AnalyticsEventsListData = any;
export type AnalyticsRevenueListData = any;
export type MetricsSalesListData = any;
export interface AuditLogsListParams {
  /** @default 1 */
  page?: number;
  /** @default 50 */
  limit?: number;
}
export interface AuditLogsListData {
  logs?: AuditLog[];
  total?: number;
}
export interface AuditVerifyChainListData {
  valid?: boolean;
  scannedEntries?: number;
  brokenAt?: {
    entryId?: string;
    action?: string;
    /** @format date-time */
    createdAt?: string;
    expectedHash?: string;
    storedHash?: string;
  } | null;
}
export type OrganizationsListData = Organization[];
export type OrganizationsCreateData = any;
export interface OrganizationsDetailParams {
  id: string;
}
export type OrganizationsDetailData = Organization;
export interface OrganizationsStatusPartialUpdateParams {
  id: string;
}
export type OrganizationsStatusPartialUpdateData = any;
export interface OrganizationsConfigurationListParams {
  id: string;
}
export type OrganizationsConfigurationListData = any;
export interface OrganizationsConfigurationPartialUpdateParams {
  id: string;
}
export type OrganizationsConfigurationPartialUpdateData = any;
export interface OrganizationsAnalyticsListParams {
  id: string;
}
export type OrganizationsAnalyticsListData = any;
export interface OrganizationsAuditLogsListParams {
  id: string;
}
export type OrganizationsAuditLogsListData = any;
export interface OrganizationsUsersListParams {
  id: string;
}
export type OrganizationsUsersListData = any;
export interface OrganizationsUsersDetailParams {
  id: string;
  userId: string;
}
export type OrganizationsUsersDetailData = any;
export interface OrganizationsUsersPartialUpdateParams {
  id: string;
  userId: string;
}
export type OrganizationsUsersPartialUpdateData = any;
export interface OrganizationsBranchesListParams {
  id: string;
}
export type OrganizationsBranchesListData = Branch[];
export interface OrganizationsBranchesCreateParams {
  id: string;
}
export type OrganizationsBranchesCreateData = any;
export interface OrganizationsBranchesDetailParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesDetailData = any;
export interface OrganizationsBranchesPartialUpdateParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesPartialUpdateData = any;
export interface OrganizationsBranchesStatusPartialUpdateParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesStatusPartialUpdateData = any;
export interface OrganizationsBranchesAnalyticsListParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesAnalyticsListData = any;
export interface OrganizationsBranchesConfigurationListParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesConfigurationListData = any;
export interface OrganizationsBranchesConfigurationPartialUpdateParams {
  id: string;
  branchId: string;
}
export type OrganizationsBranchesConfigurationPartialUpdateData = any;
export interface OrganizationsInvoicesListParams {
  id: string;
}
export type OrganizationsInvoicesListData = Invoice[];
export interface OrganizationsExtendPartialUpdateParams {
  id: string;
}
export type OrganizationsExtendPartialUpdateData = any;
export interface OrganizationsSuspendPartialUpdateParams {
  id: string;
}
export type OrganizationsSuspendPartialUpdateData = any;
export interface OrganizationsReactivatePartialUpdateParams {
  id: string;
}
export type OrganizationsReactivatePartialUpdateData = any;
export interface OrganizationsCancelCreateParams {
  id: string;
}
export type OrganizationsCancelCreateData = any;
export interface OrganizationsAdjustCreditsCreateParams {
  id: string;
}
export type OrganizationsAdjustCreditsCreateData = any;
export interface OrganizationsAutoRenewPartialUpdateParams {
  id: string;
}
export type OrganizationsAutoRenewPartialUpdateData = any;
export interface OrganizationsManualPaymentCreateParams {
  id: string;
}
export type OrganizationsManualPaymentCreateData = any;
export interface OrganizationsGeneratePaymentLinkCreateParams {
  id: string;
}
export type OrganizationsGeneratePaymentLinkCreateData = any;
export interface OrganizationsPlanPartialUpdateParams {
  orgId: string;
}
export type OrganizationsPlanPartialUpdateData = any;
export interface OrgSubscriptionListParams {
  orgId: string;
}
export type OrgSubscriptionListData = any;
export interface OrgUsageListParams {
  orgId: string;
}
export type OrgUsageListData = any;
export interface OrgChangePlanCreateParams {
  orgId: string;
}
export type OrgChangePlanCreateData = any;
export interface OrgAddAddonCreateParams {
  orgId: string;
}
export type OrgAddAddonCreateData = any;
export interface OrgRemoveAddonDeleteParams {
  orgId: string;
}
export type OrgRemoveAddonDeleteData = any;
export interface InvoicesDetailParams {
  invoiceId: string;
}
export type InvoicesDetailData = Invoice;
export interface InvoicesStatusPartialUpdateParams {
  invoiceId: string;
}
export type InvoicesStatusPartialUpdateData = any;
export interface OrgsBillingListParams {
  orgId: string;
}
export type OrgsBillingListData = any;
export interface OrgsInvoicesGenerateCreateParams {
  orgId: string;
}
export type OrgsInvoicesGenerateCreateData = any;
export type PlansListData = Plan[];
export type PlansCreateData = any;
export interface PlansUpdateParams {
  id: string;
}
export type PlansUpdateData = any;
export interface PlansStatusPartialUpdateParams {
  id: string;
}
export type PlansStatusPartialUpdateData = any;
export interface PlansUsageListParams {
  id: string;
}
export type PlansUsageListData = any;
export type AddonsListData = any;
export type TrialsListData = any;
export type CouponsCreateData = any;
export interface CouponsUpdateParams {
  id: string;
}
export type CouponsUpdateData = any;
export type CampaignsCreateData = any;
export interface CampaignsUpdateParams {
  id: string;
}
export type CampaignsUpdateData = any;
export type FeaturesListData = any;
export type FeaturesCreateData = any;
export interface FeaturesUpdateParams {
  id: string;
}
export type FeaturesUpdateData = any;
export interface OrgFeaturePartialUpdateParams {
  orgId: string;
  key: string;
}
export type OrgFeaturePartialUpdateData = any;
export type SupportTicketsListData = any;
export interface SupportTicketForensicListParams {
  id: string;
}
export type SupportTicketForensicListData = any;
export interface SupportTicketAssignPartialUpdateParams {
  id: string;
}
export type SupportTicketAssignPartialUpdateData = any;
export interface SupportTicketApproveRefundCreateParams {
  id: string;
}
export type SupportTicketApproveRefundCreateData = any;
export interface SupportTicketMessageCreateParams {
  id: string;
}
export type SupportTicketMessageCreateData = any;
export type GetProfileData = PlatformUser;
export type PutProfileData = any;
export type ChangePasswordUpdateData = any;
export interface UsersManageCredentialsPartialUpdateParams {
  userId: string;
}
export type UsersManageCredentialsPartialUpdateData = any;
export type Type2FaSetupCreateData = any;
export type Type2FaCompleteSetupCreateData = any;
export type Type2FaDisableCreateData = any;
export type NotificationsListData = Notification[];
export type NotificationsReadAllPartialUpdateData = any;
export interface NotificationsReadPartialUpdateParams {
  id: string;
}
export type NotificationsReadPartialUpdateData = any;
export type SettingsListData = any;
export type SettingsUpdateData = any;
export type UsersPlatformListData = any;
export interface UsersPlatformDetailParams {
  id: string;
}
export type UsersPlatformDetailData = any;
export interface UsersPlatformForceLogoutPartialUpdateParams {
  id: string;
}
export type UsersPlatformForceLogoutPartialUpdateData = any;
export interface UsersOrgDetailParams {
  orgId: string;
}
export type UsersOrgDetailData = any;
export interface UsersOrgUserDetailParams {
  orgId: string;
  userId: string;
}
export type UsersOrgUserDetailData = any;
export interface UsersOrgForceLogoutPartialUpdateParams {
  orgId: string;
  userId: string;
}
export type UsersOrgForceLogoutPartialUpdateData = any;
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  ResponseType,
} from "axios";
export type QueryParamsType = Record<string | number, any>;
export interface FullRequestParams
  extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseType;
  /** request body */
  body?: unknown;
}
export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;
export interface ApiConfig<SecurityDataType = unknown>
  extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
  secure?: boolean;
  format?: ResponseType;
}
export declare enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}
export declare class HttpClient<SecurityDataType = unknown> {
  instance: AxiosInstance;
  private securityData;
  private securityWorker?;
  private secure?;
  private format?;
  constructor({
    securityWorker,
    secure,
    format,
    ...axiosConfig
  }?: ApiConfig<SecurityDataType>);
  setSecurityData: (data: SecurityDataType | null) => void;
  protected mergeRequestParams(
    params1: AxiosRequestConfig,
    params2?: AxiosRequestConfig,
  ): AxiosRequestConfig;
  protected stringifyFormItem(formItem: unknown): string;
  protected createFormData(input: Record<string, unknown>): FormData;
  request: <T = any, _E = any>({
    secure,
    path,
    type,
    query,
    format,
    body,
    ...params
  }: FullRequestParams) => Promise<AxiosResponse<T>>;
}
/**
 * @title OrthoNoe Platform API
 * @version 1.0.0
 * @baseUrl /api/platform
 *
 * Sovereign Platform Plane API for OrthoNoe.
 * Governs multi-tenant administration, capability enforcement
 * and distributed governance (v19.3).
 */
export declare class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  auth: {
    /**
     * No description
     *
     * @tags Auth
     * @name LoginCreate
     * @summary Platform superadmin login
     * @request POST:/auth/login
     */
    loginCreate: (
      data: {
        /** @format email */
        email: string;
        password: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<LoginCreateData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name Verify2FaCreate
     * @summary Complete TOTP two-factor authentication
     * @request POST:/auth/verify-2fa
     */
    verify2FaCreate: (
      data: {
        email: string;
        /**
         * @minLength 6
         * @maxLength 6
         */
        totpCode: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<Verify2FaCreateData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name RefreshCreate
     * @summary Refresh access token using HttpOnly refresh cookie
     * @request POST:/auth/refresh
     */
    refreshCreate: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<RefreshCreateData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name ProfileList
     * @summary Get current platform user profile
     * @request GET:/auth/profile
     */
    profileList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<ProfileListData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaSetupCreate
     * @summary Initiate 2FA TOTP setup for the authenticated user
     * @request POST:/core/2fa/setup
     * @secure
     */
    "2FaSetupCreate": (
      params?: RequestParams,
    ) => Promise<AxiosResponse<Type2FaSetupCreateData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaCompleteSetupCreate
     * @summary Verify and complete 2FA setup
     * @request POST:/core/2fa/complete-setup
     * @secure
     */
    "2FaCompleteSetupCreate": (
      data: {
        totpCode: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<Type2FaCompleteSetupCreateData>>;
    /**
     * No description
     *
     * @tags Auth
     * @name 2FaDisableCreate
     * @summary Disable 2FA for authenticated user
     * @request POST:/core/2fa/disable
     * @secure
     */
    "2FaDisableCreate": (
      data: {
        totpCode: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<Type2FaDisableCreateData>>;
  };
  governance: {
    /**
     * No description
     *
     * @tags Governance
     * @name CapabilitiesList
     * @summary Get resolved capability matrix for the authenticated platform user
     * @request GET:/capabilities
     * @secure
     */
    capabilitiesList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<CapabilitiesListData>>;
    /**
     * No description
     *
     * @tags Governance
     * @name FeatureFlagsList
     * @summary Get active platform feature flag registry
     * @request GET:/feature-flags
     * @secure
     */
    featureFlagsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<FeatureFlagsListData>>;
    /**
     * @description Opens a Server-Sent Events stream. Pushes flag updates in real-time. Only registered when `PLATFORM_MODE=ENTERPRISE`. Client should use `EventSource` with `withCredentials: true`.
     *
     * @tags Governance
     * @name FeatureFlagsStreamList
     * @summary SSE real-time feature flag stream (Enterprise mode only)
     * @request GET:/core/feature-flags/stream
     * @secure
     */
    featureFlagsStreamList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<FeatureFlagsStreamListData>>;
  };
  dashboard: {
    /**
     * No description
     *
     * @tags Dashboard
     * @name DashboardList
     * @summary Platform dashboard summary
     * @request GET:/core/dashboard
     * @secure
     */
    dashboardList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<DashboardListData>>;
    /**
     * No description
     *
     * @tags Dashboard
     * @name SearchList
     * @summary Global platform-wide search
     * @request GET:/core/search
     * @secure
     */
    searchList: (
      query: SearchListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<SearchListData>>;
  };
  audit: {
    /**
     * No description
     *
     * @tags Audit
     * @name AuditFrontendEventCreate
     * @summary Log an audited frontend action
     * @request POST:/core/audit/frontend-event
     * @secure
     */
    auditFrontendEventCreate: (
      data: {
        actorId?: string;
        actorRole?: string;
        capabilityUsed: string;
        featureFlag?: string;
        targetEntity: string;
        correlationId?: string;
        /** @format date-time */
        timestamp?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<AuditFrontendEventCreateData>>;
    /**
     * No description
     *
     * @tags Audit
     * @name PerformanceMetricCreate
     * @summary Log a frontend performance metric
     * @request POST:/core/performance-metric
     * @secure
     */
    performanceMetricCreate: (
      data: {
        featureKey?: string;
        durationMs?: number;
        correlationId?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<PerformanceMetricCreateData>>;
    /**
     * No description
     *
     * @tags Audit
     * @name AuditLogsList
     * @summary Platform-wide audit log (superadmin only)
     * @request GET:/core/audit-logs
     * @secure
     */
    auditLogsList: (
      query: AuditLogsListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<AuditLogsListData>>;
    /**
     * @description Recomputes SHA-256 hashes chronologically. Detects any tampering in the audit log chain. Only available when `PLATFORM_MODE=ENTERPRISE`.
     *
     * @tags Audit
     * @name AuditVerifyChainList
     * @summary Verify immutable audit hash chain (Enterprise + superadmin only)
     * @request GET:/core/audit/verify-chain
     * @secure
     */
    auditVerifyChainList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<AuditVerifyChainListData>>;
  };
  analytics: {
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsList
     * @summary Platform-wide analytics summary
     * @request GET:/core/analytics
     * @secure
     */
    analyticsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<AnalyticsListData>>;
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsEventsList
     * @summary Latest platform events
     * @request GET:/core/analytics/events
     * @secure
     */
    analyticsEventsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<AnalyticsEventsListData>>;
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsRevenueList
     * @summary Platform revenue analytics
     * @request GET:/core/analytics/revenue
     * @secure
     */
    analyticsRevenueList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<AnalyticsRevenueListData>>;
    /**
     * No description
     *
     * @tags Analytics
     * @name MetricsSalesList
     * @summary Sales metrics dashboard
     * @request GET:/core/metrics/sales
     * @secure
     */
    metricsSalesList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<MetricsSalesListData>>;
  };
  organizations: {
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsList
     * @summary List all organizations
     * @request GET:/core/organizations
     * @secure
     */
    organizationsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsCreate
     * @summary Provision a new organization (superadmin only)
     * @request POST:/core/organizations
     * @secure
     */
    organizationsCreate: (
      data: {
        name: string;
        regionCode?: string;
        plan?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsCreateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsDetail
     * @summary Get organization details
     * @request GET:/core/organizations/{id}
     * @secure
     */
    organizationsDetail: (
      { id, ...query }: OrganizationsDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsDetailData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsStatusPartialUpdate
     * @summary Update organization status (active/suspended)
     * @request PATCH:/core/organizations/{id}/status
     * @secure
     */
    organizationsStatusPartialUpdate: (
      { id, ...query }: OrganizationsStatusPartialUpdateParams,
      data: {
        status?: "active" | "suspended";
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsStatusPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsConfigurationList
     * @summary Get organization configuration
     * @request GET:/core/organizations/{id}/configuration
     * @secure
     */
    organizationsConfigurationList: (
      { id, ...query }: OrganizationsConfigurationListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsConfigurationListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsConfigurationPartialUpdate
     * @summary Update organization configuration
     * @request PATCH:/core/organizations/{id}/configuration
     * @secure
     */
    organizationsConfigurationPartialUpdate: (
      { id, ...query }: OrganizationsConfigurationPartialUpdateParams,
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsConfigurationPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsAnalyticsList
     * @summary Get organization-level analytics
     * @request GET:/core/organizations/{id}/analytics
     * @secure
     */
    organizationsAnalyticsList: (
      { id, ...query }: OrganizationsAnalyticsListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsAnalyticsListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsAuditLogsList
     * @summary Get audit logs scoped to a specific organization
     * @request GET:/core/organizations/{id}/audit-logs
     * @secure
     */
    organizationsAuditLogsList: (
      { id, ...query }: OrganizationsAuditLogsListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsAuditLogsListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersList
     * @summary List users in an organization
     * @request GET:/core/organizations/{id}/users
     * @secure
     */
    organizationsUsersList: (
      { id, ...query }: OrganizationsUsersListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsUsersListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersDetail
     * @summary Get user details within an organization
     * @request GET:/core/organizations/{id}/users/{userId}
     * @secure
     */
    organizationsUsersDetail: (
      { id, userId, ...query }: OrganizationsUsersDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsUsersDetailData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsUsersPartialUpdate
     * @summary Update a user within an organization
     * @request PATCH:/core/organizations/{id}/users/{userId}
     * @secure
     */
    organizationsUsersPartialUpdate: (
      { id, userId, ...query }: OrganizationsUsersPartialUpdateParams,
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsUsersPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesList
     * @summary List branches of an organization
     * @request GET:/core/organizations/{id}/branches
     * @secure
     */
    organizationsBranchesList: (
      { id, ...query }: OrganizationsBranchesListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesCreate
     * @summary Create a new branch
     * @request POST:/core/organizations/{id}/branches
     * @secure
     */
    organizationsBranchesCreate: (
      { id, ...query }: OrganizationsBranchesCreateParams,
      data: {
        name: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesCreateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesDetail
     * @summary Get branch details
     * @request GET:/core/organizations/{id}/branches/{branchId}
     * @secure
     */
    organizationsBranchesDetail: (
      { id, branchId, ...query }: OrganizationsBranchesDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesDetailData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesPartialUpdate
     * @summary Update branch
     * @request PATCH:/core/organizations/{id}/branches/{branchId}
     * @secure
     */
    organizationsBranchesPartialUpdate: (
      { id, branchId, ...query }: OrganizationsBranchesPartialUpdateParams,
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesStatusPartialUpdate
     * @summary Update branch status (active/suspended)
     * @request PATCH:/core/organizations/{id}/branches/{branchId}/status
     * @secure
     */
    organizationsBranchesStatusPartialUpdate: (
      {
        id,
        branchId,
        ...query
      }: OrganizationsBranchesStatusPartialUpdateParams,
      data: {
        status?: "active" | "suspended";
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesStatusPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesAnalyticsList
     * @summary Get analytics for a specific branch
     * @request GET:/core/organizations/{id}/branches/{branchId}/analytics
     * @secure
     */
    organizationsBranchesAnalyticsList: (
      { id, branchId, ...query }: OrganizationsBranchesAnalyticsListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesAnalyticsListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesConfigurationList
     * @summary Get branch configuration
     * @request GET:/core/organizations/{id}/branches/{branchId}/configuration
     * @secure
     */
    organizationsBranchesConfigurationList: (
      { id, branchId, ...query }: OrganizationsBranchesConfigurationListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsBranchesConfigurationListData>>;
    /**
     * No description
     *
     * @tags Organizations
     * @name OrganizationsBranchesConfigurationPartialUpdate
     * @summary Update branch configuration
     * @request PATCH:/core/organizations/{id}/branches/{branchId}/configuration
     * @secure
     */
    organizationsBranchesConfigurationPartialUpdate: (
      {
        id,
        branchId,
        ...query
      }: OrganizationsBranchesConfigurationPartialUpdateParams,
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<
      AxiosResponse<OrganizationsBranchesConfigurationPartialUpdateData>
    >;
  };
  billing: {
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsInvoicesList
     * @summary List invoices for an organization
     * @request GET:/core/organizations/{id}/invoices
     * @secure
     */
    organizationsInvoicesList: (
      { id, ...query }: OrganizationsInvoicesListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsInvoicesListData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsManualPaymentCreate
     * @summary Record a manual payment for an organization
     * @request POST:/core/organizations/{id}/manual-payment
     * @secure
     */
    organizationsManualPaymentCreate: (
      { id, ...query }: OrganizationsManualPaymentCreateParams,
      data: {
        amountMinor?: number;
        reference?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsManualPaymentCreateData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name OrganizationsGeneratePaymentLinkCreate
     * @summary Generate a payment link for an organization
     * @request POST:/core/organizations/{id}/generate-payment-link
     * @secure
     */
    organizationsGeneratePaymentLinkCreate: (
      { id, ...query }: OrganizationsGeneratePaymentLinkCreateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsGeneratePaymentLinkCreateData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name InvoicesDetail
     * @summary Get invoice details
     * @request GET:/core/invoices/{invoiceId}
     * @secure
     */
    invoicesDetail: (
      { invoiceId, ...query }: InvoicesDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<InvoicesDetailData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name InvoicesStatusPartialUpdate
     * @summary Update invoice status
     * @request PATCH:/core/invoices/{invoiceId}/status
     * @secure
     */
    invoicesStatusPartialUpdate: (
      { invoiceId, ...query }: InvoicesStatusPartialUpdateParams,
      data: {
        status?: "draft" | "issued" | "paid" | "overdue";
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<InvoicesStatusPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name OrgsBillingList
     * @summary Get org billing overview (superadmin only)
     * @request GET:/core/orgs/{orgId}/billing
     * @secure
     */
    orgsBillingList: (
      { orgId, ...query }: OrgsBillingListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgsBillingListData>>;
    /**
     * No description
     *
     * @tags Billing
     * @name OrgsInvoicesGenerateCreate
     * @summary Manually generate an invoice for an org (superadmin only)
     * @request POST:/core/orgs/{orgId}/invoices/generate
     * @secure
     */
    orgsInvoicesGenerateCreate: (
      { orgId, ...query }: OrgsInvoicesGenerateCreateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgsInvoicesGenerateCreateData>>;
  };
  subscriptions: {
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsExtendPartialUpdate
     * @summary Extend organization subscription
     * @request PATCH:/core/organizations/{id}/extend
     * @secure
     */
    organizationsExtendPartialUpdate: (
      { id, ...query }: OrganizationsExtendPartialUpdateParams,
      data: {
        days?: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsExtendPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsSuspendPartialUpdate
     * @summary Suspend organization
     * @request PATCH:/core/organizations/{id}/suspend
     * @secure
     */
    organizationsSuspendPartialUpdate: (
      { id, ...query }: OrganizationsSuspendPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsSuspendPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsReactivatePartialUpdate
     * @summary Reactivate suspended organization
     * @request PATCH:/core/organizations/{id}/reactivate
     * @secure
     */
    organizationsReactivatePartialUpdate: (
      { id, ...query }: OrganizationsReactivatePartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsReactivatePartialUpdateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsCancelCreate
     * @summary Cancel organization subscription
     * @request POST:/core/organizations/{id}/cancel
     * @secure
     */
    organizationsCancelCreate: (
      { id, ...query }: OrganizationsCancelCreateParams,
      data: {
        mode?: "immediate" | "end_of_period";
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsCancelCreateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsAdjustCreditsCreate
     * @summary Manually adjust organization credits
     * @request POST:/core/organizations/{id}/adjust-credits
     * @secure
     */
    organizationsAdjustCreditsCreate: (
      { id, ...query }: OrganizationsAdjustCreditsCreateParams,
      data: {
        /** Amount in minor currency units */
        amountMinor: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsAdjustCreditsCreateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsAutoRenewPartialUpdate
     * @summary Toggle auto-renew for organization
     * @request PATCH:/core/organizations/{id}/auto-renew
     * @secure
     */
    organizationsAutoRenewPartialUpdate: (
      { id, ...query }: OrganizationsAutoRenewPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsAutoRenewPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrganizationsPlanPartialUpdate
     * @summary Assign a plan to an organization
     * @request PATCH:/core/organizations/{orgId}/plan
     * @secure
     */
    organizationsPlanPartialUpdate: (
      { orgId, ...query }: OrganizationsPlanPartialUpdateParams,
      data: {
        planId?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrganizationsPlanPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgSubscriptionList
     * @summary Get subscription overview for an organization
     * @request GET:/core/org/{orgId}/subscription
     * @secure
     */
    orgSubscriptionList: (
      { orgId, ...query }: OrgSubscriptionListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgSubscriptionListData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgUsageList
     * @summary Get usage metrics for an organization
     * @request GET:/core/org/{orgId}/usage
     * @secure
     */
    orgUsageList: (
      { orgId, ...query }: OrgUsageListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgUsageListData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgChangePlanCreate
     * @summary Change organization plan
     * @request POST:/core/org/{orgId}/change-plan
     * @secure
     */
    orgChangePlanCreate: (
      { orgId, ...query }: OrgChangePlanCreateParams,
      data: {
        planId?: string;
        expectedVersion?: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgChangePlanCreateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgAddAddonCreate
     * @summary Add an add-on to an organization
     * @request POST:/core/org/{orgId}/add-addon
     * @secure
     */
    orgAddAddonCreate: (
      { orgId, ...query }: OrgAddAddonCreateParams,
      data: {
        addonKey: string;
        expectedVersion?: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgAddAddonCreateData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name OrgRemoveAddonDelete
     * @summary Remove an add-on from an organization
     * @request DELETE:/core/org/{orgId}/remove-addon
     * @secure
     */
    orgRemoveAddonDelete: (
      { orgId, ...query }: OrgRemoveAddonDeleteParams,
      data: {
        addonKey?: string;
        expectedVersion?: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgRemoveAddonDeleteData>>;
    /**
     * No description
     *
     * @tags Subscriptions
     * @name TrialsList
     * @summary List all trial organizations (superadmin only)
     * @request GET:/core/trials
     * @secure
     */
    trialsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<TrialsListData>>;
  };
  plans: {
    /**
     * No description
     *
     * @tags Plans
     * @name PlansList
     * @summary List all plans
     * @request GET:/core/plans
     * @secure
     */
    plansList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<PlansListData>>;
    /**
     * No description
     *
     * @tags Plans
     * @name PlansCreate
     * @summary Create a plan (superadmin only)
     * @request POST:/core/plans
     * @secure
     */
    plansCreate: (
      data: {
        name: string;
        price: number;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<PlansCreateData>>;
    /**
     * No description
     *
     * @tags Plans
     * @name PlansUpdate
     * @summary Update a plan (superadmin only)
     * @request PUT:/core/plans/{id}
     * @secure
     */
    plansUpdate: (
      { id, ...query }: PlansUpdateParams,
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<AxiosResponse<PlansUpdateData>>;
    /**
     * No description
     *
     * @tags Plans
     * @name PlansStatusPartialUpdate
     * @summary Activate or archive a plan
     * @request PATCH:/core/plans/{id}/status
     * @secure
     */
    plansStatusPartialUpdate: (
      { id, ...query }: PlansStatusPartialUpdateParams,
      data: {
        status?: "active" | "archived";
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<PlansStatusPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Plans
     * @name PlansUsageList
     * @summary Get usage statistics for a plan
     * @request GET:/core/plans/{id}/usage
     * @secure
     */
    plansUsageList: (
      { id, ...query }: PlansUsageListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<PlansUsageListData>>;
    /**
     * No description
     *
     * @tags Plans
     * @name AddonsList
     * @summary List available add-ons
     * @request GET:/core/addons
     * @secure
     */
    addonsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<AddonsListData>>;
  };
  coupons: {
    /**
     * No description
     *
     * @tags Coupons
     * @name CouponsCreate
     * @summary Create a discount coupon (superadmin only)
     * @request POST:/core/coupons
     * @secure
     */
    couponsCreate: (
      data: {
        code?: string;
        discount?: number;
        /** @format date-time */
        validUntil?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<CouponsCreateData>>;
    /**
     * No description
     *
     * @tags Coupons
     * @name CouponsUpdate
     * @summary Update a coupon (superadmin only)
     * @request PUT:/core/coupons/{id}
     * @secure
     */
    couponsUpdate: (
      { id, ...query }: CouponsUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<CouponsUpdateData>>;
    /**
     * No description
     *
     * @tags Coupons
     * @name CampaignsCreate
     * @summary Create a marketing campaign (superadmin only)
     * @request POST:/core/campaigns
     * @secure
     */
    campaignsCreate: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<CampaignsCreateData>>;
    /**
     * No description
     *
     * @tags Coupons
     * @name CampaignsUpdate
     * @summary Update a campaign (superadmin only)
     * @request PUT:/core/campaigns/{id}
     * @secure
     */
    campaignsUpdate: (
      { id, ...query }: CampaignsUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<CampaignsUpdateData>>;
  };
  features: {
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesList
     * @summary List all platform feature flags (managed)
     * @request GET:/core/features
     * @secure
     */
    featuresList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<FeaturesListData>>;
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesCreate
     * @summary Create a platform feature (superadmin only)
     * @request POST:/core/features
     * @secure
     */
    featuresCreate: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<FeaturesCreateData>>;
    /**
     * No description
     *
     * @tags Features
     * @name FeaturesUpdate
     * @summary Update a feature (superadmin only)
     * @request PUT:/core/features/{id}
     * @secure
     */
    featuresUpdate: (
      { id, ...query }: FeaturesUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<FeaturesUpdateData>>;
    /**
     * No description
     *
     * @tags Features
     * @name OrgFeaturePartialUpdate
     * @summary Override a feature flag for a specific organization
     * @request PATCH:/core/org/{orgId}/feature/{key}
     * @secure
     */
    orgFeaturePartialUpdate: (
      { orgId, key, ...query }: OrgFeaturePartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<OrgFeaturePartialUpdateData>>;
  };
  support: {
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketsList
     * @summary List all platform support tickets
     * @request GET:/core/support/tickets
     * @secure
     */
    supportTicketsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<SupportTicketsListData>>;
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketForensicList
     * @summary Get forensic context for a support ticket
     * @request GET:/core/support/ticket/{id}/forensic
     * @secure
     */
    supportTicketForensicList: (
      { id, ...query }: SupportTicketForensicListParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<SupportTicketForensicListData>>;
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketAssignPartialUpdate
     * @summary Assign a ticket to a support agent
     * @request PATCH:/core/support/ticket/{id}/assign
     * @secure
     */
    supportTicketAssignPartialUpdate: (
      { id, ...query }: SupportTicketAssignPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<SupportTicketAssignPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketApproveRefundCreate
     * @summary Approve a refund for a support ticket
     * @request POST:/core/support/ticket/{id}/approve-refund
     * @secure
     */
    supportTicketApproveRefundCreate: (
      { id, ...query }: SupportTicketApproveRefundCreateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<SupportTicketApproveRefundCreateData>>;
    /**
     * No description
     *
     * @tags Support
     * @name SupportTicketMessageCreate
     * @summary Add a message to a support ticket
     * @request POST:/core/support/ticket/{id}/message
     * @secure
     */
    supportTicketMessageCreate: (
      { id, ...query }: SupportTicketMessageCreateParams,
      data: {
        message: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<SupportTicketMessageCreateData>>;
  };
  profile: {
    /**
     * No description
     *
     * @tags Profile
     * @name GetProfile
     * @summary Get authenticated platform user profile
     * @request GET:/core/me
     * @secure
     */
    getProfile: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<GetProfileData>>;
    /**
     * No description
     *
     * @tags Profile
     * @name PutProfile
     * @summary Update authenticated platform user profile
     * @request PUT:/core/me
     * @secure
     */
    putProfile: (
      data: {
        name?: string;
        /** @format email */
        email?: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<PutProfileData>>;
    /**
     * No description
     *
     * @tags Profile
     * @name ChangePasswordUpdate
     * @summary Change platform user password
     * @request PUT:/core/change-password
     * @secure
     */
    changePasswordUpdate: (
      data: {
        currentPassword: string;
        /** @minLength 8 */
        newPassword: string;
      },
      params?: RequestParams,
    ) => Promise<AxiosResponse<ChangePasswordUpdateData>>;
    /**
     * No description
     *
     * @tags Profile
     * @name UsersManageCredentialsPartialUpdate
     * @summary Admin credential management for platform users
     * @request PATCH:/core/users/{userId}/manage-credentials
     * @secure
     */
    usersManageCredentialsPartialUpdate: (
      { userId, ...query }: UsersManageCredentialsPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersManageCredentialsPartialUpdateData>>;
  };
  notifications: {
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsList
     * @summary Get platform notifications for authenticated user
     * @request GET:/core/notifications
     * @secure
     */
    notificationsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<NotificationsListData>>;
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsReadAllPartialUpdate
     * @summary Mark all notifications as read
     * @request PATCH:/core/notifications/read-all
     * @secure
     */
    notificationsReadAllPartialUpdate: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<NotificationsReadAllPartialUpdateData>>;
    /**
     * No description
     *
     * @tags Notifications
     * @name NotificationsReadPartialUpdate
     * @summary Mark a specific notification as read
     * @request PATCH:/core/notifications/{id}/read
     * @secure
     */
    notificationsReadPartialUpdate: (
      { id, ...query }: NotificationsReadPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<NotificationsReadPartialUpdateData>>;
  };
  settings: {
    /**
     * No description
     *
     * @tags Settings
     * @name SettingsList
     * @summary Get global platform settings
     * @request GET:/core/settings
     * @secure
     */
    settingsList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<SettingsListData>>;
    /**
     * No description
     *
     * @tags Settings
     * @name SettingsUpdate
     * @summary Update global platform settings (superadmin only)
     * @request PUT:/core/settings
     * @secure
     */
    settingsUpdate: (
      data: Record<string, any>,
      params?: RequestParams,
    ) => Promise<AxiosResponse<SettingsUpdateData>>;
  };
  userGovernance: {
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformList
     * @summary List all platform superadmin users
     * @request GET:/core/users/platform
     * @secure
     */
    usersPlatformList: (
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersPlatformListData>>;
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformDetail
     * @summary Get platform user details + audit trail (superadmin only)
     * @request GET:/core/users/platform/{id}
     * @secure
     */
    usersPlatformDetail: (
      { id, ...query }: UsersPlatformDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersPlatformDetailData>>;
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersPlatformForceLogoutPartialUpdate
     * @summary Force logout all sessions for a platform user
     * @request PATCH:/core/users/platform/{id}/force-logout
     * @secure
     */
    usersPlatformForceLogoutPartialUpdate: (
      { id, ...query }: UsersPlatformForceLogoutPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersPlatformForceLogoutPartialUpdateData>>;
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgDetail
     * @summary List org users (governance view)
     * @request GET:/core/users/org/{orgId}
     * @secure
     */
    usersOrgDetail: (
      { orgId, ...query }: UsersOrgDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersOrgDetailData>>;
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgUserDetail
     * @summary Get org user detail (governance view)
     * @request GET:/core/users/org/{orgId}/{userId}
     * @secure
     */
    usersOrgUserDetail: (
      { orgId, userId, ...query }: UsersOrgUserDetailParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersOrgUserDetailData>>;
    /**
     * No description
     *
     * @tags UserGovernance
     * @name UsersOrgForceLogoutPartialUpdate
     * @summary Force logout all sessions for an org user
     * @request PATCH:/core/users/org/{orgId}/{userId}/force-logout
     * @secure
     */
    usersOrgForceLogoutPartialUpdate: (
      { orgId, userId, ...query }: UsersOrgForceLogoutPartialUpdateParams,
      params?: RequestParams,
    ) => Promise<AxiosResponse<UsersOrgForceLogoutPartialUpdateData>>;
  };
}
