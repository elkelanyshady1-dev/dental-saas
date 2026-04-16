/**
 * CORE ROUTING FILE — App.jsx
 * DO NOT restructure imports without domain mapping validation.
 * See: specs/domain_mapping_report.md
 *
 * Import sources: pages/org/, modules/org/, org/modules/, modules/patientDomain/
 * All actively consumed — verified Phase 4.1
 */
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Suspense } from "react";

import { useAuth, AuthProvider } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";
import { SocketProvider } from "./context/SocketContext";
import { CapabilityProvider } from "./context/CapabilityContext";
import { FeatureProvider } from "./context/FeatureContext";
import CapabilityDebugger from "./components/CapabilityDebugger";
import FeatureGate from "./components/FeatureGate";
import UpgradePlanBanner from "./components/UpgradePlanBanner";
import GlobalToaster from "./components/GlobalToaster";

/* =========================
   Public Pages
========================= */
import PublicLayout from "./modules/public-site/PublicLayout";
import Home from "./modules/public-site/Home";
import Features from "./modules/public-site/Features";
import Pricing from "./modules/public-site/Pricing";
import About from "./modules/public-site/About";
import Contact from "./modules/public-site/Contact";
import SignupPage from "./modules/public-site/SignupPage";
import PrivacyPage from "./modules/public-site/PrivacyPage";
import TermsPage from "./modules/public-site/TermsPage";
import VerifyEmailPage from "./modules/auth/pages/VerifyEmailPage";
import SharedCaseView from "./pages/SharedCaseView";

/* =========================
   Org Auth & Layout
========================= */
import LoginPage from "./app/LoginPage";
import ForgotPasswordPage from "./app/ForgotPasswordPage";
import ResetPasswordPage from "./app/ResetPasswordPage";
import OrgLayout from "./layouts/org/OrgLayout";
import RequireOrgPermission from "./org/guards/RequireOrgPermission";
import Dashboard from "./pages/org/Dashboard";
import PatientsPage from "./modules/org/patients/pages/PatientsPage";
import PatientWorkspace from "./modules/org/patients/pages/PatientWorkspace";
import TreatmentJourneyPage from "./modules/org/patients/pages/TreatmentJourneyPage";
import NewPatientPage from "./org/modules/patients/NewPatientPage";
import CalendarPage from "./modules/org/calendar/pages/CalendarPage";
import CalendarSettingsPage from "./modules/org/calendar/pages/CalendarSettingsPage";
import Appointments from "./pages/org/Appointments";
import Finance from "./pages/org/Finance";
import Inventory from "./pages/org/Inventory";
import Analytics from "./pages/org/Analytics";
import Settings from "./pages/org/Settings";

/* =========================
   Org Admin Modules — Staff Module (Phase 2)
========================= */
import StaffPage from "./modules/org/staff/pages/StaffPage";
import ProfileCompletionPage from "./modules/org/staff/pages/ProfileCompletionPage";
import StaffRolesPage from "./modules/org/staff/pages/RolesPage";
import BranchesPage from "./modules/org/branches/pages/BranchesPage";
import ProfilePage from "./modules/org/profile/pages/ProfilePage";

/* =========================
   Clinical Phase 4
========================= */
import TreatmentsPage from "./modules/org/clinical/pages/TreatmentsPage";

/* =========================
   Security Phase 7
========================= */
import SecurityPage from "./modules/org/security/pages/SecurityPage";
import AuthAnalyticsPage from "./modules/org/security/analytics/pages/AuthAnalyticsPage";

/* =========================
   Features Control Center Phase 24
========================= */
import FeaturesControlCenter from "./modules/org/features/pages/FeaturesControlCenter";

/* =========================
   Settings Hub Phase H
========================= */
import BillingPage from "./modules/org/settings/pages/BillingPage";
import SupportPage from "./modules/org/settings/pages/SupportPage";
import BrandingPage from "./modules/org/settings/pages/BrandingPage";
import OrganizationPage from "./modules/org/settings/pages/OrganizationPage";
import ClinicBillingSettingsPage from "./modules/org/settings/pages/ClinicBillingSettingsPage";
import SupportConfigPage from "./modules/org/settings/pages/SupportConfigPage";

/* =========================
   Finance Phase 5
========================= */
import OrgInvoicesPage from "./modules/org/finance/pages/InvoicesPage";

