import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clinicalNotesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router({ mergeParams: true });

// ── Find the most relevant notes using PostgreSQL full-text search ────────────
async function findRelevantNotes(patientId: number, query: string, limit = 8) {
  // Sanitize query: remove special ts_query chars, split into words, join with & for AND search
  // Fall back to all notes for this patient if the query yields no FTS results
  const words = query
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => `${w}:*`)  // prefix matching
    .join(" & ");

  if (words) {
    const results = await db.execute(
      sql`
        SELECT id, note_date, note_type, note_type_pcc, author, content, content_quality, print_url
        FROM clinical_notes
        WHERE patient_id = ${patientId}
          AND search_vector IS NOT NULL
          AND search_vector @@ to_tsquery('english', ${words})
        ORDER BY ts_rank(search_vector, to_tsquery('english', ${words})) DESC,
                 note_date DESC
        LIMIT ${limit}
      `
    );

    if ((results as any).rows?.length > 0) {
      return (results as any).rows;
    }
  }

  // Fallback: return the most recent notes if no FTS match
  const fallback = await db
    .select()
    .from(clinicalNotesTable)
    .where(eq(clinicalNotesTable.patientId, patientId))
    .orderBy(sql`note_date DESC`)
    .limit(limit);

  return fallback;
}

// ── Build the system prompt with patient notes as context ────────────────────
function buildSystemPrompt(notes: any[]): string {
  if (notes.length === 0) {
    return `You are a clinical assistant for SNF (Skilled Nursing Facility) personnel.
No notes are currently available for this patient. Please let the user know and ask them to sync notes via the browser extension.`;
  }

  const notesText = notes
    .map((n, i) => {
      const type = n.note_type_pcc || n.note_type || "Note";
      const quality = n.content_quality === "full" ? "full text" : "excerpt";
      const author = n.author ? ` — ${n.author}` : "";
      return `[${i + 1}] ${n.note_date} | ${type}${author} (${quality})\n${n.content}`;
    })
    .join("\n\n---\n\n");

  return `You are a clinical assistant for SNF (Skilled Nursing Facility) personnel.
You have access to the following clinical notes for this patient (ordered by relevance to the question):

${notesText}

Guidelines:
- Answer questions accurately based only on the information in the notes above
- If information is not present in the notes, say so clearly
- Cite the note number [1], [2], etc. when referencing specific information
- Use plain clinical language appropriate for nursing staff
- Never speculate beyond what the notes contain
- For medication, vitals, or clinical values, always state the date/time they were recorded`;
}

// ── POST /api/patients/:patientId/chat ────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { patientId: patientIdStr } = req.params as any;
    const patientId = parseInt(patientIdStr, 10);
    if (isNaN(patientId)) {
      return res.status(400).json({ error: "invalid_patient_id" });
    }

    const { message, history = [] } = req.body as { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message is required" });
    }

    // Find the most relevant notes for this question
    const relevantNotes = await findRelevantNotes(patientId, message);

    // Set up SSE stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Build messages array for Claude
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.slice(-10), // last 10 exchanges for context window management
      { role: "user", content: message },
    ];

    // Send which notes are being used as sources
    const sources = relevantNotes.map((n: any) => ({
      id: n.id,
      date: n.note_date,
      type: n.note_type_pcc || n.note_type,
      author: n.author,
      quality: n.content_quality,
      printUrl: n.print_url,
    }));
    res.write(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`);

    // Stream Claude's response
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: buildSystemPrompt(relevantNotes),
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ type: "delta", content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: String(err) });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
      res.end();
    }
  }
});

export default router;
