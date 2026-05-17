const OpenAI = require('openai');
const db = require('./database');

const ANALYSIS_PROMPT = `You are a personality analyst with deep knowledge of history. Analyze a conversation between a user and a psychologist AI. Identify which real historical figures the user most resembles.

Draw from your knowledge of famous PSYCHOLOGISTS (Freud, Jung, Rogers, Adler, Frankl, Horney, etc.), PHILOSOPHERS (Nietzsche, Kierkegaard, Sartre, Camus, Marcus Aurelius, Confucius, Laozi, etc.), and MILITARY STRATEGISTS (Sun Tzu, Napoleon, Alexander, Clausewitz, Zhuge Liang, etc.).

ANALYZE:
1. Core personality traits (3-5)
2. Communication style and emotional patterns
3. Values, fears, and motivations
4. Cognitive and thinking style

MATCH: Identify 2-3 real figures. For each, cite both the user's actual words AND the figure's known traits. Be specific.

Reply in valid JSON only (no markdown, no preamble):

{
  "traits": ["trait1", "trait2", "trait3", "trait4"],
  "primaryMatch": {
    "name": "Full Name",
    "domain": "Psychologist / Philosopher / Military Strategist",
    "explanation": "2-3 sentences linking user's conversation patterns to this figure's known characteristics."
  },
  "secondaryMatches": [
    {
      "name": "Full Name",
      "domain": "...",
      "explanation": "..."
    }
  ],
  "summary": "A warm, insightful 3-4 sentence portrait of who this person is, written in poetic but precise prose."
}`;

async function runPersonalityAnalysis(userId) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('API key not configured');
  }

  const messages = db.getMessages(userId);
  if (messages.length < 20) return;

  // Build transcript
  let transcript = '';
  for (const m of messages) {
    const label = m.role === 'user' ? 'User' : 'Psychologist';
    transcript += `${label}: ${m.content}\n\n`;
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com'
  });

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [
      { role: 'system', content: ANALYSIS_PROMPT },
      { role: 'user', content: `Here is the full conversation. Analyze it and return the JSON:\n\n${transcript}` }
    ]
  });

  const raw = response.choices[0].message.content.trim();

  // Parse JSON (handle possible markdown wrapping)
  let json;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    json = JSON.parse(jsonMatch[0]);
  } else {
    json = JSON.parse(raw);
  }

  const traits = JSON.stringify(json.traits);
  const primary = json.primaryMatch;
  const secondary = json.secondaryMatches || [];

  // Build a rich display text
  let profileText = `<div class="profile-figure">${primary.name}</div>`;
  profileText += `<div class="profile-domain">${primary.domain}</div>`;
  profileText += `<p class="profile-explain">${primary.explanation}</p>`;

  if (secondary.length > 0) {
    profileText += `<div class="profile-subtitle">Also resonates with</div>`;
    for (const s of secondary) {
      profileText += `<p class="profile-secondary"><strong>${s.name}</strong> (${s.domain}) — ${s.explanation}</p>`;
    }
  }

  profileText += `<div class="profile-summary">${json.summary}</div>`;

  db.saveProfile(userId, profileText, primary.name, primary.explanation, traits);
  console.log(`Personality analysis complete for user ${userId}`);
}

module.exports = { runPersonalityAnalysis };
