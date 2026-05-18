import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function AdminMaintenance() {
  const [maintenanceDevices, setMaintenanceDevices] = useState<any[]>([]);

  const fetchMaintenanceDevices = async () => {
    try {
      // Fetch all devices and filter for the ones under maintenance
      const res = await axios.get(`${API_BASE_URL}/admin/gpus`, { withCredentials: true });
      const underMaintenance = (res.data || []).filter((d: any) => d.status === "Under Maintenance");
      setMaintenanceDevices(underMaintenance);
    } catch (err) {
      console.error("Failed to fetch devices", err);
    }
  };

  useEffect(() => {
    fetchMaintenanceDevices();
  }, []);

  const handleReturnToNormal = async (id: number) => {
    try {
      // Use the existing PATCH endpoint to revert the status back to "Available"
      await axios.patch(`${API_BASE_URL}/admin/gpus/${id}`, { status: "Available" }, { withCredentials: true });
      // Refetch the data to update the UI
      fetchMaintenanceDevices();
    } catch (err) {
      alert("Failed to update status");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">System & Node Maintenance</h1>
      <p className="text-muted-foreground">Manage devices that are currently offline for maintenance.</p>

      {maintenanceDevices.length === 0 ? (
        <div className="text-center p-8 border border-dashed rounded-lg mt-8 text-muted-foreground bg-muted/20">
          No devices are currently under maintenance. All systems are nominal.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
          {maintenanceDevices.map((device) => (
            <Card key={device.id} className="relative overflow-hidden border-orange-200">
              {/* Top accent bar indicating maintenance state */}
              <div className="h-1.5 w-full bg-orange-500" />
              
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl">{device.resourceId}</CardTitle>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                    Under Maintenance
                  </span>
                </div>
                <div className="text-sm font-mono text-muted-foreground">GPU: {device.gpuNumber}</div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="text-sm grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                  <div>
                    <span className="text-muted-foreground block text-xs">Type</span>
                    <span className="font-medium">{device.resourceType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">IP Address</span>
                    <span className="font-medium">{device.ipAddress}</span>
                  </div>
                </div>
                
                <Button 
                  onClick={() => handleReturnToNormal(device.id)} 
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  Return to Normal Operations
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
