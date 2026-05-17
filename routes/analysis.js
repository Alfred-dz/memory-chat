const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { runPersonalityAnalysis } = require('../analysis');

const router = express.Router();

// GET /api/analysis
router.get('/', requireAuth, (req, res) => {
  const profile = db.getProfile(req.userId);

  if (!profile) {
    const msgCount = db.countMessages(req.userId);
    return res.json({
      ready: false,
      messageCount: msgCount,
      needed: 20
    });
  }

  res.json({
    ready: true,
    profileText: profile.profile_text,
    matchedFigure: profile.matched_figure,
    figureDescription: profile.figure_description,
    traits: JSON.parse(profile.traits || '[]'),
    analyzedAt: profile.analyzed_at
  });
});

// POST /api/analysis
router.post('/', requireAuth, async (req, res) => {
  try {
    const msgCount = db.countMessages(req.userId);
    if (msgCount < 20) {
      return res.status(400).json({
        error: 'Not enough conversation yet.',
        messageCount: msgCount,
        needed: 20
      });
    }

    await runPersonalityAnalysis(req.userId);

    const profile = db.getProfile(req.userId);
    res.json({
      ready: true,
      profileText: profile.profile_text,
      matchedFigure: profile.matched_figure
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed.', detail: err.message });
  }
});

module.exports = router;
