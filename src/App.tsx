import { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/app/AuthContext";
import { SchoolProvider } from "@/app/SchoolContext";
import { RoleShell } from "@/layouts/RoleShell";
import { RouteFallback } from "@/components/shared/RouteFallback";
import { lazyWithRetry } from "@/app/lazyWithRetry";

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
const OnboardingLearn = lazyWithRetry("OnboardingLearn", () => OnboardingSlides().then((m) => ({ default: m.OnboardingLearn })));
const OnboardingConnect = lazyWithRetry("OnboardingConnect", () => OnboardingSlides().then((m) => ({ default: m.OnboardingConnect })));
const RoleSelection = lazyWithRetry("RoleSelection", () => import("@/pages/onboarding/RoleSelection"));

const SignUp = lazyWithRetry("SignUp", () => import("@/pages/auth/SignUp"));
const ForgotPassword = lazyWithRetry("ForgotPassword", () => import("@/pages/auth/ForgotPassword"));
const VerifyEmail = lazyWithRetry("VerifyEmail", () => import("@/pages/auth/VerifyEmail"));

const SchoolSelection = lazyWithRetry("SchoolSelection", () => import("@/pages/setup/SchoolSelection"));
const LanguageSelection = lazyWithRetry("LanguageSelection", () => import("@/pages/setup/LanguageSelection"));
const InviteCode = lazyWithRetry("InviteCode", () => import("@/pages/setup/InviteCode"));
const EdviaOnboarding = lazyWithRetry("EdviaOnboarding", () => import("@/pages/setup/EdviaOnboarding"));
const Permissions = lazyWithRetry("Permissions", () => import("@/pages/setup/Permissions"));

const StudentDashboard = lazyWithRetry("StudentDashboard", () => import("@/pages/student/StudentDashboard"));
const MyClasses = lazyWithRetry("MyClasses", () => import("@/pages/student/MyClasses"));
const AssignmentsPage = lazyWithRetry("AssignmentsPage", () => import("@/pages/student/Assignments"));
const ExamsPage = lazyWithRetry("ExamsPage", () => import("@/pages/student/Exams"));
const AttendancePage = lazyWithRetry("AttendancePage", () => import("@/pages/student/Attendance"));

const ParentDashboard = lazyWithRetry("ParentDashboard", () => import("@/pages/parent/ParentDashboard"));

const TeacherDashboard = lazyWithRetry("TeacherDashboard", () => import("@/pages/teacher/TeacherDashboard"));
const MarkAttendance = lazyWithRetry("MarkAttendance", () => import("@/pages/teacher/MarkAttendance"));
const EnterMarks = lazyWithRetry("EnterMarks", () => import("@/pages/teacher/EnterMarks"));
const StudentsList = lazyWithRetry("StudentsList", () => import("@/pages/teacher/StudentsList"));

const PrincipalDashboard = lazyWithRetry("PrincipalDashboard", () => import("@/pages/principal/PrincipalDashboard"));
const PrincipalAnalytics = lazyWithRetry("PrincipalAnalytics", () => import("@/pages/principal/Analytics"));
const PrincipalReports = lazyWithRetry("PrincipalReports", () => import("@/pages/principal/Reports"));

const CalendarPage = lazyWithRetry("CalendarPage", () => import("@/pages/shared/Calendar"));
const NoticeBoard = lazyWithRetry("NoticeBoard", () => import("@/pages/shared/NoticeBoard"));
const Resources = lazyWithRetry("Resources", () => import("@/pages/shared/Resources"));
const Notifications = lazyWithRetry("Notifications", () => import("@/pages/shared/Notifications"));
const Profile = lazyWithRetry("Profile", () => import("@/pages/shared/Profile"));
const Settings = lazyWithRetry("Settings", () => import("@/pages/shared/Settings"));
const Help = lazyWithRetry("Help", () => import("@/pages/shared/Help"));
const Support = lazyWithRetry("Support", () => import("@/pages/shared/Support"));
const Grades = lazyWithRetry("Grades", () => import("@/pages/shared/Grades"));
const SupportInbox = lazyWithRetry("SupportInbox", () => import("@/pages/staff/SupportInbox"));
const MoreMenu = lazyWithRetry("MoreMenu", () => import("@/pages/shared/MoreMenu"));

const AssistantHome = lazyWithRetry("AssistantHome", () => import("@/pages/ai/AssistantHome"));
const AiChat = lazyWithRetry("AiChat", () => import("@/pages/ai/AiChat"));
const AiVoiceMode = lazyWithRetry("AiVoiceMode", () => import("@/pages/ai/AiVoiceMode"));
const AiResponseDetail = lazyWithRetry("AiResponseDetail", () => import("@/pages/ai/AiResponseDetail"));
const ScanDocument = lazyWithRetry("ScanDocument", () => import("@/pages/ai/ScanDocument"));

// ---- self-serve onboarding -------------------------------------------------
const Welcome = lazyWithRetry("Welcome", () => import("@/pages/onboarding/Welcome"));
const CreateSchool = lazyWithRetry("CreateSchool", () => import("@/pages/setup/CreateSchool"));
const JoinPage = lazyWithRetry("JoinPage", () => import("@/pages/join/JoinPage"));
const InvitesPanel = lazyWithRetry("InvitesPanel", () => import("@/pages/shared/InvitesPanel"));
const CreateClass = lazyWithRetry("CreateClass", () => import("@/pages/teacher/CreateClass"));

/**
 * Where "/" goes, in one place.
 *
 * The rule that matters is the middle branch. An authenticated account with
 * no schoolId is not a broken account and not a half-finished signup — it is
 * the NORMAL state of someone who just created a Google account and has not
 * been given a school yet. It gets /welcome, which offers exactly the two
 * real ways to acquire one. It used to get /school-selection, a list of
 * pre-seeded schools, which is why the product could not be adopted by a
 * school that was not already in the database.
 */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Splash />;
  if (!user.schoolId) return <Navigate to="/welcome" replace />;
  return <Navigate to={`/${user.role}`} replace />;
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

              {/* Self-serve onboarding: create a school, or join one */}
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/school/create" element={<CreateSchool />} />
              {/* Both join entry points. The token form is what a QR encodes;
                  the bare form is for a code typed off a noticeboard. */}
              <Route path="/join" element={<JoinPage />} />
              <Route path="/join/:token" element={<JoinPage />} />

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
                <Route path="/student/grades" element={<Grades />} />

                <Route path="/parent" element={<ParentDashboard />} />
                <Route path="/parent/progress" element={<AttendancePage />} />
                <Route path="/parent/assignments" element={<AssignmentsPage />} />
                <Route path="/parent/grades" element={<Grades />} />

                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/teacher/classes" element={<MyClasses />} />
                <Route path="/teacher/students" element={<StudentsList />} />
                <Route path="/teacher/attendance/:classId" element={<MarkAttendance />} />
                <Route path="/teacher/classes/new" element={<CreateClass />} />
                <Route path="/teacher/marks" element={<EnterMarks />} />
                <Route path="/teacher/marks/:classId" element={<EnterMarks />} />
                <Route path="/teacher/support" element={<SupportInbox />} />
                <Route path="/teacher/invites" element={<InvitesPanel />} />

                <Route path="/principal" element={<PrincipalDashboard />} />
                <Route path="/principal/analytics" element={<PrincipalAnalytics />} />
                <Route path="/principal/reports" element={<PrincipalReports />} />
                <Route path="/principal/invites" element={<InvitesPanel />} />
                <Route path="/principal/classes/new" element={<CreateClass />} />
                <Route path="/principal/support" element={<SupportInbox />} />

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
