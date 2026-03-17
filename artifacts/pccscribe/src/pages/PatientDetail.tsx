import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  useGetPatient, 
  useListPatientNotes, 
  useListPatientSummaries,
  useCreatePatientNotes
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { GenerateSummaryModal } from "@/components/GenerateSummaryModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  ArrowLeft, FileText, Sparkles, Calendar, Clock, 
  User, Building2, Puzzle, CheckCircle2, AlertTriangle, AlertCircle,
  Stethoscope
} from "lucide-react";
import { formatNoteType } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientNotesQueryKey } from "@workspace/api-client-react";

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const patientId = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("notes");
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId);
  const { data: notes, isLoading: notesLoading } = useListPatientNotes(patientId);
  const { data: summaries, isLoading: summariesLoading } = useListPatientSummaries(patientId);
  const ingestMutation = useCreatePatientNotes();

  const handleSimulateIngest = () => {
    ingestMutation.mutate({
      patientId,
      data: {
        source: "extension",
        notes: [
          {
            noteType: "progress_notes",
            noteDate: new Date().toISOString(),
            author: "Dr. Reynolds",
            content: "Patient is stable today. Pain managed well with current med regimen. Discussed discharge planning with family.",
            sourceUrl: "https://pcc.example.com/note/123"
          }
        ]
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientNotesQueryKey(patientId) });
        toast({ title: "Note Ingested", description: "Simulated a note arriving from the browser extension." });
      }
    });
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
          <Link href="/" className="text-primary hover:underline mt-4 inline-block">Return to list</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Patients
        </Link>
        
        <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200/60 shadow-sm shadow-black/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-lg shadow-primary/20 text-xl font-bold">
                {patient.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold text-slate-900">{patient.name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-slate-600">
                  <div className="flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400" /> {patient.age} years old</div>
                  <div className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" /> {patient.facilityName} • {patient.unit}</div>
                  <div className="flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">MRN: {patient.mrn || "N/A"}</div>
                </div>
                {patient.primaryDiagnosis && (
                  <p className="mt-3 text-sm font-medium text-slate-700 bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-lg inline-block">
                    Dx: {patient.primaryDiagnosis}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
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
        <TabsList className="bg-white border border-slate-200/60 p-1 mb-6 rounded-xl w-full sm:w-auto inline-flex h-auto">
          <TabsTrigger value="notes" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all font-medium">
            <FileText className="w-4 h-4 mr-2" /> Clinical Notes
            {notes && <Badge variant="secondary" className="ml-2 bg-white text-slate-500">{notes.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="summaries" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all font-medium">
            <Stethoscope className="w-4 h-4 mr-2" /> AI Summaries
            {summaries && <Badge variant="secondary" className="ml-2 bg-white text-slate-500">{summaries.length}</Badge>}
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
            <TabsContent value="notes" className="m-0 border-none outline-none">
              <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-display text-slate-800">Ingested Notes</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleSimulateIngest} disabled={ingestMutation.isPending} className="h-8">
                    <Puzzle className="w-3.5 h-3.5 mr-2" /> Simulate Extension POST
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {notesLoading ? (
                    <div className="p-8 text-center text-slate-500"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" /> Loading notes...</div>
                  ) : notes?.length === 0 ? (
                    <div className="p-12 text-center">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-slate-900">No notes found</h3>
                      <p className="text-slate-500 mb-4 max-w-sm mx-auto">Use the browser extension to scrape and send notes from PCC directly to this patient's profile.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notes?.map(note => (
                        <div key={note.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">
                                {formatNoteType(note.noteType)}
                              </Badge>
                              {note.sourceUrl && (
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1 px-1.5">
                                  <Puzzle className="w-3 h-3" /> Extension
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(new Date(note.noteDate), 'MMM d, yyyy h:mm a')}
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 font-medium mb-1">{note.author || "Unknown Author"}</p>
                          <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">{note.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

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
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">Generate your first AI clinical summary to instantly understand this patient's status.</p>
                    <Button onClick={() => setIsGenerateModalOpen(true)} className="bg-primary text-white hover:bg-primary/90">
                      Generate Summary
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {summaries?.map(summary => (
                    <Card key={summary.id} className="overflow-hidden border-slate-200 hover:border-primary/40 shadow-sm hover:shadow-md transition-all group">
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-2">
                            {summary.status === 'completed' ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</Badge>
                            ) : summary.status === 'generating' ? (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 animate-pulse"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> Generating</Badge>
                            ) : summary.status === 'failed' ? (
                              <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1"/> Failed</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}

                            {summary.confidence === 'high' && <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50/50">High Confidence</Badge>}
                            {summary.confidence === 'medium' && <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50/50">Med Confidence</Badge>}
                            {summary.confidence === 'low' && <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50/50">Low Confidence</Badge>}
                          </div>
                          <div className="text-xs font-medium text-slate-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(summary.createdAt), 'MMM d, yyyy')}
                          </div>
                        </div>

                        <h4 className="text-slate-900 font-medium mb-2 line-clamp-2 min-h-[2.5rem]">
                          {summary.oneLiner || "Clinical summary generation in progress or unavailable."}
                        </h4>
                        
                        <div className="flex items-center gap-4 text-sm text-slate-500 mb-5">
                          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(summary.dateFrom), 'MMM d')} - {format(new Date(summary.dateTo), 'MMM d')}
                          </div>
                          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <FileText className="w-3.5 h-3.5" />
                            {summary.notesCount} notes
                          </div>
                        </div>

                        <Link href={`/patients/${patientId}/summaries/${summary.id}`} className="block">
                          <Button variant="secondary" className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 group-hover:bg-primary group-hover:text-white transition-colors">
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
          // Optionally auto-navigate to the detail view
          // setLocation(`/patients/${patientId}/summaries/${id}`);
        }}
      />
    </Layout>
  );
}
