import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Network,
  Cpu,
  Edit,
  Wrench,
  LogOut
} from "lucide-react";
import kleLogo from "@/assets/kle-logo.png";

interface NavbarProps {
  isAdminLoggedIn?: boolean;
  onLogout?: () => void;
}

export default function Navbar({ isAdminLoggedIn = false, onLogout }: NavbarProps) {
  const adminNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
    { name: "Requests", icon: ClipboardList, path: "/admin/requests" },
    { name: "Active Resources Allocation", icon: Network, path: "/admin/allocation" },
    { name: "GPU Management", icon: Cpu, path: "/admin/gpus" },
    { name: "Create New GPU", icon: Edit, path: "/admin/gpus/new" },
    { name: "Maintenance", icon: Wrench, path: "/admin/maintenance" },
  ];

  return (
    <nav className="relative border-b bg-slate-950 px-6 flex items-center justify-between sticky top-0 z-50 shadow-md min-h-[72px]">
      
      {/* ================= LEFT ZONE ================= */}
      <div className="flex-1 flex items-center justify-start">
        {/* The Logo ALWAYS stays on the left side, regardless of login state */}
        <img
          src={kleLogo}
          alt="KLE Tech Logo"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* ================= CENTER ZONE ================= */}
      <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center whitespace-nowrap">
        
        {/* STATE 1: Nobody is logged in -> Show Text in Center */}
        {!isAdminLoggedIn ? (
          <div className="flex flex-col items-center uppercase tracking-wide">
            <span className="text-xl font-bold text-slate-100 leading-tight">
              Central Computing Facility
            </span>
            <span className="text-sm font-medium text-slate-400">
              KLE Technological University
            </span>
          </div>
        ) : (
          /* STATE 2: Admin is logged in -> Replace Text with Icons */
          <div className="flex items-center space-x-6">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className="flex flex-col items-center text-slate-400 hover:text-blue-400 transition-colors group"
                  title={item.name}
                >
                  <div className="p-2 rounded-md group-hover:bg-slate-900">
                    <Icon className="w-5 h-5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= RIGHT ZONE ================= */}
      <div className="flex-1 flex items-center justify-end">
        {isAdminLoggedIn && (
          <button 
            onClick={onLogout}
            className="flex items-center space-x-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors bg-slate-900/50 hover:bg-slate-900 px-4 py-2 rounded-md border border-slate-800"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        )}
      </div>

    </nav>
  );
}
