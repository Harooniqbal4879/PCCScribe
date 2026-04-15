import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGenerateSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientSummariesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatNoteType } from "@/lib/utils";

const NOTE_TYPES = [
  "progress_notes",
  "physician_orders",
  "mds_assessment",
  "care_plan",
  "mar",
  "nursing_notes",
  "therapy_notes",
  "dietary_notes",
  "social_work_notes",
  "other"
] as const;

const formSchema = z.object({
  dateFrom: z.string().min(1, "Start date required"),
  dateTo: z.string().min(1, "End date required"),
  noteTypes: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
  patientId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccessNavigate?: (summaryId: number) => void;
}

export function GenerateSummaryModal({ patientId, open, onOpenChange, onSuccessNavigate }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dateFrom: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      dateTo: format(new Date(), 'yyyy-MM-dd'),
      noteTypes: [...NOTE_TYPES],
    },
  });

  const generateMutation = useGenerateSummary({
    mutation: {
      onSuccess: (summary) => {
        queryClient.invalidateQueries({ queryKey: getListPatientSummariesQueryKey(patientId) });
        toast({ title: "Summary generation started", description: "AI is analyzing the notes." });
        onOpenChange(false);
        if (onSuccessNavigate && summary.id) {
          onSuccessNavigate(summary.id);
        }
      },
      onError: (err) => {
        toast({ 
          title: "Generation failed", 
          description: "Not enough notes or an error occurred.", 
          variant: "destructive" 
        });
      }
    }
  });

  const onSubmit = (data: FormData) => {
    generateMutation.mutate({ 
      patientId, 
      data: {
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        noteTypes: data.noteTypes?.length === NOTE_TYPES.length ? undefined : data.noteTypes
      } 
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-white border-slate-200/60 shadow-xl shadow-black/5 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold flex items-center gap-2 text-slate-900">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            Generate Clinical Summary
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Select the date range and types of notes you want the AI to include in this summary.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="space-y-2">
              <Label htmlFor="dateFrom" className="text-slate-700">Start Date</Label>
              <Input 
                id="dateFrom" 
                type="date"
                className="bg-white border-slate-200 focus-visible:ring-primary/20"
                {...form.register("dateFrom")} 
              />
              {form.formState.errors.dateFrom && <p className="text-xs text-red-500">{form.formState.errors.dateFrom.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo" className="text-slate-700">End Date</Label>
              <Input 
                id="dateTo" 
                type="date"
                className="bg-white border-slate-200 focus-visible:ring-primary/20"
                {...form.register("dateTo")} 
              />
              {form.formState.errors.dateTo && <p className="text-xs text-red-500">{form.formState.errors.dateTo.message}</p>}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-slate-700">Note Types to Include</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {NOTE_TYPES.map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox 
                    id={type} 
                    checked={form.watch("noteTypes")?.includes(type)}
                    onCheckedChange={(checked) => {
                      const current = form.watch("noteTypes") || [];
                      const updated = checked 
                        ? [...current, type]
                        : current.filter(t => t !== type);
                      form.setValue("noteTypes", updated);
                    }}
                    className="border-slate-300 text-primary focus-visible:ring-primary/20 data-[state=checked]:bg-primary data-[state=checked]:text-white"
                  />
                  <Label htmlFor={type} className="text-sm font-medium text-slate-600 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                    {formatNoteType(type)}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={generateMutation.isPending}
              className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {generateMutation.isPending ? "Starting Analysis..." : "Generate AI Summary"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
