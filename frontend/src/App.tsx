import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";

// Import Admin Pages
import AdminDashboard from "@/pages/AdminDashboard";
import AdminRequests from "@/pages/AdminRequests";
import AdminNewGPU from "@/pages/AdminNewGPU";
import AdminManageGPUs from "@/pages/AdminManageGPUs";
import AdminAllocations from "@/pages/AdminAllocations";
import AdminMaintenance from "@/pages/AdminMaintenance"; 

interface ProtectedRouteProps {
  isAllowed: boolean;
  children: React.ReactNode;
}

const ProtectedRoute = ({ isAllowed, children }: ProtectedRouteProps) => {
  if (!isAllowed) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

export default function App() {
  // Initialize state from localStorage to prevent logout on refresh
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem("adminLoggedIn") === "true";
  });

  const handleLoginSuccess = () => {
    setIsAdminLoggedIn(true);
    localStorage.setItem("adminLoggedIn", "true");
  };

  const handleLogout = () => {
    setIsAdminLoggedIn(false);
    localStorage.removeItem("adminLoggedIn");
  };

  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/10">
        <Navbar isAdminLoggedIn={isAdminLoggedIn} onLogout={handleLogout} />

        <main className="w-full">
          <Routes>
            <Route path="/" element={<Home />} />

            <Route
              path="/admin"
              element={isAdminLoggedIn ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin onLoginSuccess={handleLoginSuccess} />}
            />

            <Route path="/admin/dashboard" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/requests" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminRequests /></ProtectedRoute>} />
            <Route path="/admin/gpus" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminManageGPUs /></ProtectedRoute>} />
            <Route path="/admin/gpus/new" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminNewGPU /></ProtectedRoute>} />
            <Route path="/admin/allocation" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminAllocations /></ProtectedRoute>} />
            <Route path="/admin/maintenance" element={<ProtectedRoute isAllowed={isAdminLoggedIn}><AdminMaintenance /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
