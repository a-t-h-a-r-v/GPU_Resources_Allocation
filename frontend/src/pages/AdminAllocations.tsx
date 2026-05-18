import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

type TabType = "All" | "Active" | "History" | "Future";

export default function AdminAllocations() {
  const [allocations, setAllocations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("Active");

  useEffect(() => {
    const fetchAllocations = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/admin/allocations`, { withCredentials: true });
        setAllocations(res.data || []);
      } catch (err) {
        console.error("Failed to fetch allocations", err);
        setAllocations([]);
      }
    };
    fetchAllocations();
  }, []);

  // Filter logic based on dates
  const filteredAllocations = allocations.filter((alloc) => {
    if (activeTab === "All") return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize time for pure date comparison
    const start = new Date(alloc.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(alloc.endDate);
    end.setHours(23, 59, 59, 999);

    if (activeTab === "Active") return today >= start && today <= end;
    if (activeTab === "History") return today > end;
    if (activeTab === "Future") return today < start;
    return true;
  });

  return (
    <div className="p-8 max-w-[90rem] mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Resource Allocations</h1>

      {/* TABS */}
      <div className="flex border-b border-border">
        {["Active", "Future", "History", "All"].map((tab) => (
          <button
            key={tab}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab as TabType)}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Student Info</th>
                  <th className="px-6 py-4 font-medium">Resource</th>
                  <th className="px-6 py-4 font-medium">Assigned Credentials</th>
                  <th className="px-6 py-4 font-medium">Duration</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredAllocations || filteredAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No allocations found in this category.
                    </td>
                  </tr>
                ) : (
                  filteredAllocations.map((alloc) => {
                    const today = new Date();
                    const end = new Date(alloc.endDate);
                    end.setHours(23, 59, 59, 999);
                    const isExpired = today > end;

                    return (
                      <tr key={alloc.allocationId} className={`transition-colors ${isExpired ? 'bg-muted/10 opacity-70' : 'hover:bg-muted/30'}`}>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-foreground">{alloc.fullName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{alloc.srn}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-mono font-medium">{alloc.resourceId}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{alloc.gpuNumber}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-x-2 text-xs">
                            <span className="text-muted-foreground">User:</span>
                            <span className="font-mono">{alloc.username || '—'}</span>
                            <span className="text-muted-foreground mt-1">Pass:</span>
                            <span className="font-mono mt-1">{alloc.password || '—'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium">{new Date(alloc.startDate).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">to {new Date(alloc.endDate).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          {isExpired ? (
                            <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full bg-gray-100 text-gray-600 border border-gray-200">History</span>
                          ) : new Date() < new Date(alloc.startDate) ? (
                            <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full bg-blue-100 text-blue-700 border border-blue-200">Upcoming</span>
                          ) : (
                            <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full bg-green-100 text-green-700 border border-green-200">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
