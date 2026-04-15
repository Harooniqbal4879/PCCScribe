import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clinicalNotesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";
import {
  CreatePatientNotesBody,
  CreatePatientNotesParams,
  ListPatientNotesParams,
  DeleteNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// ── Compute a stable dedup fingerprint for a PCC note ────────────────────────
function computeFingerprint(patientId: number, noteDate: string, noteTypePcc: string | null | undefined, noteType: string, author: string | null | undefined): string {
  const raw = [
    String(patientId),
    noteDate.trim(),
    (noteTypePcc || noteType).trim(),
    (author || "").trim(),
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ── Populate the PostgreSQL full-text search vector for a note ───────────────
// Called via raw SQL after upsert so we don't have to model tsvector in Drizzle
async function updateSearchVector(noteId: number, content: string, author: string | null | undefined, noteTypePcc: string | null | undefined) {
  const text = [author || "", noteTypePcc || "", content].join(" ");
  await db.execute(
    sql`UPDATE clinical_notes SET search_vector = to_tsvector('english', ${text}) WHERE id = ${noteId}`
  );
}

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

    const MIN_CONTENT_LENGTH = 30;

    // Filter out blank / near-empty notes before doing anything
    const validNotes = body.notes.filter((note) => {
      const c = (note.content || "").trim();
      return c.length >= MIN_CONTENT_LENGTH;
    });

    if (validNotes.length === 0) {
      return res.status(201).json({ inserted: 0, updated: 0, skipped: body.notes.length, noteIds: [] });
    }

    let inserted = 0;
    let updated = 0;
    const noteIds: number[] = [];

    for (const note of validNotes) {
      const contentQuality = ((note as any).contentQuality || "truncated") as "full" | "truncated";
      const fingerprint = computeFingerprint(
        patientId,
        note.noteDate,
        (note as any).noteTypePcc,
        note.noteType,
        note.author
      );

      // Check if a note with this fingerprint already exists
      const [existing] = await db
        .select({ id: clinicalNotesTable.id, contentQuality: clinicalNotesTable.contentQuality, content: clinicalNotesTable.content })
        .from(clinicalNotesTable)
        .where(and(
          eq(clinicalNotesTable.patientId, patientId),
          eq(clinicalNotesTable.pccFingerprint, fingerprint),
        ));

      if (existing) {
        // Only upgrade: overwrite if new content is longer (full replacing truncated)
        const newContentLonger = note.content.trim().length > existing.content.trim().length;
        const upgradingToFull = contentQuality === "full" && existing.contentQuality === "truncated";

        if (upgradingToFull || newContentLonger) {
          await db
            .update(clinicalNotesTable)
            .set({
              content: note.content.trim(),
              contentQuality,
              printUrl: (note as any).printUrl ?? null,
              sourceUrl: note.sourceUrl ?? null,
              noteTypePcc: (note as any).noteTypePcc ?? null,
            })
            .where(eq(clinicalNotesTable.id, existing.id));

          await updateSearchVector(existing.id, note.content, note.author, (note as any).noteTypePcc);
          noteIds.push(existing.id);
          updated++;
        } else {
          // Duplicate with no improvement — skip
          noteIds.push(existing.id);
        }
      } else {
        const [row] = await db
          .insert(clinicalNotesTable)
          .values({
            patientId,
            noteType: note.noteType as any,
            noteDate: note.noteDate,
            author: note.author ?? null,
            content: note.content.trim(),
            sourceUrl: note.sourceUrl ?? null,
            printUrl: (note as any).printUrl ?? null,
            noteTypePcc: (note as any).noteTypePcc ?? null,
            source,
            pccFingerprint: fingerprint,
            contentQuality,
          })
          .returning({ id: clinicalNotesTable.id });

        await updateSearchVector(row.id, note.content, note.author, (note as any).noteTypePcc);
        noteIds.push(row.id);
        inserted++;
      }
    }

    res.status(201).json({
      inserted,
      updated,
      skipped: body.notes.length - validNotes.length,
      noteIds,
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