/* =========================
   Orthodontics Phase 6
========================= */
import OrthodonticCasesPage from "./modules/org/orthodontics/pages/OrthodonticCasesPage";
import OrthodonticCasePage from "./modules/org/orthodontics/pages/OrthodonticCasePage";

/* =========================
   Patient Internal (v2)
========================= */
import PatientLayout from "./org/modules/patients/PatientLayout";
import OverviewTab from "./org/modules/patients/tabs/OverviewTab";
import ClinicalTab from "./org/modules/patients/tabs/ClinicalTab";
import OrthodonticTab from "./org/modules/patients/tabs/OrthodonticTab";
import FinancialTab from "./org/modules/patients/tabs/FinancialTab";
import AppointmentsTab from "./org/modules/patients/tabs/AppointmentsTab";
import DocumentsTab from "./org/modules/patients/tabs/DocumentsTab";
import TreatmentsTab from "./modules/org/patients/components/tabs/TreatmentsTab";
import TimelineTab from "./org/modules/patients/tabs/TimelineTab";
import AuditTab from "./org/modules/patients/tabs/AuditTab";
import { QueryProvider } from "./modules/org/patients/hooks/QueryProvider";

/* =========================
   Patient Portal (Phase 6 — Access System Integration)
========================= */
import {
  PortalAuthGuard
} from "./modules/patientDomain/shared/components/AuthGuards";
import { PortalAuthProvider } from "./modules/patientDomain/portal/context/PortalAuthContext";
import PortalLayout from "./modules/patientDomain/portal/layout/PortalLayout";
import PortalDashboard from "./modules/patientDomain/portal/pages/PortalDashboard";
import BookingPage from "./modules/patientDomain/portal/pages/BookingPage";
import InvoicesPage from "./modules/patientDomain/portal/pages/InvoicesPage";
import PortalLoginPage from "./modules/patientDomain/portal/pages/PortalLoginPage";
import PortalMagicLinkPage from "./modules/patientDomain/portal/pages/PortalMagicLinkPage";
import PortalSetupPage from "./modules/patientDomain/portal/pages/PortalSetupPage";
import PortalAppointmentsPage from "./modules/patientDomain/portal/pages/PortalAppointmentsPage";
import PortalTreatmentsPage  from "./modules/patientDomain/portal/pages/PortalTreatmentsPage";
import PortalMessagesPage    from "./modules/patientDomain/portal/pages/PortalMessagesPage";

/* =========================
   🏛 Platform Plane (v16+)
========================= */
import { PlatformAuthProvider } from "@/platform/auth/PlatformAuthContext";
import { PlatformShell } from "@/platform/core/providers/PlatformShell";
import { PlatformGuard } from "@/platform/core/guards/PlatformGuard";
import { PlatformLayout } from "@/platform/core/layout/PlatformLayout";
import PlatformLoginPage from "@/platform/auth/PlatformLoginPage";
import PlatformChangePasswordPage from "@/platform/auth/PlatformChangePasswordPage";
import { PLATFORM_FEATURES } from "@/platform/core/routing/platformFeatureRegistry";
import RequireCapability from "@/platform/core/guards/RequireCapability";
import PlatformUnauthorized from "@/platform/core/components/PlatformUnauthorized";
import FeaturePerformanceWrapper from "@/platform/observability/FeaturePerformanceWrapper";

/* =========================
   ProtectedRoute (ORG ONLY)
   Phase X.3.2: Must check both `user` (state, triggers re-render)
   and `token` (module-level variable, may be stale after clearAuth).
========================= */
function ProtectedRoute({ children }) {
  const { token, user, loading } = useAuth();

  // Still initializing — render nothing, prevent premature API calls
  if (loading) return null;

  // Not authenticated — redirect to login
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Block platform users from org plane
  if (user?.type === "platform") {
    return <Navigate to="/platform/login" replace />;
  }

  return children;
}

/* =========================
   OrgShell (ORG CONTEXT)
========================= */
function OrgShell() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BranchProvider>
          <FeatureProvider>
            <CapabilityProvider>
              <QueryProvider>
                <Outlet />
                <CapabilityDebugger />
              </QueryProvider>
            </CapabilityProvider>
          </FeatureProvider>
        </BranchProvider>
      </SocketProvider>
    </AuthProvider>
  );
}


