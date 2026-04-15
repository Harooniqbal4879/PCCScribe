import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Stethoscope, UserIcon, LogOut, Settings, Bell, LayoutDashboard, Puzzle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-primary/20">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm shadow-slate-200/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group outline-none">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/30 transition-all group-hover:-translate-y-0.5 duration-300">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <span className="font-display font-bold text-2xl tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                PCCScribe
              </span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              <Link 
                href="/" 
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  location === "/" 
                    ? "bg-primary/10 text-primary" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Patients
                </div>
              </Link>
              <Link 
                href="/extension" 
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  location === "/extension" 
                    ? "bg-primary/10 text-primary" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Puzzle className="w-4 h-4" />
                  Extension
                </div>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-900">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </Button>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="flex items-center gap-3 cursor-pointer group">
              <Avatar className="h-9 w-9 border border-slate-200 shadow-sm group-hover:shadow-md transition-shadow">
                <AvatarFallback className="bg-primary/5 text-primary font-semibold">DR</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">Dr. Reynolds</p>
                <p className="text-xs text-slate-500">Attending</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {children}
      </main>
    </div>
  );
}
