import { useState } from "react";
import { Link } from "wouter";
import { useListPatients } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { CreatePatientModal } from "@/components/CreatePatientModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText, Plus, Search, Building2, Calendar,
  User, Activity, LayoutGrid, List, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

type ViewMode = "grid" | "list";

export default function Home() {
  const { data: patients, isLoading, error } = useListPatients();
  const [search, setSearch] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const filteredPatients = patients?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.facilityName.toLowerCase().includes(search.toLowerCase()) ||
    p.mrn?.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Patients</h1>
          <p className="text-slate-500 mt-1">Manage patients and generate clinical summaries.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-64 bg-white border-slate-200/80 shadow-sm focus-visible:ring-primary/20"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={`p-2 transition-colors ${
                viewMode === "grid"
                  ? "bg-primary text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              aria-label="List view"
              className={`p-2 transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Patient
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={viewMode === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          : "flex flex-col gap-3"
        }>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div
              key={i}
              className={`rounded-xl bg-slate-100 animate-pulse border border-slate-200/60 ${
                viewMode === "grid" ? "h-48" : "h-20"
              }`}
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Activity className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">Failed to load patients</h3>
          <p className="text-slate-500">Please try refreshing the page.</p>
        </div>
      ) : filteredPatients?.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-display font-semibold text-slate-900 mb-2">No patients found</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            Get started by adding your first patient to generate clinical summaries from their notes.
          </p>
          <Button onClick={() => setIsCreateModalOpen(true)} variant="outline" className="border-slate-200">
            <Plus className="w-4 h-4 mr-2" /> Add Patient
          </Button>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {viewMode === "grid" ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredPatients?.map((patient, idx) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.25 }}
                >
                  <Card className="group overflow-hidden border-slate-200/60 hover:border-primary/30 shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                    <CardContent className="p-0">
                      <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-display font-bold text-slate-900 group-hover:text-primary transition-colors">
                              {patient.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                              <span className="font-medium text-slate-600">{patient.age} yrs</span>
                              <span>•</span>
                              <span>{patient.mrn || "No MRN"}</span>
                            </div>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {initials(patient.name)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate">{patient.facilityName} - {patient.unit}</span>
                          </div>
                          {patient.admissionDate && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                              <span>Admitted: {format(new Date(patient.admissionDate), "MMM d, yyyy")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="px-5 py-3 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <FileText className="w-3.5 h-3.5" />
                          View Records
                        </div>
                        <Link
                          href={`/patients/${patient.id}`}
                          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors py-1 px-3 rounded-md hover:bg-primary/5"
                        >
                          Open Patient →
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-2"
            >
              {filteredPatients?.map((patient, idx) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.2 }}
                >
                  <Link href={`/patients/${patient.id}`}>
                    <div className="group flex items-center gap-4 bg-white border border-slate-200/60 hover:border-primary/30 rounded-xl px-5 py-4 shadow-sm hover:shadow-md hover:shadow-primary/5 transition-all duration-200 cursor-pointer">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {initials(patient.name)}
                      </div>

                      {/* Name + MRN */}
                      <div className="min-w-0 w-48 shrink-0">
                        <p className="font-semibold text-slate-900 group-hover:text-primary transition-colors truncate">
                          {patient.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {patient.age} yrs · {patient.mrn || "No MRN"}
                        </p>
                      </div>

                      {/* Facility */}
                      <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0 flex-1">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{patient.facilityName} — {patient.unit}</span>
                      </div>

                      {/* Admission */}
                      {patient.admissionDate ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{format(new Date(patient.admissionDate), "MMM d, yyyy")}</span>
                        </div>
                      ) : (
                        <div className="shrink-0 w-36" />
                      )}

                      {/* Arrow */}
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors shrink-0 ml-auto" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <CreatePatientModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </Layout>
  );
}
