import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import DashboardLayout from "./components/common/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Connect from "./pages/Connect";
import AlbumPage from "./pages/AlbumPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProtectedRoute from "@/components/ProtectRoute";

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
        <Route path="/connect" element={<ProtectedRoute><DashboardLayout><Connect /></DashboardLayout></ProtectedRoute>} />
        <Route path="/album/:id" element={<ProtectedRoute><AlbumPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </QueryClientProvider>
  );
};

export default App;