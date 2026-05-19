import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function AdminNewGPU() {
  const navigate = useNavigate();
  // Changed gpuNumber to gpuCount to reflect total number
  const [formData, setFormData] = useState({
    resourceId: "",
    gpuCount: "1", 
    resourceType: "Server",
    ipAddress: "",
    username: "",
    password: "",
    credentialActive: true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const count = parseInt(formData.gpuCount, 10);
    if (isNaN(count) || count < 1) {
      alert("Please enter a valid number of GPUs");
      return;
    }

    try {
      // 1. Separate gpuCount from the rest of the payload
      const { gpuCount, ...basePayload } = formData;
      
      // 2. Create an array of POST requests for GPU 1 to N
      const requests = Array.from({ length: count }, (_, i) => {
        const gpuNumberString = (i + 1).toString();
        
        return axios.post(`${API_BASE_URL}/admin/gpus`, {
          ...basePayload,
          gpuNumber: gpuNumberString // Assigns 1, 2, 3... automatically
        }, { withCredentials: true });
      });

      // 3. Execute all requests concurrently
      await Promise.all(requests);
      
      navigate("/admin/gpus");
    } catch (error) {
      console.error(error);
      alert("Failed to create devices. Check console for details.");
    }
  };

  const inputStyles = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Register New Compute Node</CardTitle>
          <CardDescription>Enter GPU and networking details below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Resource ID (e.g., DGX-100)</label>
                <input 
                  required 
                  className={inputStyles}
                  pattern="^[a-zA-Z0-9\-_]+$"
                  title="Only alphanumeric characters, hyphens, and underscores allowed" 
                  value={formData.resourceId} 
                  onChange={(e) => setFormData({ ...formData, resourceId: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                {/* Updated Label to clarify intent */}
                <label className="text-sm font-medium">Total Number of GPUs</label>
                <input 
                  required 
                  type="number"
                  min="1"
                  className={inputStyles} 
                  value={formData.gpuCount} 
                  onChange={(e) => setFormData({ ...formData, gpuCount: e.target.value })} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Resource Type</label>
                <select className={inputStyles} value={formData.resourceType} onChange={(e) => setFormData({ ...formData, resourceType: e.target.value })}>
                  <option value="Server">Server</option>
                  <option value="Workstation">Workstation</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">IP Address</label>
                <input 
                  required 
                  className={inputStyles} 
                  pattern="^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
                  title="Enter a valid IPv4 address (e.g., 192.168.1.1)"
                  value={formData.ipAddress} 
                  onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Username</label>
                <input 
                  required 
                  className={inputStyles} 
                  value={formData.username} 
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <input 
                  type="password" 
                  required 
                  className={inputStyles} 
                  value={formData.password} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input 
                type="checkbox" 
                id="active" 
                checked={formData.credentialActive} 
                onChange={(e) => setFormData({ ...formData, credentialActive: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-input"
              />
              <label htmlFor="active" className="text-sm font-medium cursor-pointer">Credential Active</label>
            </div>

            <Button type="submit" className="w-full mt-4">Create GPUs</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
