import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/app/AuthContext";
import { SchoolProvider } from "@/app/SchoolContext";
import { RoleShell } from "@/layouts/RoleShell";
import { RouteFallback } from "@/components/shared/RouteFallback";

// ==========================================================================
// Routing and code splitting
// ==========================================================================
// Splash and the auth screens load eagerly: they are the first paint, and
// putting a loading state in front of a loading screen helps nobody.
//
// Everything else is lazy. Two of these are genuinely heavy and worth
// naming: AiVoiceMode pulls in the Gemini Live SDK and the audio pipeline,
// and the principal screens pull in Recharts. Neither should be in the
// bundle a student downloads to check their timetable.
// ==========================================================================
import Splash from "@/pages/onboarding/Splash";
import SignIn from "@/pages/auth/SignIn";

const OnboardingSlides = () => import("@/pages/onboarding/OnboardingSlide");
const OnboardingLearn = lazy(() => OnboardingSlides().then((m) => ({ default: m.OnboardingLearn })));
const OnboardingConnect = lazy(() => OnboardingSlides().then((m) => ({ default: m.OnboardingConnect })));
const RoleSelection = lazy(() => import("@/pages/onboarding/RoleSelection"));

const SignUp = lazy(() => import("@/pages/auth/SignUp"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const VerifyEmail = lazy(() => import("@/pages/auth/VerifyEmail"));

const SchoolSelection = lazy(() => import("@/pages/setup/SchoolSelection"));
const LanguageSelection = lazy(() => import("@/pages/setup/LanguageSelection"));
const InviteCode = lazy(() => import("@/pages/setup/InviteCode"));
const EdviaOnboarding = lazy(() => import("@/pages/setup/EdviaOnboarding"));
const Permissions = lazy(() => import("@/pages/setup/Permissions"));

const StudentDashboard = lazy(() => import("@/pages/student/StudentDashboard"));
const MyClasses = lazy(() => import("@/pages/student/MyClasses"));
const AssignmentsPage = lazy(() => import("@/pages/student/Assignments"));
const ExamsPage = lazy(() => import("@/pages/student/Exams"));
const AttendancePage = lazy(() => import("@/pages/student/Attendance"));

const ParentDashboard = lazy(() => import("@/pages/parent/ParentDashboard"));

const TeacherDashboard = lazy(() => import("@/pages/teacher/TeacherDashboard"));
const MarkAttendance = lazy(() => import("@/pages/teacher/MarkAttendance"));
const StudentsList = lazy(() => import("@/pages/teacher/StudentsList"));

const PrincipalDashboard = lazy(() => import("@/pages/principal/PrincipalDashboard"));
const PrincipalAnalytics = lazy(() => import("@/pages/principal/Analytics"));
const PrincipalReports = lazy(() => import("@/pages/principal/Reports"));

const CalendarPage = lazy(() => import("@/pages/shared/Calendar"));
const NoticeBoard = lazy(() => import("@/pages/shared/NoticeBoard"));
const Resources = lazy(() => import("@/pages/shared/Resources"));
const Notifications = lazy(() => import("@/pages/shared/Notifications"));
const Profile = lazy(() => import("@/pages/shared/Profile"));
const Settings = lazy(() => import("@/pages/shared/Settings"));
const Help = lazy(() => import("@/pages/shared/Help"));
const Support = lazy(() => import("@/pages/shared/Support"));
const MoreMenu = lazy(() => import("@/pages/shared/MoreMenu"));

const AssistantHome = lazy(() => import("@/pages/ai/AssistantHome"));
const AiChat = lazy(() => import("@/pages/ai/AiChat"));
const AiVoiceMode = lazy(() => import("@/pages/ai/AiVoiceMode"));
const AiResponseDetail = lazy(() => import("@/pages/ai/AiResponseDetail"));
const ScanDocument = lazy(() => import("@/pages/ai/ScanDocument"));

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (user) return <Navigate to={user.onboardingComplete ? `/${user.role}` : "/school-selection"} replace />;
  return <Splash />;
}

export default function App() {
  return (
    <AuthProvider>
      <SchoolProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Onboarding */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/onboarding/learn" element={<OnboardingLearn />} />
              <Route path="/onboarding/connect" element={<OnboardingConnect />} />
              <Route path="/role-selection" element={<RoleSelection />} />

              {/* Auth */}
              <Route path="/auth/sign-in" element={<SignIn />} />
              <Route path="/auth/sign-up" element={<SignUp />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />

              {/* Post-auth setup */}
              <Route path="/school-selection" element={<SchoolSelection />} />
              <Route path="/language-selection" element={<LanguageSelection />} />
              <Route path="/invite-code" element={<InviteCode />} />
              <Route path="/edvia-onboarding" element={<EdviaOnboarding />} />
              <Route path="/permissions" element={<Permissions />} />

              {/* Immersive voice mode — no bottom nav */}
              <Route path="/ai/voice" element={<AiVoiceMode />} />

              {/* Role-aware protected app shell */}
              <Route element={<RoleShell />}>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/classes" element={<MyClasses />} />
                <Route path="/student/assignments" element={<AssignmentsPage />} />
                <Route path="/student/exams" element={<ExamsPage />} />
                <Route path="/student/attendance" element={<AttendancePage />} />

                <Route path="/parent" element={<ParentDashboard />} />
                <Route path="/parent/progress" element={<AttendancePage />} />
                <Route path="/parent/assignments" element={<AssignmentsPage />} />

                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/teacher/classes" element={<MyClasses />} />
                <Route path="/teacher/students" element={<StudentsList />} />
                <Route path="/teacher/attendance/:classId" element={<MarkAttendance />} />

                <Route path="/principal" element={<PrincipalDashboard />} />
                <Route path="/principal/analytics" element={<PrincipalAnalytics />} />
                <Route path="/principal/reports" element={<PrincipalReports />} />

                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/notices" element={<NoticeBoard />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/help" element={<Help />} />
                <Route path="/support" element={<Support />} />
                <Route path="/more" element={<MoreMenu />} />

                <Route path="/ai" element={<AssistantHome />} />
                <Route path="/ai/chat" element={<AiChat />} />
                <Route path="/ai/response/:id" element={<AiResponseDetail />} />
                <Route path="/scan" element={<ScanDocument />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SchoolProvider>
    </AuthProvider>
  );
}
