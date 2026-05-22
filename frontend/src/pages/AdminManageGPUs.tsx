import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function AdminManageGPUs() {
  const [devices, setDevices] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"Server" | "Workstation">("Server");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [deletingDevice, setDeletingDevice] = useState<any | null>(null);
  const [deleteAction, setDeleteAction] = useState<"remove" | "relocate">("remove");
  const [deleteReason, setDeleteReason] = useState("");
  const [relocateDeviceId, setRelocateDeviceId] = useState("");
  const [maintenanceDevice, setMaintenanceDevice] = useState<any | null>(null);
  const [maintenanceAction, setMaintenanceAction] = useState<"remove" | "relocate">("remove");
  const [maintenanceReason, setMaintenanceReason] = useState("");
  const [maintenanceRelocateId, setMaintenanceRelocateId] = useState("");

  const [isAddingGPU, setIsAddingGPU] = useState(false);
  const [newGPUDevice, setNewGPUDevice] = useState<any>({
    resourceId: "",
    gpuNumber: "",
    resourceType: "Server",
    ipAddress: "",
    username: "",
    password: "",
    credentialActive: true
  });

  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/gpus`, { withCredentials: true });
      setDevices(res.data);
    } catch (err) {
      console.error("Failed to fetch GPUs", err);
    }
  };

  const getNextAvailableGpuNumber = (resourceId: string) => {
    const gpusInResource = devices
      .filter(d => d.resourceId === resourceId)
      .map(d => parseInt(d.gpuNumber))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    let nextNum = 0;
    if (gpusInResource.length > 0 && gpusInResource[0] > 0) {
        nextNum = 1;
    }

    for (const num of gpusInResource) {
      if (num === nextNum) {
        nextNum++;
      }
    }
    return nextNum.toString();
  };

  const handleAddGPUClick = () => {
    if (!selectedResourceId) return;

    const existingDevice = devices.find(d => d.resourceId === selectedResourceId);

    setNewGPUDevice({
      resourceId: selectedResourceId,
      gpuNumber: getNextAvailableGpuNumber(selectedResourceId),
      resourceType: existingDevice?.resourceType || activeTab,
      ipAddress: existingDevice?.ipAddress || "",
      username: existingDevice?.username || "",
      password: "",
      credentialActive: true
    });
    setIsAddingGPU(true);
  };

  const handleAddGPUSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE_URL}/admin/gpus`, newGPUDevice, { withCredentials: true });
      setIsAddingGPU(false);
      fetchDevices();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to add GPU");
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const toggleStatus = async (id: number, currentStatus: string, action?: string, reason?: string, newDeviceId?: string) => {
    const newStatus = currentStatus === "Under Maintenance" ? "Available" : "Under Maintenance";
    try {
      let url = `${API_BASE_URL}/admin/gpus/${id}`;
      const params = new URLSearchParams();

      if (action) params.append("action", action);
      if (reason) params.append("reason", reason);
      if (newDeviceId) params.append("newDeviceId", newDeviceId);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      await axios.patch(url, { status: newStatus }, { withCredentials: true });

      // Clear Maintenance Modal states
      setMaintenanceDevice(null);
      setMaintenanceAction("remove");
      setMaintenanceReason("");
      setMaintenanceRelocateId("");

      fetchDevices();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to update status");
    }
  };

  const handleMaintenanceClick = (device: any) => {
    if (device.status === "Under Maintenance") {
      toggleStatus(device.id, device.status); // Safe to revert back to Available
    } else {
      if (device.status === "Allocated") {
        // Trigger the Maintenance Warning Modal
        setMaintenanceDevice(device);
      } else {
        // Safe to put available device directly under maintenance
        toggleStatus(device.id, device.status);
      }
    }
  };

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    try {
      await axios.patch(`${API_BASE_URL}/admin/gpus/${editingDevice.id}`, editingDevice, { withCredentials: true });
      setEditingDevice(null);
      fetchDevices();
    } catch (err) {
      alert("Failed to update device details");
    }
  };

  const executeDelete = async (id: number, action?: string, reason?: string, newDeviceId?: string) => {
    try {
      let url = `${API_BASE_URL}/admin/gpus/${id}`;
      const params = new URLSearchParams();
      if (action) params.append("action", action);
      if (reason) params.append("reason", reason);
      if (newDeviceId) params.append("newDeviceId", newDeviceId);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      await axios.delete(url, { withCredentials: true });

      // Reset states
      setDeletingDevice(null);
      setDeleteAction("remove");
      setDeleteReason("");
      setRelocateDeviceId("");

      fetchDevices();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete device");
    }
  };

  const handleDeleteClick = (device: any) => {
    if (device.status === "Allocated") {
      setDeletingDevice(device);
    } else {
      if (window.confirm("Are you sure you want to delete this GPU? This action cannot be undone.")) {
        executeDelete(device.id);
      }
    }
  };

  const tabDevices = devices.filter(d => d.resourceType === activeTab);
  const resourceIds = Array.from(new Set(tabDevices.map(d => d.resourceId)));
  
  useEffect(() => {
    if (resourceIds.length > 0 && !resourceIds.includes(selectedResourceId || "")) {
      setSelectedResourceId(resourceIds[0]);
    } else if (resourceIds.length === 0) {
      setSelectedResourceId(null);
    }
  }, [activeTab, devices]);

  const displayDevices = tabDevices
    .filter(d => d.resourceId === selectedResourceId)
    .sort((a, b) => Number(a.gpuNumber) - Number(b.gpuNumber));

  // Use a Set to count unique resourceIds instead of counting every individual GPU
  const serverCount = new Set(devices.filter(d => d.resourceType === "Server").map(d => d.resourceId)).size;
  const workstationCount = new Set(devices.filter(d => d.resourceType === "Workstation").map(d => d.resourceId)).size;

  const inputStyles = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

  // Simple Eye SVG Icons
  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  );
  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">GPU Cluster Assets</h1>
        <Link to="/admin/gpus/new">
          <Button>+ Register New Device</Button>
        </Link>
      </div>

      <div className="flex border-b border-border">
        <button className={`px-4 py-2 font-medium ${activeTab === "Server" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setActiveTab("Server")}>
          Servers ({serverCount})
        </button>
        <button className={`px-4 py-2 font-medium ${activeTab === "Workstation" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setActiveTab("Workstation")}>
          Workstations ({workstationCount})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4">
        <div className="col-span-1 border-r border-border pr-4 space-y-2">
          <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wider">Resource Groups</h3>
          {resourceIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources found.</p>
          ) : (
            resourceIds.map(id => (
              <button key={id} onClick={() => setSelectedResourceId(id)} className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedResourceId === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {id}
              </button>
            ))
          )}
        </div>

        <div className="col-span-3">
          {selectedResourceId && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{selectedResourceId} Details</h2>
                <Button onClick={handleAddGPUClick} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  + Add GPU to Device
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {displayDevices.map(device => (
                  <Card key={device.id} className="relative overflow-hidden shadow-sm hover:shadow-md transition-shadow border-t">
                    <div className={`h-1.5 w-full ${device.status === 'Available' ? 'bg-green-500' : device.status === 'Under Maintenance' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-lg">{device.gpuNumber}</h3>
                          <p className="text-xs text-muted-foreground font-mono">{device.ipAddress}</p>
                        </div>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${device.status === 'Available' ? 'bg-green-100 text-green-700' : device.status === 'Under Maintenance' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {device.status}
                        </span>
                      </div>
                      
                      {/* CREDENTIALS */}
                      <div className="bg-muted/40 rounded-md p-3 text-sm grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <span className="block text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Default User</span>
                          <span className="font-mono">{device.username || '—'}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Default Pass</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">
                              {device.password ? (visiblePasswords[device.id] ? device.password : '••••••••') : '—'}
                            </span>
                            {device.password && (
                              <button 
                                onClick={() => togglePasswordVisibility(device.id)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm hover:bg-muted"
                                title="Toggle Password Visibility"
                              >
                                {visiblePasswords[device.id] ? <EyeOffIcon /> : <EyeIcon />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" className="w-1/3 text-[10px]" onClick={() => handleMaintenanceClick(device)}>
                          {device.status === "Under Maintenance" ? "Make Available" : "Maintenance"}
                        </Button>
                        <Button variant="default" size="sm" className="w-1/3 text-xs" onClick={() => setEditingDevice(device)}>
                          Edit Info
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="w-1/3 text-xs bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleDeleteClick(device)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Edit Device Details</h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Resource ID</label>
                    <input className={inputStyles} value={editingDevice.resourceId} onChange={e => setEditingDevice({...editingDevice, resourceId: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">GPU Number</label>
                    <input className={inputStyles} value={editingDevice.gpuNumber} onChange={e => setEditingDevice({...editingDevice, gpuNumber: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Resource Type</label>
                    <select className={inputStyles} value={editingDevice.resourceType} onChange={e => setEditingDevice({...editingDevice, resourceType: e.target.value})}>
                      <option value="Server">Server</option>
                      <option value="Workstation">Workstation</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">IP Address</label>
                    <input className={inputStyles} value={editingDevice.ipAddress} onChange={e => setEditingDevice({...editingDevice, ipAddress: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Default Username</label>
                    <input className={inputStyles} value={editingDevice.username} onChange={e => setEditingDevice({...editingDevice, username: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">New Password (Leave blank to keep)</label>
                    <input type="password" placeholder="••••••••" className={inputStyles} onChange={e => setEditingDevice({...editingDevice, password: e.target.value})} />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="credActive" checked={editingDevice.credentialActive} onChange={e => setEditingDevice({...editingDevice, credentialActive: e.target.checked})} className="w-4 h-4" />
                  <label htmlFor="credActive" className="text-sm font-medium">Credential Active</label>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setEditingDevice(null)}>Cancel</Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* ALLOCATED DEVICE DELETION WARNING MODAL */}
      {deletingDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-red-600">Warning: GPU is Currently Allocated!</h2>
              <p className="text-sm">
                The GPU <b>{deletingDevice.resourceId} - {deletingDevice.gpuNumber}</b> is actively assigned to a user. How do you want to handle this allocation before deleting the device?
              </p>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="radio" checked={deleteAction === "remove"} onChange={() => setDeleteAction("remove")} />
                  Remove Allocation (Notify user and set request back to pending)
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="radio" checked={deleteAction === "relocate"} onChange={() => setDeleteAction("relocate")} />
                  Relocate Allocation (Move user to another available GPU)
                </label>
              </div>

              {deleteAction === "relocate" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-medium text-muted-foreground">Select Replacement GPU</label>
                  <select className={inputStyles} value={relocateDeviceId} onChange={(e) => setRelocateDeviceId(e.target.value)} required>
                    <option value="">-- Choose an Available GPU --</option>
                    {devices.filter(d => d.status === "Available").map(d => (
                      <option key={d.id} value={d.id}>{d.resourceId} - {d.gpuNumber} (IP: {d.ipAddress})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 pt-2">
                <label className="text-xs font-medium text-muted-foreground">Reason for this action (Required)</label>
                <textarea
                  className={`${inputStyles} min-h-[80px] p-2`}
                  placeholder="Explain why this GPU is being deleted/relocated..."
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setDeletingDevice(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={!deleteReason || (deleteAction === "relocate" && !relocateDeviceId)}
                  onClick={() => executeDelete(deletingDevice.id, deleteAction, deleteReason, relocateDeviceId)}
                >
                  Confirm Action & Delete
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ALLOCATED DEVICE MAINTENANCE WARNING MODAL */}
      {maintenanceDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-orange-600">Warning: GPU is Currently Allocated!</h2>
              <p className="text-sm">
                The GPU <b>{maintenanceDevice.resourceId} - {maintenanceDevice.gpuNumber}</b> is actively assigned to a user. How do you want to handle this allocation before putting the device under maintenance?
              </p>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="radio" checked={maintenanceAction === "remove"} onChange={() => setMaintenanceAction("remove")} />
                  Remove Allocation (Notify user and set request back to pending)
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="radio" checked={maintenanceAction === "relocate"} onChange={() => setMaintenanceAction("relocate")} />
                  Relocate Allocation (Move user to another available GPU)
                </label>
              </div>

              {maintenanceAction === "relocate" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-medium text-muted-foreground">Select Replacement GPU</label>
                  <select className={inputStyles} value={maintenanceRelocateId} onChange={(e) => setMaintenanceRelocateId(e.target.value)} required>
                    <option value="">-- Choose an Available GPU --</option>
                    {devices.filter(d => d.status === "Available").map(d => (
                      <option key={d.id} value={d.id}>{d.resourceId} - {d.gpuNumber} (IP: {d.ipAddress})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 pt-2">
                <label className="text-xs font-medium text-muted-foreground">Reason for Maintenance (Required)</label>
                <textarea
                  className={`${inputStyles} min-h-[80px] p-2`}
                  placeholder="Explain why this GPU is being put into maintenance..."
                  value={maintenanceReason}
                  onChange={(e) => setMaintenanceReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setMaintenanceDevice(null)}>Cancel</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  disabled={!maintenanceReason || (maintenanceAction === "relocate" && !maintenanceRelocateId)}
                  onClick={() => toggleStatus(maintenanceDevice.id, maintenanceDevice.status, maintenanceAction, maintenanceReason, maintenanceRelocateId)}
                >
                  Confirm & Put Under Maintenance
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ADD GPU MODAL */}
      {isAddingGPU && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg shadow-xl bg-background">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Add GPU to {selectedResourceId}</h2>
              <form onSubmit={handleAddGPUSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Resource ID</label>
                    <input className={`${inputStyles} bg-muted cursor-not-allowed text-muted-foreground`} value={newGPUDevice.resourceId} readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">GPU Number (Auto-suggested)</label>
                    <input
                      type="number"
                      className={inputStyles}
                      value={newGPUDevice.gpuNumber}
                      onChange={e => setNewGPUDevice({...newGPUDevice, gpuNumber: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Resource Type</label>
                    <select className={inputStyles} value={newGPUDevice.resourceType} onChange={e => setNewGPUDevice({...newGPUDevice, resourceType: e.target.value})}>
                      <option value="Server">Server</option>
                      <option value="Workstation">Workstation</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">IP Address</label>
                    <input className={inputStyles} value={newGPUDevice.ipAddress} onChange={e => setNewGPUDevice({...newGPUDevice, ipAddress: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <input className={inputStyles} value={newGPUDevice.username} onChange={e => setNewGPUDevice({...newGPUDevice, username: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <input type="password" placeholder="Required for new GPU" className={inputStyles} value={newGPUDevice.password} onChange={e => setNewGPUDevice({...newGPUDevice, password: e.target.value})} required />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="newCredActive" checked={newGPUDevice.credentialActive} onChange={e => setNewGPUDevice({...newGPUDevice, credentialActive: e.target.checked})} className="w-4 h-4" />
                  <label htmlFor="newCredActive" className="text-sm font-medium cursor-pointer">Credential Active</label>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsAddingGPU(false)}>Cancel</Button>
                  <Button type="submit">Save & Add GPU</Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
