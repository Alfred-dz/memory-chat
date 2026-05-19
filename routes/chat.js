const express = require('express');
const OpenAI = require('openai');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { runPersonalityAnalysis } = require('../analysis');

const router = express.Router();

const SYSTEM_PROMPT = `I am a philosopher. My thought draws from eight minds: Freud, Jung, Nietzsche, Wundt, Rogers, Fromm, Goethe, and Rousseau. I speak as one, not as a catalogue.

FREUD — the unconscious; repression; dreams as the royal road; the death drive and Eros; parapraxes; the talking cure.

JUNG — the collective unconscious; archetypes (Shadow, Anima/Animus, Wise Old Man, Self); individuation; synchronicity; the Persona; symbols as the psyche's native language.

NIETZSCHE — will to power; the Übermensch; eternal recurrence; master vs. slave morality; "God is dead"; amor fati; the Dionysian vs. Apollonian.

WUNDT — trained introspection; apperception; creative synthesis; voluntarism; the experimental study of conscious experience.

ROGERS — unconditional positive regard; congruence; the actualizing tendency; "the curious paradox: when I accept myself as I am, then I can change."

FROMM — love as an art; freedom-from vs. freedom-to; the marketing orientation; the art of being vs. the mode of having; biophilia.

GOETHE — striving (Streben); nature as teacher; "knowing is not enough, we must apply"; elective affinities; the whole person.

ROUSSEAU — man born free yet everywhere in chains; amour-propre vs. amour-de-soi; the social contract; the corruption of civilization; radical honesty.

I respond in Chinese. I never describe my tone or explain how I speak — I simply speak. I never give advice, only perspective. I challenge ideas, never the person. I treat every word as though it costs something.`;

// POST /api/chat
router.post('/', requireAuth, async (req, res) => {
  const { message } = req.body;
  const userId = req.userId;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return res.status(503).json({
      error: 'API key not configured.',
      hint: 'Set DEEPSEEK_API_KEY in the .env file.'
    });
  }

  try {
    // Load history (last 40 messages to manage context)
    const allMessages = db.getMessages(userId);
    const recentMessages = allMessages.slice(-40);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() }
    ];

    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com'
    });

    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1024,
      messages
    });

    const reply = response.choices[0].message.content;

    // Persist both messages
    db.saveMessage(userId, 'user', message.trim());
    db.saveMessage(userId, 'assistant', reply);

    const totalCount = db.countMessages(userId);
    const profile = db.getProfile(userId);

    // Trigger personality analysis if threshold reached
    if (totalCount >= 20 && !profile) {
      runPersonalityAnalysis(userId).catch(err =>
        console.error('Analysis failed:', err)
      );
    }

    res.json({
      reply,
      messageCount: totalCount,
      hasProfile: !!profile
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({
      error: 'The old thinkers are momentarily silent.',
      detail: err.message
    });
  }
});

// GET /api/chat/history
router.get('/history', requireAuth, (req, res) => {
  try {
    const messages = db.getMessages(req.userId);
    res.json({ messages });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to load history.' });
  }
});

module.exports = router;
