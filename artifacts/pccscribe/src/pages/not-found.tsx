import { Link } from "wouter";
import { Stethoscope } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 selection:bg-primary/20">
      <div className="text-center bg-white p-12 rounded-3xl border border-slate-200 shadow-xl shadow-black/5 max-w-md w-full mx-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-6">
          <Stethoscope className="w-8 h-8" />
        </div>
        <h1 className="text-6xl font-display font-bold text-slate-900 mb-4 tracking-tight">404</h1>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-slate-500 mb-8 leading-relaxed">
          The clinical record or page you are looking for does not exist or has been moved.
        </p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
