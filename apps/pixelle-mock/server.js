/**
 * Pixelle Mock API — Node.js
 * Implements the minimal surface that the Content Creator render pipeline expects:
 *   POST /api/video/generate/sync
 *   POST /api/video/generate/async
 *   GET  /api/tasks/:taskId
 *   GET  /health
 *
 * Responses include a real publicly-accessible sample MP4 so the video player
 * in the dashboard actually works.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "4mb" }));

const port = Number(process.env.PIXELLE_PORT || 8000);

// In-memory task store (keyed by task_id)
const tasks = {};

// A free sample MP4 from the Web (small, public domain, always reachable)
const SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

function buildVideoResult(payload) {
  return {
    video_url: SAMPLE_VIDEO_URL,
    mock: true,
    duration: payload?.duration || "30",
    file_size: 2621440, // 2.5 MB placeholder
    n_scenes: payload?.n_scenes || 4,
    frame_template: payload?.frame_template || "1080x1920/image_default.html",
    render_mode: payload?.render_mode || "visual",
    tts_workflow: payload?.tts_workflow || "none",
    media_workflow: payload?.media_workflow || "selfhost/image_flux.json",
    status: "completed",
    message: "Pixelle mock: render hoàn tất thành công.",
    audio_note: "Sample MP4 contains built-in audio; this is not ElevenLabs voiceover."
  };
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "pixelle-mock", version: "1.0.0" });
});

// ── Sync render ───────────────────────────────────────────────────────────────
app.post("/api/video/generate/sync", (req, res) => {
  const payload = req.body || {};
  console.log(`[pixelle-mock] sync render — title: "${payload.title || "(no title)"}"`);

  // Simulate a short processing delay (1.5 s) so the UI feels real
  setTimeout(() => {
    res.json(buildVideoResult(payload));
  }, 1500);
});

// ── Async render ──────────────────────────────────────────────────────────────
app.post("/api/video/generate/async", (req, res) => {
  const payload = req.body || {};
  const taskId = crypto.randomUUID();
  console.log(`[pixelle-mock] async render queued — task_id: ${taskId}`);

  tasks[taskId] = { status: "running", payload, startedAt: Date.now() };

  // Simulate a 3-second render then mark as completed
  setTimeout(() => {
    tasks[taskId] = {
      status: "completed",
      payload,
      result: buildVideoResult(payload),
      completedAt: Date.now()
    };
    console.log(`[pixelle-mock] task ${taskId} completed`);
  }, 3000);

  res.json({ task_id: taskId, status: "queued" });
});

// ── Task status poll ──────────────────────────────────────────────────────────
app.get("/api/tasks/:taskId", (req, res) => {
  const task = tasks[req.params.taskId];
  if (!task) {
    return res.status(404).json({ error: "Task not found", status: "failed" });
  }
  res.json({
    task_id: req.params.taskId,
    status: task.status,
    result: task.result || null,
    message: task.status === "completed" ? "Render hoàn tất." : "Đang render..."
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`Pixelle mock API running on http://localhost:${port}`);
  console.log(`  POST /api/video/generate/sync`);
  console.log(`  POST /api/video/generate/async`);
  console.log(`  GET  /api/tasks/:taskId`);
  console.log(`  GET  /health`);
});
