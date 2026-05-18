import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";

// A simple wrapper to protect admin sub-routes from unauthorized access
interface ProtectedRouteProps {
  isAllowed: boolean;
  children: React.ReactNode;
}

const ProtectedRoute = ({ isAllowed, children }: ProtectedRouteProps) => {
  if (!isAllowed) {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  // Global authentication state for the admin panel
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);

  // This function will now be passed to the Navbar
  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
  };

  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/10">
        {/* Pass the logout function as a prop */}
        <Navbar isAdminLoggedIn={isAdminLoggedIn} onLogout={handleAdminLogout} />

        <main className="w-full">
          <Routes>
            {/* 1. Public Student Portal Layout */}
            <Route path="/" element={<Home />} />

            {/* 2. Admin Authentication Gateway */}
            <Route
              path="/admin"
              element={
                isAdminLoggedIn ? (
                  <Navigate to="/admin/dashboard" replace />
                ) : (
                  <AdminLogin onLoginSuccess={() => setIsAdminLoggedIn(true)} />
                )
              }
            />

            {/* 3. Protected Admin Workspace Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
                    <p className="text-muted-foreground mt-2">Welcome back to the Central Computing Facility admin portal.</p>
                  </div>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/requests"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">Pending Infrastructure Requests</h1>
                  </div>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/allocation"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">Active Resource Allocations</h1>
                  </div>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/gpus"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">GPU Cluster Assets</h1>
                  </div>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/gpus/new"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">Register New Compute Node</h1>
                  </div>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/maintenance"
              element={
                <ProtectedRoute isAllowed={isAdminLoggedIn}>
                  <div className="p-8 max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">System & Node Maintenance</h1>
                  </div>
                </ProtectedRoute>
              }
            />

            {/* Fallback Catch-All Route redirects back to User Front Page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
