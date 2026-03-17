import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clinicalNotesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreatePatientNotesBody,
  CreatePatientNotesParams,
  ListPatientNotesParams,
  DeleteNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  try {
    const { patientId } = ListPatientNotesParams.parse(req.params);
    const notes = await db
      .select()
      .from(clinicalNotesTable)
      .where(eq(clinicalNotesTable.patientId, patientId))
      .orderBy(clinicalNotesTable.noteDate);
    res.json(
      notes.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const { patientId } = CreatePatientNotesParams.parse(req.params);
    const body = CreatePatientNotesBody.parse(req.body);
    const source = body.source ?? "manual";

    const inserted = await db
      .insert(clinicalNotesTable)
      .values(
        body.notes.map((note) => ({
          patientId,
          noteType: note.noteType as any,
          noteDate: note.noteDate,
          author: note.author ?? null,
          content: note.content,
          sourceUrl: note.sourceUrl ?? null,
          printUrl: (note as any).printUrl ?? null,
          noteTypePcc: (note as any).noteTypePcc ?? null,
          source,
        }))
      )
      .returning({ id: clinicalNotesTable.id });

    res.status(201).json({
      inserted: inserted.length,
      noteIds: inserted.map((r) => r.id),
    });
  } catch (err) {
    res.status(400).json({ error: "validation_error", message: String(err) });
  }
});

const DeleteNoteRouteParams = DeleteNoteParams;

router.delete("/:noteId", async (req, res) => {
  try {
    const { patientId, noteId } = DeleteNoteRouteParams.parse(req.params);
    await db
      .delete(clinicalNotesTable)
      .where(
        and(
          eq(clinicalNotesTable.id, noteId),
          eq(clinicalNotesTable.patientId, patientId)
        )
      );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

export default router;
