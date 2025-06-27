"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "../../components/ui/sheet";
import { toast } from "sonner";
import { Toaster } from "../../components/ui/sonner";
import Logo from "/assets/monotype-black.svg";
import NavLinks from "../../components/common/NavLinks";
import { PageLoader } from "./loaders";

interface User {
  name: string;
  email: string;
  image?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      loadUser: () => Promise<{ success: boolean; user?: User; error?: string }>;
    };
  }
}

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserFromFile = async () => {
      if (!window.electronAPI?.loadUser) {
        toast.error("Electron APIs not available.");
        navigate("/login");
        return;
      }

      try {
        const result = await window.electronAPI.loadUser();

        if (!result.success || !result.user) {
          throw new Error(result.error || "User not found in file");
        }

        setUser(result.user);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load user from file:", error);
        localStorage.removeItem("token");
        navigate("/login");
      }
    };

    loadUserFromFile();
  }, [navigate]);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    toast.success("Logged out successfully");
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="w-full overflow-x-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block fixed top-0 left-0 bottom-0 bg-white text-black h-screen w-[220px] lg:w-[280px] z-40 border-r border-white/10">
        <div className="flex flex-col h-full justify-between">
          <div>
            <div className="flex h-14 w-full items-center px-4 lg:h-[60px] lg:px-6 border-b border-white/10">
              <Link to="/" className="flex items-center gap-2">
                <img src={Logo} alt="Fotos Logo" className="object-contain w-[90px] h-[30px]" />
              </Link>
            </div>
            <nav className="grid items-start gap-3 px-2 mt-5 lg:px-4">
              <NavLinks />
            </nav>
          </div>
          <div>
            <div className="flex items-center gap-3 p-4 border-t border-black/10">
              <img
                src={user.image || "/default-avatar.png"}
                alt={user.name || "User"}
                className="rounded-full object-cover w-[40px] h-[40px]"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.name || "User"}</span>
                <span className="text-xs text-black/70">{user.email || "No email"}</span>
              </div>
            </div>
            <div className="flex items-center justify-center w-full flex-1">
              <Button
                className="w-11/12 mb-5 cursor-pointer mx-auto text-center rounded-[5px] bg-black text-white hover:bg-black/80"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:ml-[220px] lg:ml-[280px]">
        <header className="hidden max-md:h-14 h-0 max-md:flex items-center gap-4 bg-gray-100 px-4 max-lg:h-[60px] lg:px-6 sticky top-0 z-30">
          <Sheet>
            <SheetTrigger asChild>
              <Button className="md:hidden shrink-0" size="icon" variant="outline">
                <Menu className="size-5 text-black" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col bg-black text-white">
              <div className="flex h-14 -ml-2 w-full items-center px-4 lg:h-[60px] lg:px-6">
                <Link to="/" className="flex items-center gap-2">
                  <img src={Logo} alt="Fotos Logo" className="object-contain w-[24px] h-[24px]" />
                  <p className="text-xl font-bold text-white">Fotos</p>
                </Link>
              </div>
              <nav className="grid gap-3 flex-1">
                <NavLinks />
              </nav>
              <div className="flex items-center gap-3 p-4 border-t border-white/10">
                <img
                  src={user.image || "/default-avatar.png"}
                  alt={user.name || "User"}
                  className="rounded-full object-cover w-[40px] h-[40px]"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">{user.name || "User"}</span>
                  <span className="text-xs text-white/70">{user.email || "No email"}</span>
                </div>
              </div>
              <div className="flex items-center justify-center w-full flex-1">
                <Button
                  className="w-11/12 mb-5 cursor-pointer mx-auto text-center rounded-[5px] bg-white text-black hover:text-black hover:bg-white/80"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="min-h-screen bg-[#F5F2ED] w-full">{children}</main>
      </div>

      <Toaster richColors closeButton />
    </div>
  );
};

export default DashboardLayout;