/* =========================
   APP ROOT
========================= */
export default function App() {
  return (
    <BrowserRouter>
      <GlobalToaster />
      <Routes>

        {/* =========================
           🌐 Public Marketing Layer
        ========================== */}
        <Route path="/" element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="features" element={<Features />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
        </Route>

        {/* =========================
           🔗 Public Shared Case Viewer (Magic Links)
        ========================== */}
        <Route path="/share/:token" element={<SharedCaseView />} />

        {/* =========================
           🏛 PLATFORM PLANE (Isolated)
        ========================== */}
        {/* Public routes — OUTSIDE PlatformShell/Boot */}
        <Route
          path="/platform/login"
          element={
            <PlatformAuthProvider>
              <PlatformLoginPage />
            </PlatformAuthProvider>
          }
        />
        <Route
          path="/platform/change-password"
          element={
            <PlatformAuthProvider>
              <PlatformChangePasswordPage />
            </PlatformAuthProvider>
          }
        />
        <Route
          path="/platform/unauthorized"
          element={
            <PlatformAuthProvider>
              <PlatformUnauthorized />
            </PlatformAuthProvider>
          }
        />

        {/* Protected platform area — inside PlatformShell (Boot + Guards) */}
        <Route
          path="/platform/*"
          element={<PlatformShell />}
        >
          <Route element={<PlatformGuard />}>
            <Route element={<PlatformLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />

              {PLATFORM_FEATURES.map((feature) => (
                <Route
                  key={feature.key}
                  path={feature.path}
                  element={
                    <RequireCapability
                      permission={feature.capability}
                      flag={feature.featureFlag}
                    >
                      <FeaturePerformanceWrapper featureKey={feature.key}>
                        <Suspense fallback={null}>
                          <feature.component {...(feature.featureProps || {})} />
                        </Suspense>
                      </FeaturePerformanceWrapper>
                    </RequireCapability>
                  }
                />
              ))}
            </Route>
          </Route>
        </Route>

        {/* =========================
           🏥 ORG + PORTAL PLANE
        ========================== */}
        <Route element={<OrgShell />}>

          {/* Org Login + Password Recovery */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* ── Profile Completion (outside OrgLayout — no sidebar) ── */}
          <Route
            path="/complete-profile"
            element={
              <ProtectedRoute>
                <ProfileCompletionPage />
              </ProtectedRoute>
            }
          />

          {/* Org Protected Area */}
          <Route
            path="/org"
            element={
              <ProtectedRoute>
                <OrgLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="patients" element={<RequireOrgPermission permission="patients.read"><PatientsPage /></RequireOrgPermission>} />
            <Route path="patients-workspace" element={<RequireOrgPermission permission="patients.read"><PatientWorkspace /></RequireOrgPermission>} />
            <Route path="treatment-journey" element={<RequireOrgPermission permission="patients.read"><TreatmentJourneyPage /></RequireOrgPermission>} />
            <Route path="patients/new" element={<RequireOrgPermission permission="patients.create"><NewPatientPage /></RequireOrgPermission>} />
            <Route path="calendar" element={<RequireOrgPermission permission="appointments.read"><CalendarPage /></RequireOrgPermission>} />
            <Route path="calendar/settings" element={<RequireOrgPermission permission="appointments.read"><CalendarSettingsPage /></RequireOrgPermission>} />
            <Route path="treatments" element={<FeatureGate module="clinical" fallback={<UpgradePlanBanner feature="clinical" />}><RequireOrgPermission permission="treatments.read"><TreatmentsPage /></RequireOrgPermission></FeatureGate>} />
            <Route path="invoices" element={<FeatureGate module="finance" fallback={<UpgradePlanBanner feature="finance" />}><RequireOrgPermission permission="accounting.read"><OrgInvoicesPage /></RequireOrgPermission></FeatureGate>} />
            <Route path="orthodontics" element={<FeatureGate module="orthodontics" fallback={<UpgradePlanBanner feature="orthodontics" />}><RequireOrgPermission permission="orthodontics.read"><OrthodonticCasesPage /></RequireOrgPermission></FeatureGate>} />
            <Route path="orthodontics/:caseId" element={<FeatureGate module="orthodontics" fallback={<UpgradePlanBanner feature="orthodontics" />}><RequireOrgPermission permission="orthodontics.read"><OrthodonticCasePage /></RequireOrgPermission></FeatureGate>} />
            <Route path="appointments" element={<RequireOrgPermission permission="appointments.read"><Appointments /></RequireOrgPermission>} />
            <Route path="finance" element={<FeatureGate module="finance" fallback={<UpgradePlanBanner feature="finance" />}><RequireOrgPermission permission="accounting.read"><Finance /></RequireOrgPermission></FeatureGate>} />
            <Route path="inventory" element={<FeatureGate module="inventory" fallback={<UpgradePlanBanner feature="inventory" />}><RequireOrgPermission permission="inventory.read"><Inventory /></RequireOrgPermission></FeatureGate>} />
            <Route path="analytics" element={<FeatureGate module="analytics" fallback={<UpgradePlanBanner feature="analytics" />}><RequireOrgPermission permission="analytics.read"><Analytics /></RequireOrgPermission></FeatureGate>} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/branding" element={<BrandingPage />} />
            <Route path="settings/organization" element={<OrganizationPage />} />
            <Route path="settings/users" element={<RequireOrgPermission permission="users.read"><StaffPage /></RequireOrgPermission>} />
            <Route path="settings/branches" element={<RequireOrgPermission permission="branches.read"><BranchesPage /></RequireOrgPermission>} />
            <Route path="settings/roles" element={<RequireOrgPermission permission="users.read"><StaffRolesPage /></RequireOrgPermission>} />
            <Route path="settings/billing" element={<RequireOrgPermission permission="billing.read"><BillingPage /></RequireOrgPermission>} />
            <Route path="settings/clinic-billing" element={<RequireOrgPermission permission="billing_settings.read"><ClinicBillingSettingsPage /></RequireOrgPermission>} />
            <Route path="settings/support" element={<RequireOrgPermission permission="support.read"><SupportPage /></RequireOrgPermission>} />
            <Route path="settings/support-config" element={<RequireOrgPermission permission="support.read"><SupportConfigPage /></RequireOrgPermission>} />

            {/* ── Settings Hub — Security & Features (Phase H.2) ──────────── */}
            <Route path="settings/security"
              element={<RequireOrgPermission permission="security.manage"><SecurityPage /></RequireOrgPermission>}
            />
            <Route path="settings/security/analytics"
              element={<RequireOrgPermission permission="security.manage"><AuthAnalyticsPage /></RequireOrgPermission>}
            />
            <Route path="settings/features"
              element={<RequireOrgPermission permission="security.manage"><FeaturesControlCenter /></RequireOrgPermission>}
            />

            {/* ── Legacy route redirects — PERMANENT — DO NOT REMOVE ────── */}
            {/* Browsers/bookmarks hitting old roots are transparently forwarded */}
            <Route path="security"         element={<Navigate to="/org/settings/security" replace />} />
            <Route path="auth-analytics"   element={<Navigate to="/org/settings/security/analytics" replace />} />
            <Route path="features-control" element={<Navigate to="/org/settings/features" replace />} />
            <Route path="profile" element={<ProfilePage />} />

            <Route path="patients/:id" element={<PatientLayout />}>
              <Route index element={<OverviewTab />} />
              <Route path="timeline" element={<TimelineTab />} />
              <Route path="clinical" element={<ClinicalTab />} />
              <Route path="orthodontic" element={<OrthodonticTab />} />
              <Route path="treatments" element={<TreatmentsTab />} />
              <Route path="appointments" element={<AppointmentsTab />} />
              <Route path="financial" element={<FinancialTab />} />
              <Route path="documents" element={<DocumentsTab />} />
              <Route path="audit" element={<RequireOrgPermission permission="security.read"><AuditTab /></RequireOrgPermission>} />
            </Route>

            {/* Catch-all: redirect unknown /org/* paths to dashboard */}
            <Route path="*" element={<Navigate to="/org/dashboard" replace />} />
          </Route>

          {/* Patient Portal — Phase 6 Access System */}
          {/* Public portal routes (no auth) */}
          <Route path="/portal/login" element={<PortalLoginPage />} />
          <Route path="/portal/magic-link" element={<PortalMagicLinkPage />} />
          <Route path="/portal/setup" element={<PortalSetupPage />} />

          {/* Protected portal routes (patientToken required) */}
          <Route
            path="/portal"
            element={
              <PortalAuthGuard>
                <PortalAuthProvider>
                  <PortalLayout />
                </PortalAuthProvider>
              </PortalAuthGuard>
            }
          >
            <Route path="dashboard" element={<PortalDashboard />} />
            <Route path="booking" element={<BookingPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="appointments" element={<PortalAppointmentsPage />} />
            <Route path="treatments" element={<PortalTreatmentsPage />} />
            <Route path="messages" element={<PortalMessagesPage />} />
          </Route>

        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}