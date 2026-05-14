import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all visits from the list
    const rawVisits = await kv.lrange('visits', 0, -1);
    const visits = rawVisits.map((v) => (typeof v === 'string' ? JSON.parse(v) : v));

    // Try to enrich with duration data from individual keys
    const enriched = await Promise.all(
      visits.map(async (visit) => {
        try {
          const updated = await kv.get(`visit:${visit.id}`);
          if (updated) {
            const parsed = typeof updated === 'string' ? JSON.parse(updated) : updated;
            return { ...visit, duration: parsed.duration || visit.duration };
          }
        } catch {
          // Fall through to original visit
        }
        return visit;
      })
    );

    return res.status(200).json({ visits: enriched });
  } catch (err) {
    console.error('Visits error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
