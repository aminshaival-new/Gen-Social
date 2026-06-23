require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

/* ─── helpers ────────────────────────────────────────────── */
function requireKey(res, ...keys) {
  for (const k of keys) {
    if (!process.env[k]) {
      res.status(503).json({ error: `${k} not configured in .env` });
      return false;
    }
  }
  return true;
}

async function callClaude(messages, maxTokens = 4096) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: maxTokens,
      messages
    })
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  return r.json();
}

function parseJSON(text) {
  text = text.trim();
  if (text.startsWith('```')) text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

/* ─── GET /api/config-status ─────────────────────────────── */
app.get('/api/config-status', (_req, res) => {
  res.json({
    claude:  !!process.env.ANTHROPIC_API_KEY,
    openai:  !!process.env.OPENAI_API_KEY,
    blotato: !!(process.env.BLOTATO_API_KEY && process.env.BLOTATO_ACCOUNT_ID)
  });
});

/* ─── POST /api/brand-analyze ────────────────────────────── */
app.post('/api/brand-analyze', async (req, res) => {
  try {
    if (!requireKey(res, 'ANTHROPIC_API_KEY')) return;
    const { url } = req.body;

    let siteText = `Website: ${url}`;
    try {
      const page = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandBot/1.0)' },
        signal: AbortSignal.timeout(8000)
      });
      const html = await page.text();
      siteText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    } catch (_) { /* use fallback siteText */ }

    const data = await callClaude([{
      role: 'user',
      content: `Analyze this brand website and extract its visual identity. Return ONLY valid JSON — no markdown, no explanation.

URL: ${url}
Page text sample: ${siteText}

Return exactly:
{
  "name": "Brand Name (from domain or content)",
  "primaryColor": "#hex — dominant dark brand colour",
  "accentColor": "#hex — key accent or highlight colour",
  "bgColor": "#hex — background/light colour",
  "font": "Google Font or system font name that fits the brand",
  "vibes": ["tag1","tag2","tag3"] — pick 3 from: Minimal, Sustainable, Natural, Luxury, Bold, Playful, Earthy, Tech, Outdoor, Beauty, Athletic, Premium, Artisan, Modern, Classic
}`
    }], 512);

    const brand = parseJSON(data.content[0].text);
    res.json({ brand });
  } catch (err) {
    console.error('/api/brand-analyze', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/generate-ideas ───────────────────────────── */
app.post('/api/generate-ideas', async (req, res) => {
  try {
    if (!requireKey(res, 'ANTHROPIC_API_KEY')) return;
    const { prompt, count, brand } = req.body;

    const data = await callClaude([{
      role: 'user',
      content: `You are an elite social media creative director. Create exactly ${count} Instagram carousel post concepts for the brand below. Return ONLY valid JSON — no markdown.

Brand name: ${brand.name}
Brand vibe: ${(brand.vibes || []).join(', ')}
Brand colours: primary ${brand.primaryColor}, accent ${brand.accentColor}
Campaign brief: ${prompt}

Return this JSON shape:
{
  "posts": [
    {
      "concept": "Compelling post headline — punchy, under 70 chars",
      "tags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
      "caption": "Full Instagram caption. 3-5 engaging sentences. Emojis. Call to action. Hashtags at end. 150-300 chars before hashtags.",
      "slides": [
        {
          "type": "cover",
          "headline": "Short\\nHook",
          "sub": "Supporting subtitle, max 8 words",
          "emoji": "🎯",
          "imagePrompt": "Detailed visual prompt for AI image generation, max 180 chars. Describe: subject, lighting, mood, colours, composition. No text in image."
        }
      ]
    }
  ]
}

Each post must have exactly 5 slides in this order: cover → feature → [stat or feature] → lifestyle → cta
Slide type guides:
• cover — powerful opener, brand hero moment
• feature — one product feature or benefit, clean composition
• stat — a real-sounding compelling statistic, big number as headline
• lifestyle — aspirational scene showing the product in real life
• cta — clear call to action slide

imagePrompt must describe a photograph or illustration — NOT text or typography. Be specific about subject, style, lighting, and colours.`
    }]);

    const result = parseJSON(data.content[0].text);
    res.json(result);
  } catch (err) {
    console.error('/api/generate-ideas', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/rewrite-caption ──────────────────────────── */
app.post('/api/rewrite-caption', async (req, res) => {
  try {
    if (!requireKey(res, 'ANTHROPIC_API_KEY')) return;
    const { concept, brand, currentCaption } = req.body;

    const data = await callClaude([{
      role: 'user',
      content: `Rewrite this Instagram caption for ${brand.name}. Brand vibe: ${(brand.vibes || []).join(', ')}.

Post concept: ${concept}
Current caption: ${currentCaption}

Write a fresh, engaging caption. Keep the brand voice. Include 1-2 emojis. End with a CTA and 5 relevant hashtags. Return ONLY the caption text, nothing else.`
    }], 512);

    res.json({ caption: data.content[0].text.trim() });
  } catch (err) {
    console.error('/api/rewrite-caption', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/generate-image ───────────────────────────── */
app.post('/api/generate-image', async (req, res) => {
  try {
    if (!requireKey(res, 'OPENAI_API_KEY')) return;
    const { prompt } = req.body;

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    // gpt-image-1 returns b64_json by default
    const b64 = data.data[0].b64_json || null;
    const url  = data.data[0].url     || null;
    res.json({ imageUrl: b64 ? `data:image/png;base64,${b64}` : url });
  } catch (err) {
    console.error('/api/generate-image', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/schedule ─────────────────────────────────── */
/* Blotato API — adjust endpoint paths if their docs differ   */
app.post('/api/schedule', async (req, res) => {
  try {
    if (!requireKey(res, 'BLOTATO_API_KEY', 'BLOTATO_ACCOUNT_ID')) return;
    const { caption, images, scheduledAt } = req.body;

    const BLOTATO = 'https://api.blotato.com/v1';
    const AUTH    = { 'Authorization': `Bearer ${process.env.BLOTATO_API_KEY}` };

    // 1. Upload each slide image and collect media IDs
    const mediaIds = [];
    for (const imgData of images) {
      const base64 = imgData.replace(/^data:image\/\w+;base64,/, '');
      const buf    = Buffer.from(base64, 'base64');

      const form = new FormData();
      form.append('file', new Blob([buf], { type: 'image/png' }), 'slide.png');
      form.append('account_id', process.env.BLOTATO_ACCOUNT_ID);

      const up = await fetch(`${BLOTATO}/media`, { method: 'POST', headers: AUTH, body: form });
      if (!up.ok) throw new Error(`Blotato media upload failed: ${await up.text()}`);
      const upData = await up.json();
      mediaIds.push(upData.id ?? upData.media_id ?? upData.mediaId);
    }

    // 2. Create the scheduled post
    const post = await fetch(`${BLOTATO}/posts`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: process.env.BLOTATO_ACCOUNT_ID,
        platform:   'instagram',
        type:       'carousel',
        media_ids:  mediaIds,
        caption,
        scheduled_at: scheduledAt  // ISO 8601
      })
    });

    const postData = await post.json();
    if (!post.ok) throw new Error(postData.error || postData.message || 'Blotato schedule failed');
    res.json({ success: true, id: postData.id });
  } catch (err) {
    console.error('/api/schedule', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Start ──────────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Gen Social  →  http://localhost:${PORT}\n`);
  const keys = {
    'Claude (ideas + captions)': !!process.env.ANTHROPIC_API_KEY,
    'OpenAI (image gen)':        !!process.env.OPENAI_API_KEY,
    'Blotato (scheduling)':      !!(process.env.BLOTATO_API_KEY && process.env.BLOTATO_ACCOUNT_ID)
  };
  for (const [k, v] of Object.entries(keys)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
  console.log('');
});
