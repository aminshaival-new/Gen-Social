require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');

const app = express();
app.set('trust proxy', 1); // Railway runs behind a proxy; needed for secure cookies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));

/* ─── Sessions ───────────────────────────────────────────────── */
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000   // 8 hours
  }
}));

/* ─── Public routes (no auth required) ──────────────────────── */
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/',      (req, res) => {
  if (!req.session.authed) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.AUTH_USER && password === process.env.AUTH_PASS) {
    req.session.authed = true;
    return req.session.save(() => res.json({ ok: true }));
  }
  res.status(401).json({ error: 'Wrong username or password' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

/* ─── Auth guard — everything below is protected ────────────── */
app.use((req, res, next) => {
  if (req.session.authed) return next();
  const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json');
  if (wantsJson) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
});

/* ─── Protected static files ─────────────────────────────────── */
app.use(express.static(path.join(__dirname)));

/* ─── helpers ────────────────────────────────────────────────── */
function requireKey(res, ...keys) {
  for (const k of keys) {
    if (!process.env[k]) {
      res.status(503).json({ error: `${k} not configured` });
      return false;
    }
  }
  return true;
}

async function callOpenRouter(messages, maxTokens = 4096) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000),
      'X-Title':       'Gen Social'
    },
    body: JSON.stringify({
      model:      'anthropic/claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages
    })
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  return r.json();
}

function getText(data) {
  return data?.choices?.[0]?.message?.content ?? '';
}

