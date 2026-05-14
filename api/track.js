import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, visitId, duration } = req.body || {};
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const city = req.headers['x-vercel-ip-city'] || '';
    const region = req.headers['x-vercel-ip-country-region'] || '';
    const country = req.headers['x-vercel-ip-country'] || '';

    if (type === 'pageload') {
      if (!visitId) {
        return res.status(400).json({ error: 'Missing visitId' });
      }

      const location = [city, region, country].filter(Boolean).join(', ');

      const visit = {
        id: visitId,
        ip,
        userAgent,
        location,
        timestamp: new Date().toISOString(),
        duration: 0,
      };

      // Store the visit in a Redis list and a hash for quick lookup
      await kv.lpush('visits', JSON.stringify(visit));
      await kv.set(`visit:${visitId}`, JSON.stringify(visit));

      // Cap list at 10,000 entries
      await kv.ltrim('visits', 0, 9999);

      return res.status(200).json({ ok: true });
    }

    if (type === 'duration') {
      if (!visitId || typeof duration !== 'number') {
        return res.status(400).json({ error: 'Missing visitId or duration' });
      }

      // Update the visit record in the hash
      const raw = await kv.get(`visit:${visitId}`);
      if (raw) {
        const visit = typeof raw === 'string' ? JSON.parse(raw) : raw;
        visit.duration = Math.round(duration);
        await kv.set(`visit:${visitId}`, JSON.stringify(visit), { ex: 86400 });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid type' });
  } catch (err) {
    console.error('Track error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
