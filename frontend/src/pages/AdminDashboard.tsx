import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reqRes, allocRes, devRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/admin/requests`, { withCredentials: true }),
          axios.get(`${API_BASE_URL}/admin/allocations`, { withCredentials: true }),
          axios.get(`${API_BASE_URL}/admin/gpus`, { withCredentials: true })
        ]);
        setRequests(reqRes.data || []);
        setAllocations(allocRes.data || []);
        setDevices(devRes.data || []);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      }
    };
    fetchData();
  }, []);

  // Calculate Dashboard Metrics
  const activeUsers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allocations.filter((alloc) => {
      const start = new Date(alloc.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(alloc.endDate);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    }).length;
  }, [allocations]);

  const resourceGroups = useMemo(() => {
    return devices.reduce((acc: any, dev: any) => {
      if (!acc[dev.resourceId]) {
        acc[dev.resourceId] = { total: 0, allocated: 0, available: 0 };
      }
      acc[dev.resourceId].total++;
      if (dev.status === "Allocated") acc[dev.resourceId].allocated++;
      if (dev.status === "Available") acc[dev.resourceId].available++;
      return acc;
    }, {});
  }, [devices]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Central Computing Facility control center.</p>
      </div>

      {/* 1. TOP SUMMARY CARDS */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Requests Card */}
        <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-between space-y-4">
            <div className="text-4xl font-bold">{requests.length}</div>
            <Link to="/admin/requests" className="w-full mt-auto">
              <Button variant="outline" className="w-full text-primary border-primary/20 hover:bg-primary/5">
                View Requests →
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Active Users Card */}
        <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Users</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-between space-y-4">
            <div className="text-4xl font-bold">{activeUsers}</div>
            <Link to="/admin/allocation" className="w-full mt-auto">
              <Button variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50">
                View Allocations →
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Manage GPUs Card */}
        <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total GPU Assets</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-between space-y-4">
            <div className="text-4xl font-bold">{devices.length}</div>
            <Link to="/admin/gpus" className="w-full mt-auto">
              <Button variant="outline" className="w-full text-green-600 border-green-200 hover:bg-green-50">
                Manage Devices →
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 2. RESOURCE ID ALLOCATION CARDS */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Resource Allocation Status</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(resourceGroups).map(([id, stats]: any) => {
            const percentAllocated = stats.total > 0 ? Math.round((stats.allocated / stats.total) * 100) : 0;
            
            // Determine ring color based on allocation
            const ringColor = percentAllocated === 100 ? "border-red-500 text-red-600" 
              : percentAllocated > 50 ? "border-orange-500 text-orange-600" 
              : "border-green-500 text-green-600";

            return (
              <Card key={id} className="overflow-hidden">
                <CardContent className="p-6 flex items-center gap-5">
                  <div className={`w-16 h-16 shrink-0 rounded-full border-[5px] flex items-center justify-center font-bold text-lg ${ringColor}`}>
                    {percentAllocated}%
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">{id}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong className="text-foreground">{stats.allocated}</strong> Allocated • <strong className="text-foreground">{stats.available}</strong> Available
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Nodes: {stats.total}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
