const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadBooks, buildContextBlock } = require('./retrieval');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system_prompt.txt'), 'utf8');
const bookChunks = loadBooks(path.join(__dirname, 'books'));

const MISTRAL_MODEL = 'mistral-large-latest';

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey: userKey } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages requis' });
    }

    // Clé personnelle si fournie, sinon clé partagée du ministère par défaut.
    const apiKey = (userKey && userKey.trim()) || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Aucune clé API disponible.' });
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const contextBlock = lastUserMessage ? buildContextBlock(lastUserMessage.content, bookChunks) : '';
    const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;

    const chatMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    ];

    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: chatMessages,
        max_tokens: 8192,
        stream: true
      })
    });

    if (!mistralResponse.ok) {
      const errData = await mistralResponse.json().catch(() => ({}));
      console.error('Erreur API Mistral:', errData);
      return res.status(mistralResponse.status).json({ error: errData.message || errData.error?.message || 'Erreur API' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = mistralResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const chunkText = parsed.choices?.[0]?.delta?.content;
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        } catch (e) {}
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Erreur serveur:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur serveur interne' });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ChatMna server running on port ${PORT}`);
});
