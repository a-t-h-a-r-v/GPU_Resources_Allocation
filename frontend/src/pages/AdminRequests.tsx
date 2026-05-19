import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const getLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split("T")[0];
};

export default function AdminRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [calendarDevice, setCalendarDevice] = useState<any | null>(null); 
  
  const [deviceId, setDeviceId] = useState("");
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [username, setUsername] = useState(""); 
  const [password, setPassword] = useState(""); 
  
  // NEW: Allocation modifier states
  const [allocatedDays, setAllocatedDays] = useState<number>(0);
  const [reductionReason, setReductionReason] = useState("");
  const [emailNote, setEmailNote] = useState("");

  // NEW: Decline modal states
  const [declineReq, setDeclineReq] = useState<any | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const fetchData = async () => {
    try {
      const [reqRes, devRes, allocRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/requests`, { withCredentials: true }),
        axios.get(`${API_BASE_URL}/admin/gpus`, { withCredentials: true }),
        axios.get(`${API_BASE_URL}/admin/allocations`, { withCredentials: true })
      ]);
      setRequests(reqRes.data || []);
      setDevices(devRes.data || []);
      setAllocations(allocRes.data || []);
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sync selected request data to allocation modifiers
  useEffect(() => {
    if (selectedReq) {
      setAllocatedDays(selectedReq.numberOfDays);
      setReductionReason("");
      setEmailNote("");
    }
  }, [selectedReq]);

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declineReq) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/requests/${declineReq.id}/decline`, 
        { reason: declineReason }, 
        { withCredentials: true }
      );
      setDeclineReq(null);
      setDeclineReason("");
      fetchData();
    } catch (err) {
      alert("Failed to decline request.");
    }
  };

  const groupedDevices = useMemo(() => {
    return devices.reduce((acc: any, dev: any) => {
      if (!acc[dev.resourceId]) acc[dev.resourceId] = [];
      acc[dev.resourceId].push(dev);
      return acc;
    }, {});
  }, [devices]);

  const { availableDevices, calculatedEndDate } = useMemo(() => {
    if (!selectedReq || !startDate || !allocatedDays) return { availableDevices: [], calculatedEndDate: "" };

    const reqStart = new Date(startDate);
    const reqEnd = new Date(startDate);
    reqEnd.setDate(reqEnd.getDate() + allocatedDays);

    const available = devices.filter((device) => {
      if (device.status === "Under Maintenance") return false;
      const hasOverlap = allocations.some((alloc) => {
        if (alloc.deviceId !== device.id) return false; 
        const allocStart = new Date(alloc.startDate);
        const allocEnd = new Date(alloc.endDate);
        return reqStart <= allocEnd && allocStart <= reqEnd;
      });
      return !hasOverlap;
    });

    return { availableDevices: available, calculatedEndDate: getLocalDateString(reqEnd) };
  }, [selectedReq, startDate, allocatedDays, devices, allocations]);

  useEffect(() => {
    if (deviceId && !availableDevices.find(d => d.id.toString() === deviceId)) {
      setDeviceId("");
    }
  }, [availableDevices, deviceId]);

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/requests/${selectedReq.id}/allocate`,
        { 
          deviceId: parseInt(deviceId), 
          startDate, 
          allocatedDays,
          reductionReason,
          emailNote,
          username, 
          password 
        },
        { withCredentials: true }
      );
      setSelectedReq(null);
      setDeviceId("");
      setUsername("");
      setPassword("");
      setStartDate(getLocalDateString(new Date()));
      fetchData();
    } catch (err) {
      alert("Failed to allocate GPU");
    }
  };

  const deviceAllocations = useMemo(() => {
    if (!calendarDevice) return [];
    return allocations
      .filter((a) => a.deviceId === calendarDevice.id)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [calendarDevice, allocations]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      
      {/* 1. REAL-TIME FLEET STATUS */}
      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Real-Time Fleet Status</h2>
          <p className="text-muted-foreground text-sm">Live overview. <strong>Click on a GPU</strong> to view its allocation schedule.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(groupedDevices).map(([resourceId, devs]: any) => (
            <Card key={resourceId} className="bg-muted/10 border-border">
              <CardContent className="p-4">
                <h3 className="font-bold text-sm mb-3 border-b pb-2">{resourceId}</h3>
                <div className="flex flex-wrap gap-2">
                  {devs.map((d: any) => (
                    <button 
                      key={d.id} 
                      onClick={() => setCalendarDevice(d)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 hover:shadow-md cursor-pointer ${
                        d.status === 'Available' ? 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200' :
                        d.status === 'Allocated' ? 'bg-red-100 border-red-300 text-red-800 hover:bg-red-200' :
                        'bg-orange-100 border-orange-300 text-orange-800 hover:bg-orange-200'
                      }`}
                      title={`Click to view schedule for ${d.gpuNumber}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        d.status === 'Available' ? 'bg-green-500' :
                        d.status === 'Allocated' ? 'bg-red-500' : 'bg-orange-500'
                      }`} />
                      {d.gpuNumber}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 2. PENDING REQUESTS SECTION */}
      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Pending Infrastructure Requests</h2>
        </div>

        {requests.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground bg-muted/20">
            No pending requests at the moment.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {requests.map((req) => (
              <Card key={req.id} className="flex flex-col shadow-md hover:shadow-lg transition-shadow border-t-4 border-t-primary">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg leading-tight">{req.fullName}</CardTitle>
                      <div className="text-sm text-muted-foreground mt-1 font-medium">
                        {req.srn} • <span className="uppercase">{req.department}</span>
                      </div>
                    </div>
                    <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold whitespace-nowrap">
                      {req.numberOfDays} Days Requested
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4 flex-grow space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="flex justify-between border-b pb-2 border-border/50">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium text-right break-all ml-4">{req.email}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2 border-border/50">
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="font-medium">{req.contactNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Applied On:</span>
                      <span className="font-medium">
                        {new Date(req.appliedOn).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
                
                <div className="p-4 pt-0 mt-auto flex gap-2">
                  <Button onClick={() => setSelectedReq(req)} className="w-2/3">Review & Allocate</Button>
                  <Button onClick={() => setDeclineReq(req)} variant="outline" className="w-1/3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">Decline</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 3. SMART ALLOCATION MODAL */}
      {selectedReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background max-h-[95vh] flex flex-col">
            <CardHeader className="border-b mb-4 shrink-0">
              <CardTitle>Allocate Resources</CardTitle>
              <p className="text-sm text-muted-foreground">
                For <strong>{selectedReq.fullName}</strong> (Requested: {selectedReq.numberOfDays} days)
              </p>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-grow">
              <form onSubmit={handleAllocate} className="space-y-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date</label>
                    <input type="date" required min={getLocalDateString(new Date())} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-600">Allocate Days</label>
                    <input type="number" required min={1} max={selectedReq.numberOfDays} className="flex h-10 w-full rounded-md border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm" value={allocatedDays} onChange={(e) => setAllocatedDays(parseInt(e.target.value) || 0)} />
                  </div>
                </div>

                {allocatedDays < selectedReq.numberOfDays && (
                  <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <label className="text-sm font-medium text-amber-800">Reason for Duration Reduction <span className="text-red-500">*</span></label>
                    <input type="text" required placeholder="e.g., High demand for GPUs right now" className="flex h-10 w-full rounded-md border border-amber-300 bg-background px-3 py-2 text-sm" value={reductionReason} onChange={(e) => setReductionReason(e.target.value)} />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium flex justify-between">
                    <span>Select Device</span>
                    <span className="text-xs font-semibold text-primary">{availableDevices.length} Available</span>
                  </label>
                  {availableDevices.length === 0 ? (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                      No GPUs are available for this specific date range.
                    </div>
                  ) : (
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                      <option value="" disabled>Select available GPU...</option>
                      {availableDevices.map((d) => (
                        <option key={d.id} value={d.id}>{d.resourceId} - {d.gpuNumber} ({d.resourceType})</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-blue-600">Assign Username</label>
                    <input type="text" required placeholder="e.g., student01" className="flex h-10 w-full rounded-md border border-input bg-blue-50/50 px-3 py-2 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-blue-600">Assign Password</label>
                    <input type="text" required placeholder="••••••••" className="flex h-10 w-full rounded-md border border-input bg-blue-50/50 px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium">Custom Email Note (Optional)</label>
                  <textarea 
                    placeholder="Add custom instructions or remarks to the approval email..." 
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                    value={emailNote} 
                    onChange={(e) => setEmailNote(e.target.value)} 
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                  <Button type="button" variant="ghost" onClick={() => setSelectedReq(null)}>Cancel</Button>
                  <Button type="submit" disabled={availableDevices.length === 0 || !deviceId}>Confirm Allocation</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 4. DECLINE REASON MODAL */}
      {declineReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-xl bg-background">
            <CardHeader className="border-b mb-4">
              <CardTitle className="text-red-600">Decline Request</CardTitle>
              <p className="text-sm text-muted-foreground">
                Declining request for <strong>{declineReq.fullName}</strong>
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDeclineSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason for Declination <span className="text-red-500">*</span></label>
                  <textarea 
                    required 
                    placeholder="Explain why the request is being declined..." 
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                    value={declineReason} 
                    onChange={(e) => setDeclineReason(e.target.value)} 
                  />
                  <p className="text-[11px] text-muted-foreground">This reason will be emailed to the student.</p>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button type="button" variant="ghost" onClick={() => setDeclineReq(null)}>Cancel</Button>
                  <Button type="submit" variant="destructive">Confirm Decline</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5. GPU CALENDAR TIMELINE MODAL */}
      {calendarDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background max-h-[80vh] flex flex-col">
            <CardHeader className="border-b pb-4 shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">Allocation Schedule</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1 font-mono">
                    {calendarDevice.resourceId} • {calendarDevice.gpuNumber}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCalendarDevice(null)} className="h-8 w-8 p-0 rounded-full">✕</Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0 flex-grow">
              {deviceAllocations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No upcoming or past allocations for this GPU.</div>
              ) : (
                <div className="divide-y">
                  {deviceAllocations.map((alloc) => {
                    const today = new Date();
                    const start = new Date(alloc.startDate);
                    const end = new Date(alloc.endDate);
                    let statusTag = "Upcoming";
                    let badgeColor = "bg-blue-100 text-blue-800 border-blue-200";
                    if (today > end) {
                      statusTag = "Completed";
                      badgeColor = "bg-gray-100 text-gray-600 border-gray-200";
                    } else if (today >= start && today <= end) {
                      statusTag = "Active Now";
                      badgeColor = "bg-green-100 text-green-800 border-green-200 animate-pulse";
                    }
                    return (
                      <div key={alloc.allocationId} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>{statusTag}</span>
                          <span className="text-xs text-muted-foreground font-medium">{start.toLocaleDateString()} — {end.toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-semibold text-sm">{alloc.fullName}</h4>
                        <p className="text-xs text-muted-foreground">{alloc.srn}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
