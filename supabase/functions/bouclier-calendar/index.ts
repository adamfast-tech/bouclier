// Bouclier : flux iCalendar de la prochaine piqûre de Xolair.
// Abonnement depuis l'iPhone : webcal://<projet>.supabase.co/functions/v1/bouclier-calendar?t=<jeton>
// Le jeton (uuid aléatoire, régénérable dans l'app) remplace l'authentification : verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP = 'https://adamfast-tech.github.io/bouclier/';
const DAY = 864e5;
const p = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
const txt = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const enc = new TextEncoder();
function fold(line: string): string {
  if (enc.encode(line).length <= 74) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const alarm = (trigger: string, msg: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(msg), 'TRIGGER:' + trigger, 'END:VALARM'];

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405 });
  const t = (new URL(req.url).searchParams.get('t') || '').replace(/\.ics$/i, '');
  if (!UUID.test(t)) return new Response('Lien invalide', { status: 404 });
  const { data, error } = await sb.rpc('xolair_calendar_feed', { p_token: t });
  if (error) return new Response('Erreur temporaire', { status: 503 });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return new Response('Lien expiré', { status: 404 });

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bouclier//Xolair//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Bouclier · Xolair', 'X-WR-TIMEZONE:Europe/Paris', 'X-APPLE-CALENDAR-COLOR:#E2537A',
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H', ...VTZ,
  ];
  if (row.last_day) {
    const due = new Date(new Date(row.last_day + 'T00:00:00Z').getTime() + row.interval_days * DAY);
    const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now) + 'T00:00:00Z');
    const late = Math.round((today.getTime() - due.getTime()) / DAY);
    const day = late > 0 ? today : due;
    const h = Math.min(23, Math.max(0, row.reminder_hour ?? 19));
    const n = (row.n_done || 0) + 1;
    L.push(
      'BEGIN:VEVENT',
      'UID:bouclier-' + t + '-' + ymd(due) + '@adamfast-tech.github.io',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=Europe/Paris:' + ymd(day) + 'T' + p(h) + '0000',
      'DTEND;TZID=Europe/Paris:' + ymd(day) + 'T' + p(h) + '2000',
      'SUMMARY:' + txt(late > 0 ? '💉 Xolair · en retard de ' + late + ' j' : '💉 Piqûre de Xolair n°' + n),
      'DESCRIPTION:' + txt('Sors le stylo du frigo 30 minutes avant.\nOuvre Bouclier pour être guidée et enregistrer la piqûre : ' + APP),
      'URL:' + APP,
      'TRANSP:OPAQUE',
      ...(late > 0 ? [] : alarm('-P1D', 'Demain : piqûre de Xolair 🛡️')),
      ...alarm('-PT40M', 'Sors le stylo de Xolair du frigo'),
      ...alarm('PT0M', 'C’est l’heure de la piqûre de Xolair 💉'),
      'END:VEVENT',
    );
  }
  L.push('END:VCALENDAR');
  return new Response(req.method === 'HEAD' ? null : L.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="xolair.ics"',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
