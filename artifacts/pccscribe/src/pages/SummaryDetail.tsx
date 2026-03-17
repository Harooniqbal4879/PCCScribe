import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { 
  useGetSummary, 
  useGetPatient 
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  ArrowLeft, Brain, Calendar, FileText, Activity, 
  AlertTriangle, CheckCircle2, ShieldCheck, Stethoscope, 
  User, Loader2
} from "lucide-react";
import { formatNoteType, cn } from "@/lib/utils";

export default function SummaryDetail() {
  const [, params] = useRoute("/patients/:patientId/summaries/:summaryId");
  const patientId = parseInt(params?.patientId || "0");
  const summaryId = parseInt(params?.summaryId || "0");

  const { data: patient } = useGetPatient(patientId);
  const { data: summary, isLoading } = useGetSummary(patientId, summaryId, {
    query: { refetchInterval: (query) => query.state.data?.status === 'generating' ? 3000 : false }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-slate-200 rounded-md" />
          <div className="h-40 bg-slate-100 rounded-2xl" />
          <div className="grid grid-cols-2 gap-6">
            <div className="h-96 bg-slate-100 rounded-2xl" />
            <div className="h-96 bg-slate-100 rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!summary) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-slate-900">Summary Not Found</h2>
          <Link href={`/patients/${patientId}`} className="text-primary hover:underline mt-4 inline-block">Return to patient</Link>
        </div>
      </Layout>
    );
  }

  const isGenerating = summary.status === 'generating';

  return (
    <Layout>
      <div className="mb-8">
        <Link href={`/patients/${patientId}`} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Patient Profile
        </Link>

        {/* Top Header Card */}
        <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-50/50 to-primary/5 rounded-bl-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                  <Brain className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-display font-bold text-slate-900">AI Clinical Summary</h1>
              </div>
              
              <div className="flex items-center gap-3 text-sm text-slate-600 mb-6 font-medium">
                {patient && <span className="flex items-center gap-1.5"><User className="w-4 h-4"/> {patient.name}</span>}
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4"/> {format(new Date(summary.dateFrom), 'MMM d, yyyy')} - {format(new Date(summary.dateTo), 'MMM d, yyyy')}</span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5"><FileText className="w-4 h-4"/> {summary.notesCount} Notes Analyzed</span>
              </div>

              {summary.oneLiner && !isGenerating && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-100/50 shadow-sm">
                  <h3 className="text-lg font-medium text-slate-900 leading-snug">
                    <span className="text-primary font-bold mr-2">Snapshot:</span>
                    {summary.oneLiner}
                  </h3>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-3 shrink-0">
              {summary.status === 'completed' && summary.confidence && (
                <div className={cn(
                  "px-4 py-2 rounded-lg border flex items-center gap-2 font-medium shadow-sm",
                  summary.confidence === 'high' ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                  summary.confidence === 'medium' ? "bg-amber-50 border-amber-200 text-amber-800" :
                  "bg-red-50 border-red-200 text-red-800"
                )}>
                  {summary.confidence === 'high' ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  {summary.confidence.charAt(0).toUpperCase() + summary.confidence.slice(1)} Confidence
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isGenerating ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200 shadow-sm text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <Brain className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
          </div>
          <h3 className="text-xl font-display font-semibold text-slate-900 mb-2">Analyzing Clinical Notes</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Our AI is reading through {summary.notesCount} notes to build a comprehensive SOAP summary and identify key clinical events.
          </p>
        </div>
      ) : summary.status === 'failed' ? (
        <div className="bg-red-50 text-red-800 p-8 rounded-2xl border border-red-200 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Generation Failed</h3>
          <p className="opacity-80">{summary.errorMessage || "An unknown error occurred while analyzing the notes."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column: SOAP & Timeline */}
          <div className="lg:col-span-2 space-y-8">
            {/* SOAP Summary Accordions */}
            {summary.soapSummary && (
              <section>
                <h2 className="text-xl font-display font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-primary" /> SOAP Summary
                </h2>
                <Accordion type="multiple" defaultValue={["subjective", "objective", "assessment", "plan"]} className="w-full space-y-4">
                  {/* Subjective */}
                  <AccordionItem value="subjective" className="bg-white border border-slate-200 rounded-xl px-2 shadow-sm overflow-hidden data-[state=open]:border-primary/30 transition-colors">
                    <AccordionTrigger className="hover:no-underline px-4 py-4 font-semibold text-lg text-slate-800">
                      Subjective
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-5 pt-0">
                      <div className="prose prose-slate max-w-none text-slate-600 mb-4">
                        {summary.soapSummary.subjective.narrative}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Reported Symptoms</span>
                          <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 ml-2">
                            {summary.soapSummary.subjective.patientReportedSymptoms.length > 0 ? 
                              summary.soapSummary.subjective.patientReportedSymptoms.map((s,i)=><li key={i}>{s}</li>) :
                              <li>None reported</li>
                            }
                          </ul>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col justify-center">
                           <div className="flex items-center justify-between mb-2">
                             <span className="text-sm font-medium text-slate-600">Pain Reported:</span>
                             <Badge variant={summary.soapSummary.subjective.painReported ? "destructive" : "secondary"}>
                               {summary.soapSummary.subjective.painReported ? "Yes" : "No"}
                             </Badge>
                           </div>
                           {summary.soapSummary.subjective.painScaleReported && (
                             <div className="flex items-center justify-between text-sm">
                               <span className="font-medium text-slate-600">Scale:</span>
                               <span className="text-slate-900 font-semibold">{summary.soapSummary.subjective.painScaleReported}</span>
                             </div>
                           )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Objective */}
                  <AccordionItem value="objective" className="bg-white border border-slate-200 rounded-xl px-2 shadow-sm overflow-hidden data-[state=open]:border-primary/30 transition-colors">
                    <AccordionTrigger className="hover:no-underline px-4 py-4 font-semibold text-lg text-slate-800">
                      Objective
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-5 pt-0">
                      <div className="prose prose-slate max-w-none text-slate-600 mb-4">
                        {summary.soapSummary.objective.narrative}
                      </div>
                      {summary.soapSummary.objective.keyFindings.length > 0 && (
                        <div className="mt-4 border border-slate-100 rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Key Finding</th>
                                <th className="px-4 py-3 font-semibold">Source</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {summary.soapSummary.objective.keyFindings.map((finding, idx) => (
                                <tr key={idx} className="bg-white hover:bg-slate-50/50">
                                  <td className="px-4 py-3 text-slate-800">{finding.finding}</td>
                                  <td className="px-4 py-3 text-slate-500">{formatNoteType(finding.source)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Assessment */}
                  <AccordionItem value="assessment" className="bg-white border border-slate-200 rounded-xl px-2 shadow-sm overflow-hidden data-[state=open]:border-primary/30 transition-colors">
                    <AccordionTrigger className="hover:no-underline px-4 py-4 font-semibold text-lg text-slate-800">
                      Assessment
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-5 pt-0">
                      <div className="prose prose-slate max-w-none text-slate-600 mb-5">
                        {summary.soapSummary.assessment.narrative}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {summary.soapSummary.assessment.activeDiagnoses.map((dx, i) => (
                          <Badge key={i} variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-700 px-2.5 py-1">
                            {dx}
                          </Badge>
                        ))}
                      </div>
                      {summary.soapSummary.assessment.riskFlags.length > 0 && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> Risk Flags
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-sm text-amber-900 ml-1">
                            {summary.soapSummary.assessment.riskFlags.map((flag, i) => (
                              <li key={i}>{flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Plan */}
                  <AccordionItem value="plan" className="bg-white border border-slate-200 rounded-xl px-2 shadow-sm overflow-hidden data-[state=open]:border-primary/30 transition-colors">
                    <AccordionTrigger className="hover:no-underline px-4 py-4 font-semibold text-lg text-slate-800">
                      Plan
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-5 pt-0">
                      <div className="prose prose-slate max-w-none text-slate-600 mb-5">
                        {summary.soapSummary.plan.narrative}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                          <span className="text-sm font-semibold text-blue-900 block mb-2">Active Orders</span>
                          <ul className="space-y-2 text-sm text-blue-800">
                            {summary.soapSummary.plan.activeOrders.map((order, i) => (
                              <li key={i} className="flex gap-2">
                                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" /> 
                                <span>{order}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100">
                          <span className="text-sm font-semibold text-emerald-900 block mb-2">Follow Up Items</span>
                          <ul className="space-y-2 text-sm text-emerald-800">
                            {summary.soapSummary.plan.followUpItems.map((item, i) => (
                              <li key={i} className="flex gap-2">
                                <Activity className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> 
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                </Accordion>
              </section>
            )}

            {/* Timeline */}
            {summary.keyClinicalEvents && summary.keyClinicalEvents.length > 0 && (
              <section className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm">
                <h2 className="text-xl font-display font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Key Clinical Events
                </h2>
                <div className="relative border-l-2 border-slate-100 ml-4 space-y-8">
                  {summary.keyClinicalEvents.map((event, idx) => (
                    <div key={idx} className="relative pl-6">
                      <div className={cn(
                        "absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white",
                        event.significance === 'high' ? "bg-red-500" :
                        event.significance === 'medium' ? "bg-amber-400" : "bg-blue-400"
                      )} />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-900">{format(new Date(event.date), 'MMM d, h:mm a')}</span>
                        <Badge variant="outline" className="w-fit text-[10px] uppercase font-bold tracking-wider px-1.5 h-5">
                          {event.significance} Priority
                        </Badge>
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed">{event.event}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Per Note Type & Gaps */}
          <div className="space-y-6">
            
            {/* Gaps Banner */}
            {summary.documentationGaps && summary.documentationGaps.length > 0 && (
              <Card className="bg-amber-50 border-amber-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-amber-100/50">
                  <CardTitle className="text-amber-800 text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Documentation Gaps
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-3">
                    {summary.documentationGaps.map((gap, i) => (
                      <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        {gap}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Per Note Type Summaries */}
            {summary.perNoteTypeSummaries && Object.keys(summary.perNoteTypeSummaries).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" /> Source Breakdowns
                </h3>
                {Object.entries(summary.perNoteTypeSummaries).map(([type, data]) => (
                  <Card key={type} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-semibold text-slate-800">
                        {formatNoteType(type)}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-white font-medium text-xs">
                        {data.notesCount} {data.notesCount === 1 ? 'note' : 'notes'}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-4">
                      <p className="text-sm text-slate-600 mb-3">{data.summary}</p>
                      {data.keyPoints && data.keyPoints.length > 0 && (
                        <ul className="space-y-1.5 mt-2 pt-3 border-t border-slate-100">
                          {data.keyPoints.map((pt, i) => (
                            <li key={i} className="text-xs text-slate-500 flex items-start gap-2">
                              <span className="text-slate-300 mt-0.5">•</span> <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
