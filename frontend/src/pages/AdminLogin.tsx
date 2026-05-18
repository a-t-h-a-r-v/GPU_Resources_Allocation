import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Read the base URL from the environment, defaulting to "/api" if not set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function AdminLogin({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await axios.post(
        `${API_BASE_URL}/admin/login`, 
        { username, password },
        { withCredentials: true } 
      );
      
      onLoginSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyles = "flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:opacity-50";
  const labelStyles = "text-sm font-medium leading-none text-slate-300";

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-80px)] bg-slate-950 p-4">
      <Card className="w-full max-w-sm border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl tracking-tight">Admin Portal</CardTitle>
          <CardDescription className="text-slate-400">
            Secure access for infrastructure management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-md text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className={labelStyles}>Username</label>
              <input
                id="username"
                className={inputStyles}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className={labelStyles}>Password</label>
              <input
                id="password"
                type="password"
                className={inputStyles}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isLoading}>
              {isLoading ? "Authenticating..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
