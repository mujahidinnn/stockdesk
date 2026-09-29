import { timingSafeEqual } from 'node:crypto';

// Vercel Cron pings every 3 days to avoid Supabase free-tier's 7-day inactivity pause.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Skipped when CRON_SECRET is unset (local dev); required in production.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.VERCEL_ENV === 'production') {
    return res.status(500).json({ error: 'CRON_SECRET is not configured' });
  }
  const given = Buffer.from(String(req.headers['authorization'] ?? ''));
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  if (cronSecret && (given.length !== expected.length || !timingSafeEqual(given, expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Missing Supabase environment variables' });
  }

  try {
    // RLS may return zero rows for anon; the query still counts as DB activity.
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });

    if (!response.ok) {
      throw new Error(`Supabase responded with status: ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Supabase successfully kept alive via Vite/Vercel API!',
      timestamp: new Date().toISOString(),
      dataCount: data.length,
    });
  } catch (error) {
    console.error('Keep-alive ping failed:', error.message);
    return res.status(500).json({ success: false, error: 'Keep-alive ping failed' });
  }
}
