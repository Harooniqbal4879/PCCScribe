import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreatePatient } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientsQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  age: z.coerce.number().min(1, "Age must be valid").max(120),
  facilityName: z.string().min(2, "Facility name required"),
  unit: z.string().min(1, "Unit required"),
  mrn: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePatientModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: "Patient added successfully", description: "The new patient has been registered." });
        onOpenChange(false);
        form.reset();
      },
      onError: (err) => {
        toast({ title: "Failed to add patient", description: "An unexpected error occurred.", variant: "destructive" });
      }
    }
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      age: 0,
      facilityName: "",
      unit: "",
      mrn: "",
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate({ data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-slate-200/60 shadow-xl shadow-black/5 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold text-slate-900">Add New Patient</DialogTitle>
          <DialogDescription className="text-slate-500">
            Register a new patient for clinical note tracking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-700">Patient Name</Label>
            <Input 
              id="name" 
              placeholder="e.g. John Doe" 
              className="bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
              {...form.register("name")} 
            />
            {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age" className="text-slate-700">Age</Label>
              <Input 
                id="age" 
                type="number" 
                placeholder="e.g. 74" 
                className="bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                {...form.register("age")} 
              />
              {form.formState.errors.age && <p className="text-xs text-red-500">{form.formState.errors.age.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mrn" className="text-slate-700">MRN (Optional)</Label>
              <Input 
                id="mrn" 
                placeholder="e.g. MRN-12345" 
                className="bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                {...form.register("mrn")} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facilityName" className="text-slate-700">Facility</Label>
            <Input 
              id="facilityName" 
              placeholder="e.g. Shady Pines SNF" 
              className="bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
              {...form.register("facilityName")} 
            />
            {form.formState.errors.facilityName && <p className="text-xs text-red-500">{form.formState.errors.facilityName.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit" className="text-slate-700">Unit / Room</Label>
            <Input 
              id="unit" 
              placeholder="e.g. West Wing 204" 
              className="bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
              {...form.register("unit")} 
            />
            {form.formState.errors.unit && <p className="text-xs text-red-500">{form.formState.errors.unit.message}</p>}
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Register Patient
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
