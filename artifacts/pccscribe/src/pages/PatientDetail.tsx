import { useState } from "react";
import { useRoute, Link } from "wouter";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetPatient,
  useListPatientNotes,
  useListPatientSummaries,
  useCreatePatientNotes,
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { GenerateSummaryModal } from "@/components/GenerateSummaryModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, FileText, Sparkles, Calendar, Clock,
  User, Building2, Puzzle, CheckCircle2, AlertCircle,
  Stethoscope, Heart, Phone, Utensils, ClipboardList,
  Activity, ShieldAlert, Info, UserRound, Hash, Loader2,
} from "lucide-react";
import { formatNoteType } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientNotesQueryKey } from "@workspace/api-client-react";

// ── Vitals helpers ────────────────────────────────────────────────────────────
interface Vital { label: string; value: string; unit?: string; timestamp?: string }

function parseVitals(raw: string | null | undefined): Vital[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Vital[];
    return [];
  } catch {
    return [];
  }
}

// ── Small display helpers ─────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-sm text-slate-800 font-medium leading-snug">{value}</p>
      </div>
    </div>
  );
}

function CodeStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s.includes("DNR") || s.includes("COMFORT") || s.includes("DNI")) {
    return <Badge className="bg-red-50 text-red-700 border-red-200 font-semibold text-sm px-3 py-1">{status}</Badge>;
  }
  if (s.includes("FULL")) {
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-sm px-3 py-1">{status}</Badge>;
  }
  return <Badge variant="outline" className="font-semibold text-sm px-3 py-1">{status}</Badge>;
}

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const patientId = parseInt(params?.id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("profile");
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId);
  const { data: notes, isLoading: notesLoading } = useListPatientNotes(patientId);
  const { data: summaries, isLoading: summariesLoading } = useListPatientSummaries(patientId);
  const ingestMutation = useCreatePatientNotes();

  const handleSimulateIngest = () => {
    ingestMutation.mutate(
      {
        patientId,
        data: {
          source: "extension",
          notes: [
            {
              noteType: "progress_notes",
              noteDate: new Date().toISOString(),
              author: "Dr. Reynolds",
              content:
                "Patient is stable today. Pain managed well with current med regimen. Discussed discharge planning with family.",
              sourceUrl: "https://pcc.example.com/note/123",
            },
          ],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPatientNotesQueryKey(patientId) });
          toast({ title: "Note Ingested", description: "Simulated a note arriving from the browser extension." });
        },
      }
    );
  };

  if (patientLoading) {
    return (
      <Layout>
        <div className="h-32 rounded-2xl bg-slate-100 animate-pulse mb-8" />
        <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
      </Layout>
    );
  }

  if (!patient) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-slate-900">Patient Not Found</h2>
          <Link href="/" className="text-primary hover:underline mt-4 inline-block">
            Return to list
          </Link>
        </div>
      </Layout>
    );
  }

  const vitals = parseVitals((patient as any).currentVitals);
  const p = patient as any;

  return (
    <Layout>
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Patients
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200/60 shadow-sm shadow-black/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-lg shadow-primary/20 text-xl font-bold shrink-0">
                {patient.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <div className="flex items-center flex-wrap gap-2 mb-1">
                  <h1 className="text-3xl font-display font-bold text-slate-900">{patient.name}</h1>
                  {p.nickname && (
                    <span className="text-slate-400 text-lg font-normal">"{p.nickname}"</span>
                  )}
                  {p.codeStatus && <CodeStatusBadge status={p.codeStatus} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" /> {patient.age} yrs
                    {p.gender && <span className="text-slate-400">· {p.gender}</span>}
                    {p.dateOfBirth && (
                      <span className="text-slate-400">
                        · DOB {(() => { try { return format(parseISO(p.dateOfBirth), "MMM d, yyyy"); } catch { return p.dateOfBirth; } })()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-slate-400" /> {patient.facilityName} · {patient.unit}
                  </div>
                  {patient.mrn && (
                    <div className="flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      MRN: {patient.mrn}
                    </div>
                  )}
                  {p.physician && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Stethoscope className="w-4 h-4 text-slate-400" /> Dr. {p.physician}
                    </div>
                  )}
                </div>
                {patient.primaryDiagnosis && (
                  <p className="mt-3 text-sm font-medium text-slate-700 bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-lg inline-block">
                    Dx: {patient.primaryDiagnosis}
                  </p>
                )}
                {/* Allergies alert strip */}
                {p.allergies && (
                  <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm font-semibold text-red-700">Allergies:</span>
                    <span className="text-sm text-red-600">{p.allergies}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button
                onClick={() => setIsGenerateModalOpen(true)}
                className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              >
                <Sparkles className="w-4 h-4 mr-2" /> Generate Summary
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-slate-200/60 p-1 mb-6 rounded-xl inline-flex h-auto">
          <TabsTrigger
            value="profile"
            className="rounded-lg px-5 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all font-medium"
          >
            <ClipboardList className="w-4 h-4 mr-2" /> Clinical Profile
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-lg px-5 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all font-medium"
          >
            <FileText className="w-4 h-4 mr-2" /> Clinical Notes
            {notes && (
              <Badge variant="secondary" className="ml-2 bg-white text-slate-500">
                {notes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="summaries"
            className="rounded-lg px-5 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all font-medium"
          >
            <Stethoscope className="w-4 h-4 mr-2" /> AI Summaries
            {summaries && (
              <Badge variant="secondary" className="ml-2 bg-white text-slate-500">
                {summaries.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── CLINICAL PROFILE TAB ─────────────────────────────────────── */}
            <TabsContent value="profile" className="m-0 border-none outline-none">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Left column — Demographics & Clinical */}
                <div className="lg:col-span-2 space-y-5">

                  {/* Vitals card */}
                  {vitals.length > 0 && (
                    <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                      <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                        <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" /> Latest Vitals
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {vitals.map((v, i) => (
                            <div
                              key={i}
                              className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center"
                            >
                              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                                {v.label}
                              </p>
                              <p className="text-lg font-bold text-slate-900">
                                {v.value}
                                {v.unit && (
                                  <span className="text-xs font-normal text-slate-400 ml-1">{v.unit}</span>
                                )}
                              </p>
                              {v.timestamp && (
                                <p className="text-xs text-slate-400 mt-1 truncate">{v.timestamp}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Clinical details card */}
                  <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                      <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                        <Heart className="w-4 h-4 text-rose-500" /> Clinical Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 py-1">
                      {/* Code status shown prominently */}
                      {p.codeStatus && (
                        <div className="py-3 border-b border-slate-100">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Code Status</p>
                          <CodeStatusBadge status={p.codeStatus} />
                        </div>
                      )}
                      <InfoRow icon={<ShieldAlert className="w-4 h-4" />} label="Allergies" value={p.allergies} />
                      <InfoRow icon={<Utensils className="w-4 h-4" />} label="Diet" value={p.diet} />
                      <InfoRow icon={<Info className="w-4 h-4" />} label="Special Instructions" value={p.specialInstructions} />
                      <InfoRow icon={<Stethoscope className="w-4 h-4" />} label="Attending Physician" value={p.physician ? `Dr. ${p.physician}` : null} />
                      {!p.codeStatus && !p.allergies && !p.diet && !p.specialInstructions && !p.physician && (
                        <div className="py-8 text-center text-slate-400">
                          <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No clinical details synced yet.</p>
                          <p className="text-xs mt-1">Open the patient's PCC chart and the extension will auto-populate this section.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Notes / Orders from PCC */}
                  {(patient.primaryDiagnosis || p.admissionDate || p.initialAdmissionDate) && (
                    <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                      <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                        <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-blue-500" /> Admission Info
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-5 py-1">
                        <InfoRow icon={<ClipboardList className="w-4 h-4" />} label="Primary Diagnosis" value={patient.primaryDiagnosis} />
                        <InfoRow icon={<Calendar className="w-4 h-4" />} label="Admission Status" value={p.admissionStatus} />
                        <InfoRow
                          icon={<Calendar className="w-4 h-4" />}
                          label="Current Admission Date"
                          value={p.admissionDate ? (() => { try { return format(parseISO(p.admissionDate), "MMMM d, yyyy"); } catch { return p.admissionDate; } })() : null}
                        />
                        <InfoRow
                          icon={<Calendar className="w-4 h-4" />}
                          label="Initial Admission Date"
                          value={p.initialAdmissionDate ? (() => { try { return format(parseISO(p.initialAdmissionDate), "MMMM d, yyyy"); } catch { return p.initialAdmissionDate; } })() : null}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right column — Patient identifiers + emergency contact */}
                <div className="space-y-5">

                  {/* Demographics */}
                  <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                      <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-violet-500" /> Demographics
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 py-1">
                      <InfoRow icon={<User className="w-4 h-4" />} label="Known As" value={p.nickname} />
                      <InfoRow icon={<User className="w-4 h-4" />} label="Gender" value={p.gender} />
                      <InfoRow
                        icon={<Calendar className="w-4 h-4" />}
                        label="Date of Birth"
                        value={p.dateOfBirth ? (() => { try { return format(parseISO(p.dateOfBirth), "MMMM d, yyyy"); } catch { return p.dateOfBirth; } })() : null}
                      />
                      {!p.nickname && !p.gender && !p.dateOfBirth && (
                        <div className="py-6 text-center text-slate-400 text-sm">
                          No demographics synced yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Emergency Contact */}
                  {p.emergencyContact && (
                    <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                      <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                        <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-green-500" /> Emergency Contact
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-800 font-medium">{p.emergencyContact}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* System Identifiers */}
                  <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                      <CardTitle className="text-base font-display text-slate-800 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-slate-400" /> System IDs
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 py-1">
                      <InfoRow icon={<Hash className="w-4 h-4" />} label="MRN / Chart ID" value={patient.mrn} />
                      <InfoRow icon={<Hash className="w-4 h-4" />} label="PCC Internal ID" value={p.pccInternalId} />
                      <InfoRow icon={<Hash className="w-4 h-4" />} label="Enterprise ID" value={p.enterpriseId} />
                      {!patient.mrn && !p.pccInternalId && !p.enterpriseId && (
                        <div className="py-6 text-center text-slate-400 text-sm">No IDs on file.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* ── CLINICAL NOTES TAB ───────────────────────────────────────── */}
            <TabsContent value="notes" className="m-0 border-none outline-none">
              <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-display text-slate-800">Ingested Notes</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSimulateIngest}
                    disabled={ingestMutation.isPending}
                    className="h-8"
                  >
                    <Puzzle className="w-3.5 h-3.5 mr-2" /> Simulate Extension POST
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {notesLoading ? (
                    <div className="p-8 text-center text-slate-500">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                      Loading notes...
                    </div>
                  ) : notes?.length === 0 ? (
                    <div className="p-12 text-center">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-slate-900">No notes found</h3>
                      <p className="text-slate-500 mb-4 max-w-sm mx-auto">
                        Use the browser extension to scrape and send notes from PCC directly to this patient's profile.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notes?.map((note) => (
                        <div key={note.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center flex-wrap gap-2">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">
                                {(note as any).noteTypePcc || formatNoteType(note.noteType)}
                              </Badge>
                              {note.sourceUrl && (
                                <a
                                  href={note.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open source page in PCC"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800 transition-colors"
                                >
                                  <Puzzle className="w-3 h-3" /> View in PCC
                                </a>
                              )}
                              {(note as any).printUrl && (
                                <a
                                  href={(note as any).printUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open full note document in PCC"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Full note
                                </a>
                              )}
                            </div>
                            <div className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(new Date(note.noteDate), "MMM d, yyyy h:mm a")}
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 font-medium mb-1">
                            {note.author || "Unknown Author"}
                          </p>
                          <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                            {note.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── AI SUMMARIES TAB ─────────────────────────────────────────── */}
            <TabsContent value="summaries" className="m-0 border-none outline-none">
              {summariesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-40 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
                  <div className="h-40 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
                </div>
              ) : summaries?.length === 0 ? (
                <Card className="border-slate-200/60 border-dashed shadow-sm">
                  <div className="p-12 text-center">
                    <Sparkles className="w-12 h-12 text-primary/40 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No summaries yet</h3>
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                      Generate your first AI clinical summary to instantly understand this patient's status.
                    </p>
                    <Button
                      onClick={() => setIsGenerateModalOpen(true)}
                      className="bg-primary text-white hover:bg-primary/90"
                    >
                      Generate Summary
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {summaries?.map((summary) => (
                    <Card
                      key={summary.id}
                      className="overflow-hidden border-slate-200 hover:border-primary/40 shadow-sm hover:shadow-md transition-all group"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-2">
                            {summary.status === "completed" ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                              </Badge>
                            ) : summary.status === "generating" ? (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 animate-pulse">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating
                              </Badge>
                            ) : summary.status === "failed" ? (
                              <Badge variant="destructive">
                                <AlertCircle className="w-3 h-3 mr-1" /> Failed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                            {summary.confidence === "high" && (
                              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50/50">
                                High Confidence
                              </Badge>
                            )}
                            {summary.confidence === "medium" && (
                              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50/50">
                                Med Confidence
                              </Badge>
                            )}
                            {summary.confidence === "low" && (
                              <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50/50">
                                Low Confidence
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs font-medium text-slate-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(summary.createdAt), "MMM d, yyyy")}
                          </div>
                        </div>

                        <h4 className="text-slate-900 font-medium mb-2 line-clamp-2 min-h-[2.5rem]">
                          {summary.oneLiner || "Clinical summary generation in progress or unavailable."}
                        </h4>

                        <div className="flex items-center gap-4 text-sm text-slate-500 mb-5">
                          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(summary.dateFrom), "MMM d")} –{" "}
                            {format(new Date(summary.dateTo), "MMM d")}
                          </div>
                          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <FileText className="w-3.5 h-3.5" />
                            {summary.notesCount} notes
                          </div>
                        </div>

                        <Link href={`/patients/${patientId}/summaries/${summary.id}`} className="block">
                          <Button
                            variant="secondary"
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 group-hover:bg-primary group-hover:text-white transition-colors"
                          >
                            View Full Summary
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>

      <GenerateSummaryModal
        patientId={patientId}
        open={isGenerateModalOpen}
        onOpenChange={setIsGenerateModalOpen}
        onSuccessNavigate={(id) => {
          setActiveTab("summaries");
        }}
      />
    </Layout>
  );
}
