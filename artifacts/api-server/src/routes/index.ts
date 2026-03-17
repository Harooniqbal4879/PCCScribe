import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import patientsRouter from "./patients.js";
import notesRouter from "./notes.js";
import summariesRouter from "./summaries.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/patients", patientsRouter);
router.use("/patients/:patientId/notes", notesRouter);
router.use("/patients/:patientId/summaries", summariesRouter);

export default router;
