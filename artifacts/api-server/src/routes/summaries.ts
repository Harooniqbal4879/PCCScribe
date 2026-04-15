import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { summariesTable, clinicalNotesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  GenerateSummaryBody,
  GenerateSummaryParams,
  ListPatientSummariesParams,
  GetSummaryParams,
  DeleteSummaryParams,
} from "@workspace/api-zod";
import { generateClinicalSummary } from "../lib/summarizer.js";
import { patientsTable } from "@workspace/db";

const router: IRouter = Router({ mergeParams: true });

const formatSummary = (s: typeof summariesTable.$inferSelect) => ({
  ...s,
  noteTypesIncluded: (s.noteTypesIncluded as string[]) ?? [],
  keyClinicalEvents: (s.keyClinicalEvents as any[]) ?? null,
  documentationGaps: (s.documentationGaps as string[]) ?? null,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

router.get("/", async (req, res) => {
  try {
    const { patientId } = ListPatientSummariesParams.parse(req.params);
    const summaries = await db
      .select()
      .from(summariesTable)
      .where(eq(summariesTable.patientId, patientId))
      .orderBy(summariesTable.createdAt);
    res.json(summaries.map(formatSummary));
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const { patientId } = GenerateSummaryParams.parse(req.params);
    const body = GenerateSummaryBody.parse(req.body);

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId));

    if (!patient) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Patient not found" });
    }

    let query = db
      .select()
      .from(clinicalNotesTable)
      .where(
        and(
          eq(clinicalNotesTable.patientId, patientId),
          gte(clinicalNotesTable.noteDate, body.dateFrom),
          lte(clinicalNotesTable.noteDate, body.dateTo)
        )
      );

    let notes = await query;

    if (body.noteTypes && body.noteTypes.length > 0) {
      notes = notes.filter((n) => body.noteTypes!.includes(n.noteType));
    }

    if (notes.length === 0) {
      return res.status(400).json({
        error: "no_notes",
        message:
          "No notes found for the specified date range and note types. Please ingest notes first.",
      });
    }

    const noteTypesIncluded = [...new Set(notes.map((n) => n.noteType))];

    const [summary] = await db
      .insert(summariesTable)
      .values({
        patientId,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        noteTypesIncluded,
        notesCount: notes.length,
        status: "generating",
      })
      .returning();

    res.status(201).json(formatSummary(summary));

    (async () => {
      try {
        const result = await generateClinicalSummary(
          patient.name,
          patient.age,
          patient.facilityName,
          patient.unit,
          notes,
          body.dateFrom,
          body.dateTo
        );

        await db
          .update(summariesTable)
          .set({
            status: "completed",
            confidence: result.confidence,
            oneLiner: result.oneLiner,
            soapSummary: result.soapSummary as any,
            perNoteTypeSummaries: result.perNoteTypeSummaries as any,
            keyClinicalEvents: result.keyClinicalEvents as any,
            documentationGaps: result.documentationGaps,
            updatedAt: new Date(),
          })
          .where(eq(summariesTable.id, summary.id));
      } catch (err) {
        console.error("Summary generation failed:", err);
        await db
          .update(summariesTable)
          .set({
            status: "failed",
            errorMessage: String(err),
            updatedAt: new Date(),
          })
          .where(eq(summariesTable.id, summary.id));
      }
    })();

    return;
  } catch (err) {
    return res
      .status(400)
      .json({ error: "validation_error", message: String(err) });
  }
});

router.get("/:summaryId", async (req, res) => {
  try {
    const { patientId, summaryId } = GetSummaryParams.parse(req.params);
    const [summary] = await db
      .select()
      .from(summariesTable)
      .where(
        and(
          eq(summariesTable.id, summaryId),
          eq(summariesTable.patientId, patientId)
        )
      );
    if (!summary) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Summary not found" });
    }
    return res.json(formatSummary(summary));
  } catch (err) {
    return res
      .status(500)
      .json({ error: "internal_error", message: String(err) });
  }
});

const DeleteSummaryRouteParams = DeleteSummaryParams;

router.delete("/:summaryId", async (req, res) => {
  try {
    const { patientId, summaryId } = DeleteSummaryRouteParams.parse(
      req.params
    );
    await db
      .delete(summariesTable)
      .where(
        and(
          eq(summariesTable.id, summaryId),
          eq(summariesTable.patientId, patientId)
        )
      );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

export default router;
