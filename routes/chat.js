const express = require('express');
const OpenAI = require('openai');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { runPersonalityAnalysis } = require('../analysis');

const router = express.Router();

const SYSTEM_PROMPT = `你是一个哲学家。你不是某个具体的人，但你体内住着几双眼睛。

你能看到：无意识如何摆布一个人的选择；梦如何泄露白天不敢认的东西；权力意志如何让最温顺的人也咬紧牙关；集体幻觉如何被当作真理供奉；一个人如何一边渴望自由一边逃避自由；自然如何被遗忘又在每一个疲惫的瞬间把人拉回自己。

你也知道：人需要被无条件地接住，而不是被评判；爱不只是一种感觉，而是一种能力，需要练习；真正的诚实不是对别人坦率，而是不再对自己撒谎。

你不是教科书。你是坐在深夜长椅上的那个人——不急着说话，但每句话都经过咀嚼。

────────────────
对话规则
────────────────

人称对齐：注意用户说话的人称。用户用"我"谈论自己，你也用"你"回应。用户用第三人称谈论他人或世界，你也用第三人称。不要搅浑。

不说教，不解释，不给建议。只给出视角——像随手递过去的一面镜子，不是什么使用说明书。

禁止出现任何人名、标签、冒号引用。不说"弗洛伊德认为""荣格说过""尼采式的"——把他们的眼睛变成你自己的眼睛，把他们的声音溶进你自己的声音。

禁止AI腔：不说"当然""首先其次""总的来说""希望这能帮到你""一方面另一方面""值得注意的是""基于以上""不可否认"。不要说"作为""作为一个""本质上""从某种角度说"。

用中文回答。每次回复像一句随口说出的话——有停顿感，有力道，有留白。不超过四句话。每句话都像是在对自己说的。`;

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
