import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./app/AppLayout";
import LoginPage from "./app/LoginPage";
import CalendarPage from "./modules/calendar/CalendarPage";
import PatientList from "./modules/patients/PatientList";
import PatientProfile from "./modules/patients/PatientProfile";
import PlatformLoginPage from "./app/PlatformLoginPage";
import PlatformDashboard from "./app/PlatformDashboard";
import PlatformLayout from "./modules/platform/PlatformLayout";
import PlatformRevenueDashboard from "./modules/platform/PlatformRevenueDashboard";
import AnalyticsPage from "./modules/platform/AnalyticsPage";
import OrganizationsPage from "./modules/platform/OrganizationsPage";
import OrganizationDetailsPage from "./modules/platform/OrganizationDetailsPage";
import BranchDetailsPage from "./modules/platform/BranchDetailsPage";
import PlatformUsersPage from "./modules/platform/PlatformUsersPage";
import PlatformUserDetailsPage from "./modules/platform/PlatformUserDetailsPage";
import AuditLogsPage from "./modules/platform/AuditLogsPage";
import DunningMonitorPage from "./modules/platform/DunningMonitorPage";
import SystemCronPage from "./modules/platform/SystemCronPage";
import SystemEmailPage from "./modules/platform/SystemEmailPage";
import ProfilePage from "./modules/platform/ProfilePage";
import SettingsPage from "./modules/platform/SettingsPage";
import PlatformFeaturesPage from "./modules/platform/PlatformFeaturesPage";
import OrganizationUserDetailsPage from "./modules/platform/OrganizationUserDetailsPage";
import ActiveSessionsPage from "./modules/settings/ActiveSessionsPage";

// Public Site Components
import PublicLayout from "./modules/public-site/PublicLayout";
import Home from "./modules/public-site/Home";
import Features from "./modules/public-site/Features";
import Pricing from "./modules/public-site/Pricing";
import About from "./modules/public-site/About";
import Contact from "./modules/public-site/Contact";
import SignupPage from "./modules/public-site/SignupPage";
import PrivacyPage from "./modules/public-site/PrivacyPage";
import TermsPage from "./modules/public-site/TermsPage";
function ProtectedRoute({ children }) {
  const { token, user, loading } = useAuth();

  if (loading) return null;

  // Block if not logged in OR if user is a platform user (has "role" but no "roleId" or "organizationId")
  if (!token || user?.role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PlatformProtectedRoute({ children }) {
  const { token, user, loading } = useAuth();

  if (loading) return null;

  // Block if not logged in OR not platform user
  // Platform users use `role` (superadmin, admin, etc.)
  if (!token || !user?.role) {
    return <Navigate to="/platform/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public Marketing Layer (Unauthenticated / Allowed for all) */}
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

        {/* Platform login */}
        <Route path="/platform/login" element={<PlatformLoginPage />} />

        {/* Platform protected area */}
        <Route
          path="/platform"
          element={
            <PlatformProtectedRoute>
              <PlatformLayout />
            </PlatformProtectedRoute>
          }
        >
          <Route path="dashboard" element={<PlatformDashboard />} />
          <Route path="revenue" element={<PlatformRevenueDashboard />} />
          <Route path="dunning" element={<DunningMonitorPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="organizations/:orgId" element={<OrganizationDetailsPage />} />
          <Route path="organizations/:orgId/users/:userId" element={<OrganizationUserDetailsPage />} />
          <Route path="organizations/:orgId/branches/:branchId" element={<BranchDetailsPage />} />
          <Route path="users" element={<PlatformUsersPage />} />
          <Route path="users/:id" element={<PlatformUserDetailsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="system/cron" element={<SystemCronPage />} />
          <Route path="system/email" element={<SystemEmailPage />} />
          <Route path="features" element={<PlatformFeaturesPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Organization login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Organization protected area */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/patients" element={<PatientList />} />
          <Route path="/patients/:id" element={<PatientProfile />} />
          <Route path="/settings/sessions" element={<ActiveSessionsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}