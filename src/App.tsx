import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { isRealMode } from './services/runtime';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Database = lazy(() => import('./pages/Database').then((module) => ({ default: module.Database })));
const Authentication = lazy(() => import('./pages/Authentication').then((module) => ({ default: module.Authentication })));
const Storage = lazy(() => import('./pages/Storage').then((module) => ({ default: module.Storage })));
const Functions = lazy(() => import('./pages/Functions').then((module) => ({ default: module.Functions })));
const Realtime = lazy(() => import('./pages/Realtime').then((module) => ({ default: module.Realtime })));
const Apis = lazy(() => import('./pages/Apis').then((module) => ({ default: module.Apis })));
const Analytics = lazy(() => import('./pages/Analytics').then((module) => ({ default: module.Analytics })));
const Logs = lazy(() => import('./pages/Logs').then((module) => ({ default: module.Logs })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const Members = lazy(() => import('./pages/Members').then((module) => ({ default: module.Members })));
const Billing = lazy(() => import('./pages/Billing').then((module) => ({ default: module.Billing })));
const Documentation = lazy(() => import('./pages/Documentation').then((module) => ({ default: module.Documentation })));
const PlatformExpansion = lazy(() => import('./pages/PlatformExpansion').then((module) => ({ default: module.PlatformExpansion })));
const Projects = lazy(() => import('./pages/Projects').then((module) => ({ default: module.Projects })));
const EnvironmentsReal = lazy(() => import('./pages/EnvironmentsReal').then((module) => ({ default: module.EnvironmentsReal })));
const BackupsPage = lazy(() => import('./brisabase/pages/BackupsPage').then((module) => ({ default: module.BackupsPage })));
const RealBillingPage = lazy(() => import('./brisabase/pages/BillingPage').then((module) => ({ default: module.BillingPage })));
const EnterprisePage = lazy(() => import('./brisabase/pages/EnterprisePage').then((module) => ({ default: module.EnterprisePage })));
const GraphqlPage = lazy(() => import('./brisabase/pages/GraphqlPage').then((module) => ({ default: module.GraphqlPage })));
const HostingPage = lazy(() => import('./brisabase/pages/HostingPage').then((module) => ({ default: module.HostingPage })));
const InfrastructurePage = lazy(() => import('./brisabase/pages/InfrastructurePage').then((module) => ({ default: module.InfrastructurePage })));
const MessagingPage = lazy(() => import('./brisabase/pages/MessagingPage').then((module) => ({ default: module.MessagingPage })));
const ObservabilityPage = lazy(() => import('./brisabase/pages/ObservabilityPage').then((module) => ({ default: module.ObservabilityPage })));
const PreviewDatabasePage = lazy(() => import('./brisabase/pages/PreviewDatabasePage').then((module) => ({ default: module.PreviewDatabasePage })));
const SecurityPage = lazy(() => import('./brisabase/pages/SecurityPage').then((module) => ({ default: module.SecurityPage })));
const DeveloperPlatformPage = lazy(() => import('./brisabase/pages/DeveloperPlatformPage').then((module) => ({ default: module.DeveloperPlatformPage })));
const RealDatabasePage = lazy(() => import('./brisabase/pages/DatabasePage').then((module) => ({ default: module.DatabasePage })));
const RealDashboardPage = lazy(() => import('./brisabase/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const RealDocumentationPage = lazy(() => import('./brisabase/pages/DocumentationPage').then((module) => ({ default: module.DocumentationPage })));
const RealAuthPage = lazy(() => import('./brisabase/pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const RealStoragePage = lazy(() => import('./brisabase/pages/StoragePage').then((module) => ({ default: module.StoragePage })));
const RealFunctionsPage = lazy(() => import('./brisabase/pages/FunctionsPage').then((module) => ({ default: module.FunctionsPage })));
const RealRealtimePage = lazy(() => import('./brisabase/pages/RealtimePage').then((module) => ({ default: module.RealtimePage })));
const RealApisPage = lazy(() => import('./brisabase/pages/ApisPage').then((module) => ({ default: module.ApisPage })));
const RealLogsPage = lazy(() => import('./brisabase/pages/LogsPage').then((module) => ({ default: module.LogsPage })));
const RealTeamPage = lazy(() => import('./brisabase/pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const AdvancedPlatformPage = lazy(() => import('./brisabase/pages/AdvancedPlatformPage').then((module) => ({ default: module.AdvancedPlatformPage })));
const Login = lazy(() => import('./pages/auth/Login').then((module) => ({ default: module.Login })));
const Register = lazy(() => import('./pages/auth/Register').then((module) => ({ default: module.Register })));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword').then((module) => ({ default: module.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword').then((module) => ({ default: module.ResetPassword })));
const UserPasswordReset = lazy(() => import('./pages/auth/UserPasswordReset').then((module) => ({ default: module.UserPasswordReset })));

function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#020817] text-sm text-slate-300" role="status" aria-live="polite">
      Carregando BrisaBase…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/v1/password-reset" element={<UserPasswordReset />} />

          {/* SaaS App Protected Layout Routes */}
          <Route
            path="/"
            element={
              <AppLayout>
                {isRealMode ? <RealDashboardPage /> : <Dashboard />}
              </AppLayout>
            }
          />
          <Route
            path="/projects"
            element={
              <AppLayout>
                <Projects />
              </AppLayout>
            }
          />
          <Route
            path="/database/*"
            element={
              <AppLayout>
                {isRealMode ? <RealDatabasePage /> : <Database />}
              </AppLayout>
            }
          />
          <Route
            path="/auth"
            element={
              <AppLayout>
                {isRealMode ? <RealAuthPage /> : <Authentication />}
              </AppLayout>
            }
          />
          <Route
            path="/storage"
            element={
              <AppLayout>
                {isRealMode ? <RealStoragePage /> : <Storage />}
              </AppLayout>
            }
          />
          <Route
            path="/functions"
            element={
              <AppLayout>
                {isRealMode ? <RealFunctionsPage /> : <Functions />}
              </AppLayout>
            }
          />
          <Route
            path="/realtime"
            element={
              <AppLayout>
                {isRealMode ? <RealRealtimePage /> : <Realtime />}
              </AppLayout>
            }
          />
          <Route
            path="/apis"
            element={
              <AppLayout>
                {isRealMode ? <RealApisPage /> : <Apis />}
              </AppLayout>
            }
          />
          <Route
            path="/data-platform"
            element={
              <AppLayout>
                {isRealMode ? <Navigate to="/" replace /> : <PlatformExpansion module="data-platform" />}
              </AppLayout>
            }
          />
          <Route
            path="/security"
            element={
              <AppLayout>
                {isRealMode ? <SecurityPage /> : <PlatformExpansion module="security" />}
              </AppLayout>
            }
          />
          <Route
            path="/environments"
            element={
              <AppLayout>
                {isRealMode ? <EnvironmentsReal /> : <PlatformExpansion module="environments" />}
              </AppLayout>
            }
          />
          <Route
            path="/developer-tools"
            element={
              <AppLayout>
                {isRealMode ? <DeveloperPlatformPage /> : <PlatformExpansion module="developer-tools" />}
              </AppLayout>
            }
          />
          <Route
            path="/hosting"
            element={
              <AppLayout>
                {isRealMode ? <HostingPage /> : <PlatformExpansion module="hosting" />}
              </AppLayout>
            }
          />
          <Route
            path="/messaging"
            element={
              <AppLayout>
                {isRealMode ? <MessagingPage /> : <PlatformExpansion module="messaging" />}
              </AppLayout>
            }
          />
          <Route
            path="/experiments"
            element={
              <AppLayout>
                {isRealMode ? <AdvancedPlatformPage module="experiments" /> : <PlatformExpansion module="experiments" />}
              </AppLayout>
            }
          />
          <Route
            path="/app-quality"
            element={
              <AppLayout>
                {isRealMode ? <AdvancedPlatformPage module="app-quality" /> : <PlatformExpansion module="app-quality" />}
              </AppLayout>
            }
          />
          <Route
            path="/search-ai"
            element={
              <AppLayout>
                {isRealMode ? <AdvancedPlatformPage module="search-ai" /> : <PlatformExpansion module="search-ai" />}
              </AppLayout>
            }
          />
          <Route
            path="/enterprise"
            element={
              <AppLayout>
                {isRealMode ? <EnterprisePage /> : <PlatformExpansion module="enterprise" />}
              </AppLayout>
            }
          />

          <Route
            path="/usage"
            element={
              <AppLayout>
                {isRealMode ? <Navigate to="/" replace /> : <PlatformExpansion module="usage" />}
              </AppLayout>
            }
          />

          <Route
            path="/graphql"
            element={
              <AppLayout>
                {isRealMode ? <GraphqlPage /> : <PlatformExpansion module="data-platform" />}
              </AppLayout>
            }
          />
          <Route
            path="/backups"
            element={
              <AppLayout>
                <BackupsPage />
              </AppLayout>
            }
          />
          <Route
            path="/previews"
            element={
              <AppLayout>
                {isRealMode ? <PreviewDatabasePage /> : <PlatformExpansion module="environments" />}
              </AppLayout>
            }
          />
          <Route
            path="/observability"
            element={
              <AppLayout>
                {isRealMode ? <ObservabilityPage /> : <Analytics />}
              </AppLayout>
            }
          />
          <Route
            path="/infrastructure"
            element={
              <AppLayout>
                {isRealMode ? <InfrastructurePage /> : <PlatformExpansion module="hosting" />}
              </AppLayout>
            }
          />

          <Route
            path="/analytics"
            element={
              <AppLayout>
                {isRealMode ? <AdvancedPlatformPage module="analytics" /> : <Analytics />}
              </AppLayout>
            }
          />
          <Route
            path="/logs"
            element={
              <AppLayout>
                {isRealMode ? <RealLogsPage /> : <Logs />}
              </AppLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <AppLayout>
                <Settings />
              </AppLayout>
            }
          />
          <Route
            path="/members"
            element={
              <AppLayout>
                {isRealMode ? <RealTeamPage /> : <Members />}
              </AppLayout>
            }
          />
          <Route
            path="/billing"
            element={
              <AppLayout>
                {isRealMode ? <RealBillingPage /> : <Billing />}
              </AppLayout>
            }
          />
          <Route
            path="/docs"
            element={
              <AppLayout>
                {isRealMode ? <RealDocumentationPage /> : <Documentation />}
              </AppLayout>
            }
          />

          {/* Catch-all redirect to Dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppProvider>
    </BrowserRouter>
  );
}
