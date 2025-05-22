import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/Login";
import DashboardLayout from "./components/common/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Connect from "./pages/Connect";
import AlbumPage from "./pages/AlbumPage";
import axiosInstance from "./utils/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { setupSync } from "./sync";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        if (!navigator.onLine) {
          const cachedUser = await db.users.get("currentUser");
          if (cachedUser && cachedUser.token === token) {
            setIsAuthenticated(true);
            return;
          }
          setIsAuthenticated(false);
          return;
        }

        const { data } = await axiosInstance.get("/api/auth/verify-token", {
          headers: { Authorization: `Bearer ${token}` },
        });
        await db.users.put({ id: "currentUser", token, user: data });
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Token verification failed:", error);
        localStorage.removeItem("token");
        await db.users.delete("currentUser");
        setIsAuthenticated(false);
      }
    };

    verifyToken();
  }, []);

  if (isAuthenticated === null) {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount) => {
          if (!navigator.onLine) return false; 
          return failureCount < 1;
        },
        staleTime: 1000 * 60,
      },
      mutations: {
        retry: (failureCount) => {
          if (!navigator.onLine) return false; 
          return failureCount < 1;
        },
      },
    },
  });

  useEffect(() => {
    setupSync(); 
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Settings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/connect"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Connect />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/album/:id"
          element={
            <ProtectedRoute>
              <AlbumPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </QueryClientProvider>
  );
};

export default App;