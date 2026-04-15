import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { ClinicalNote } from "@workspace/db";

const NOTE_TYPE_LABELS: Record<string, string> = {
  progress_notes: "Progress Notes",
  physician_orders: "Physician Orders",
  mds_assessment: "MDS Assessment",
  care_plan: "Care Plan",
  mar: "Medication Administration Record (MAR)",
  nursing_notes: "Nursing Notes",
  therapy_notes: "Therapy Notes",
  dietary_notes: "Dietary Notes",
  social_work_notes: "Social Work Notes",
  other: "Other Notes",
};

export interface SummarizationResult {
  confidence: "high" | "medium" | "low";
  oneLiner: string;
  soapSummary: {
    subjective: {
      narrative: string;
      patientReportedSymptoms: string[];
      familyConcernsDocumented: string[];
      painReported: boolean;
      painScaleReported: string | null;
      moodAffect: string | null;
      dataSufficiency: string;
    };
    objective: {
      narrative: string;
      keyFindings: Array<{ finding: string; source: string }>;
      vitalsTrend: string | null;
      functionalStatus: string | null;
      dataSufficiency: string;
    };
    assessment: {
      narrative: string;
      activeDiagnoses: string[];
      clinicalTrajectory: string | null;
      riskFlags: string[];
      dataSufficiency: string;
    };
    plan: {
      narrative: string;
      activeOrders: string[];
      pendingActions: string[];
      followUpItems: string[];
      dataSufficiency: string;
    };
  };
  perNoteTypeSummaries: Record<
    string,
    {
      confidence: string;
      summary: string;
      notesCount: number;
      keyPoints: string[];
    }
  >;
  keyClinicalEvents: Array<{
    date: string;
    event: string;
    significance: "high" | "medium" | "low";
  }>;
  documentationGaps: string[];
}

export async function generateClinicalSummary(
  patientName: string,
  patientAge: number,
  facilityName: string,
  unit: string,
  notes: ClinicalNote[],
  dateFrom: string,
  dateTo: string
): Promise<SummarizationResult> {
  const notesByType = notes.reduce(
    (acc, note) => {
      if (!acc[note.noteType]) acc[note.noteType] = [];
      acc[note.noteType].push(note);
      return acc;
    },
    {} as Record<string, ClinicalNote[]>
  );

  const enabledNoteTypes = Object.keys(notesByType)
    .map((t) => NOTE_TYPE_LABELS[t] || t)
    .join(", ");

  const notesText = Object.entries(notesByType)
    .map(([type, typeNotes]) => {
      const label = NOTE_TYPE_LABELS[type] || type;
      return `=== ${label.toUpperCase()} (${typeNotes.length} notes) ===\n${typeNotes
        .map(
          (n) =>
            `[${n.noteDate}${n.author ? ` | ${n.author}` : ""}]\n${n.content}`
        )
        .join("\n\n")}`;
    })
    .join("\n\n");

  const prompt = `You are a clinical AI assistant synthesizing notes for ${patientName}, a ${patientAge}-year-old resident at ${facilityName} (${unit} unit). Notes span ${dateFrom} to ${dateTo} and include: ${enabledNoteTypes}.

CLINICAL NOTES:
${notesText}

---

Produce a comprehensive clinical summary as a valid JSON object with EXACTLY this structure:

{
  "confidence": "high" | "medium" | "low",
  "oneLiner": "Single sentence capturing the patient's current clinical situation",
  "soapSummary": {
    "subjective": {
      "narrative": "Clinical narrative prose for subjective section",
      "patientReportedSymptoms": ["symptom1", "symptom2"],
      "familyConcernsDocumented": ["concern1"],
      "painReported": true | false,
      "painScaleReported": "string or null",
      "moodAffect": "string or null",
      "dataSufficiency": "adequate" | "limited" | "insufficient"
    },
    "objective": {
      "narrative": "Clinical narrative prose for objective section",
      "keyFindings": [{"finding": "string", "source": "note type"}],
      "vitalsTrend": "string or null",
      "functionalStatus": "string or null",
      "dataSufficiency": "adequate" | "limited" | "insufficient"
    },
    "assessment": {
      "narrative": "Clinical narrative prose for assessment section",
      "activeDiagnoses": ["diagnosis1", "diagnosis2"],
      "clinicalTrajectory": "improving" | "stable" | "declining" | "variable" | null,
      "riskFlags": ["risk1", "risk2"],
      "dataSufficiency": "adequate" | "limited" | "insufficient"
    },
    "plan": {
      "narrative": "Clinical narrative prose for plan section",
      "activeOrders": ["order1", "order2"],
      "pendingActions": ["action1"],
      "followUpItems": ["item1"],
      "dataSufficiency": "adequate" | "limited" | "insufficient"
    }
  },
  "perNoteTypeSummaries": {
    "note_type_key": {
      "confidence": "high" | "medium" | "low",
      "summary": "2-4 sentence discipline-specific summary",
      "notesCount": number,
      "keyPoints": ["point1", "point2", "point3"]
    }
  },
  "keyClinicalEvents": [
    {"date": "YYYY-MM-DD", "event": "description", "significance": "high" | "medium" | "low"}
  ],
  "documentationGaps": ["gap1", "gap2"]
}

Note type keys for perNoteTypeSummaries must match: progress_notes, physician_orders, mds_assessment, care_plan, mar, nursing_notes, therapy_notes, dietary_notes, social_work_notes, other.
Only include note types that actually have notes.

Rules:
- Write SOAP narratives as professional clinical prose (2-4 paragraphs each), not bullet points
- Be specific and clinically precise — reference actual findings from the notes
- confidence=high if notes are comprehensive, medium if moderate, low if sparse or contradictory
- Include 5-10 key clinical events in chronological order
- List documentation gaps for note types requested but absent
- Return ONLY the JSON object, no markdown fences or explanation`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const text = block.text.trim();
  // Strip markdown fences if present
  const jsonText = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");

  const result = JSON.parse(jsonText) as SummarizationResult;
  return result;
}
