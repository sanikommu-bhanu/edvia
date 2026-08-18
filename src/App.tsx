import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/app/AuthContext";
import { RoleShell } from "@/layouts/RoleShell";

import Splash from "@/pages/onboarding/Splash";
import { OnboardingLearn, OnboardingConnect } from "@/pages/onboarding/OnboardingSlide";
import RoleSelection from "@/pages/onboarding/RoleSelection";
import SignIn from "@/pages/auth/SignIn";
import SignUp from "@/pages/auth/SignUp";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import VerifyOtp from "@/pages/auth/VerifyOtp";

import SchoolSelection from "@/pages/setup/SchoolSelection";
import LanguageSelection from "@/pages/setup/LanguageSelection";
import InviteCode from "@/pages/setup/InviteCode";
import EdviaOnboarding from "@/pages/setup/EdviaOnboarding";
import Permissions from "@/pages/setup/Permissions";

import StudentDashboard from "@/pages/student/StudentDashboard";
import MyClasses from "@/pages/student/MyClasses";
import AssignmentsPage from "@/pages/student/Assignments";
import ExamsPage from "@/pages/student/Exams";
import AttendancePage from "@/pages/student/Attendance";

import ParentDashboard from "@/pages/parent/ParentDashboard";

import TeacherDashboard from "@/pages/teacher/TeacherDashboard";
import MarkAttendance from "@/pages/teacher/MarkAttendance";
import StudentsList from "@/pages/teacher/StudentsList";

import PrincipalDashboard from "@/pages/principal/PrincipalDashboard";
import PrincipalAnalytics from "@/pages/principal/Analytics";
import PrincipalReports from "@/pages/principal/Reports";

import CalendarPage from "@/pages/shared/Calendar";
import NoticeBoard from "@/pages/shared/NoticeBoard";
import Resources from "@/pages/shared/Resources";
import Notifications from "@/pages/shared/Notifications";
import Profile from "@/pages/shared/Profile";
import Support from "@/pages/shared/Support";
import MoreMenu from "@/pages/shared/MoreMenu";

import AssistantHome from "@/pages/ai/AssistantHome";
import AiChat from "@/pages/ai/AiChat";
import AiVoiceMode from "@/pages/ai/AiVoiceMode";
import AiResponseDetail from "@/pages/ai/AiResponseDetail";
import ScanDocument from "@/pages/ai/ScanDocument";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.onboardingComplete ? `/${user.role}` : "/school-selection"} replace />;
  return <Splash />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Onboarding / marketing */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/onboarding/learn" element={<OnboardingLearn />} />
          <Route path="/onboarding/connect" element={<OnboardingConnect />} />
          <Route path="/role-selection" element={<RoleSelection />} />

          {/* Auth */}
          <Route path="/auth/sign-in" element={<SignIn />} />
          <Route path="/auth/sign-up" element={<SignUp />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/verify-otp" element={<VerifyOtp />} />

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
            <Route path="/parent/progress" element={<ParentDashboard />} />

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
            <Route path="/support" element={<Support />} />
            <Route path="/more" element={<MoreMenu />} />

            <Route path="/ai" element={<AssistantHome />} />
            <Route path="/ai/chat" element={<AiChat />} />
            <Route path="/ai/response/:id" element={<AiResponseDetail />} />
            <Route path="/scan" element={<ScanDocument />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