function parseJSON(text) {
  text = text.trim();
  if (text.startsWith('```')) text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

/* ─── GET /api/config-status ─────────────────────────────────── */
app.get('/api/config-status', (_req, res) => {
  res.json({
    claude:  !!process.env.OPENROUTER_API_KEY,
    openai:  !!process.env.FAL_KEY,
    blotato: !!process.env.BLOTATO_API_KEY
  });
});

/* ─── POST /api/brand-analyze ────────────────────────────────── */
app.post('/api/brand-analyze', async (req, res) => {
  try {
    if (!requireKey(res, 'OPENROUTER_API_KEY')) return;
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
    } catch (_) { /* use fallback */ }

    const data = await callOpenRouter([{
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
  "vibes": ["tag1","tag2","tag3"]
}`
    }], 512);

    const brand = parseJSON(getText(data));
    res.json({ brand });
  } catch (err) {
    console.error('/api/brand-analyze', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/generate-ideas ──────────────────────────────── */
app.post('/api/generate-ideas', async (req, res) => {
  try {
    if (!requireKey(res, 'OPENROUTER_API_KEY')) return;
    const { prompt, count, brand } = req.body;

    const data = await callOpenRouter([{
      role: 'user',
      content: `You are an elite social media creative director. Create exactly ${count} Instagram carousel post concepts for the brand below. Return ONLY valid JSON — no markdown.

Brand name: ${brand.name}
Brand vibe: ${(brand.vibes || []).join(', ')}
Brand colours: primary ${brand.primaryColor}, accent ${brand.accentColor}, background ${brand.bgColor || '#FFFFFF'}
Industry/campaign brief: ${prompt}

Return this JSON shape:
{
  "posts": [
    {
      "concept": "Compelling post headline — punchy, under 70 chars",
      "tags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
      "caption": "Full Instagram caption. 3-5 engaging sentences. Emojis. Call to action. Hashtags at end.",
      "slides": [
        {
          "type": "cover",
          "headline": "Short\\nHook",
          "sub": "Supporting subtitle, max 8 words",
          "emoji": "🎯",
          "imagePrompt": "see rules below"
        }
      ]
    }
  ]
}

Each post needs exactly 5 slides: cover → feature → [stat or feature] → lifestyle → cta

IMAGEPROMPT RULES — each imagePrompt must describe a complete professional Instagram marketing slide design (like a finished ad creative), NOT a photo. Include:
- Slide type purpose (cover hero / feature highlight / stat data / lifestyle scene / CTA action)
- Brand color palette: dominant ${brand.primaryColor}, accent ${brand.accentColor}
- Clean B2B/professional corporate style matching the brand vibe
- Specific visual composition: what imagery, layout, and graphic elements appear (product mockup, app screenshot style, industry equipment, abstract data graphic, bold typography layout, etc.)
- "Instagram square format, premium quality, social media ready"
- Keep under 220 chars. Do NOT mention text overlays or logos — describe only the visual design and imagery.`
    }]);

    const result = parseJSON(getText(data));
    res.json(result);
  } catch (err) {
    console.error('/api/generate-ideas', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/rewrite-caption ─────────────────────────────── */
app.post('/api/rewrite-caption', async (req, res) => {
  try {
    if (!requireKey(res, 'OPENROUTER_API_KEY')) return;
    const { concept, brand, currentCaption } = req.body;

    const data = await callOpenRouter([{
      role: 'user',
      content: `Rewrite this Instagram caption for ${brand.name}. Brand vibe: ${(brand.vibes || []).join(', ')}.

Post concept: ${concept}
Current caption: ${currentCaption}

Write a fresh, engaging caption. Keep the brand voice. Include 1-2 emojis. End with a CTA and 5 relevant hashtags. Return ONLY the caption text.`
    }], 512);

    res.json({ caption: getText(data).trim() });
  } catch (err) {
    console.error('/api/rewrite-caption', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/generate-image  (Fal AI — GPT Image 2) ──────── */
app.post('/api/generate-image', async (req, res) => {
  try {
    if (!requireKey(res, 'FAL_KEY')) return;
    const { prompt } = req.body;

    const r = await fetch('https://fal.run/openai/gpt-image-2', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Key ${process.env.FAL_KEY}`
      },
      body: JSON.stringify({
        prompt,
        image_size: 'square_hd',
        num_images: 1
      }),
      signal: AbortSignal.timeout(120_000)
    });

    // Read raw text first — Fal can return HTML error pages on bad routes
    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(_) { throw new Error(`Fal AI ${r.status} — ${raw.slice(0, 300)}`); }

    if (!r.ok || !data.images?.[0]?.url) {
      throw new Error(data.message || data.detail || data.error || `Fal AI ${r.status}: ${JSON.stringify(data)}`);
    }

    const imgRes = await fetch(data.images[0].url);
    const imgBuf = await imgRes.arrayBuffer();
    const mime   = imgRes.headers.get('content-type') || 'image/png';
    const b64    = Buffer.from(imgBuf).toString('base64');

    res.json({ imageUrl: `data:${mime};base64,${b64}` });
  } catch (err) {
    console.error('/api/generate-image', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/schedule  (Blotato → Instagram) ─────────────── */
app.post('/api/schedule', async (req, res) => {
  try {
    if (!requireKey(res, 'BLOTATO_API_KEY')) return;
    const { caption, images, scheduledAt } = req.body;

    const BLOTATO = 'https://api.blotato.com/v1';
    const AUTH    = { Authorization: `Bearer ${process.env.BLOTATO_API_KEY}` };

    const mediaIds = [];
    for (const imgData of images) {
      const base64 = imgData.replace(/^data:image\/\w+;base64,/, '');
      const buf    = Buffer.from(base64, 'base64');
      const form   = new FormData();
      form.append('file', new Blob([buf], { type: 'image/png' }), 'slide.png');
      if (process.env.BLOTATO_ACCOUNT_ID) form.append('account_id', process.env.BLOTATO_ACCOUNT_ID);

      const up = await fetch(`${BLOTATO}/media`, { method: 'POST', headers: AUTH, body: form });
      if (!up.ok) throw new Error(`Blotato media upload failed: ${await up.text()}`);
      const upData = await up.json();
      mediaIds.push(upData.id ?? upData.media_id ?? upData.mediaId);
    }

    const body = {
      platform:     'instagram',
      type:         'carousel',
      media_ids:    mediaIds,
      caption,
      scheduled_at: scheduledAt
    };
    if (process.env.BLOTATO_ACCOUNT_ID) body.account_id = process.env.BLOTATO_ACCOUNT_ID;

    const post = await fetch(`${BLOTATO}/posts`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const postData = await post.json();
    if (!post.ok) throw new Error(postData.error || postData.message || 'Blotato schedule failed');
    res.json({ success: true, id: postData.id });
  } catch (err) {
    console.error('/api/schedule', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Start ──────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Gen Social  →  http://localhost:${PORT}\n`);
  const services = {
    'OpenRouter → Claude':       !!process.env.OPENROUTER_API_KEY,
    'Fal AI → FLUX Pro':         !!process.env.FAL_KEY,
    'Blotato (scheduling)':      !!process.env.BLOTATO_API_KEY,
    'Auth configured':           !!(process.env.AUTH_USER && process.env.AUTH_PASS)
  };
  for (const [k, v] of Object.entries(services))
    console.log(`  ${v ? '✓' : '✗'} ${k}`);
  console.log('');
});
