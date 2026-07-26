import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { GroupsPage } from "./pages/GroupsPage";
import { GroupPage } from "./pages/GroupPage";
import { EventPage } from "./pages/EventPage";
import { JoinPage } from "./pages/JoinPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<GroupsPage />} />
                <Route path="/groups/:groupId" element={<GroupPage />} />
                <Route path="/events/:eventId" element={<EventPage />} />
                <Route path="/join/:token" element={<JoinPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
