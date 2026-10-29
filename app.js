/* Bouclier — suivi des injections de Xolair. HTML/CSS/JS vanilla, comptes Supabase partagés avec les académies. */
(() => {
'use strict';
const CFG = window.BOUCLIER_SUPABASE;
const DAY = 864e5;
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app'), tabbar = $('#tabbar'), layer = $('#layer');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get(k, d) { try { const v = localStorage.getItem('bouclier.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bouclier.' + k, JSON.stringify(v)); } catch (e) {} } };

const SITES = {
  'ventre-g': 'Ventre gauche', 'ventre-d': 'Ventre droit', 'cuisse-g': 'Cuisse gauche',
  'cuisse-d': 'Cuisse droite', 'bras-g': 'Bras gauche', 'bras-d': 'Bras droit'
};
const GIVERS = { elle: 'Toute seule', partenaire: 'Par son/sa partenaire', medecin: 'Par le médecin', infirmier: 'Par un·e infirmier·e', autre: 'Autre personne' };
const GIVER_SHORT = { elle: 'Toute seule 💪', partenaire: 'Partenaire', medecin: 'Médecin', infirmier: 'Infirmier·e', autre: 'Autre' };
const PAIN = ['😌', '🙂', '😐', '😣', '😖'];
const FEEL = ['😢', '😟', '😐', '😊', '🤩'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WD = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const S = {
  sb: null, user: null, profile: null, ready: false, loading: false, offline: false,
  owner: null, settings: null, list: [], shares: [], tab: 'home', authMode: 'login', busy: false
};

/* ---------- Utilitaires de dates ---------- */
const d0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmtDate = (d) => { d = new Date(d); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtShort = (d) => { d = new Date(d); return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
const fmtTime = (d) => { d = new Date(d); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };
const toLocalInput = (d) => { d = new Date(d); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const daysBetween = (a, b) => Math.round((d0(b) - d0(a)) / DAY);

/* ---------- Calculs ---------- */
function isMine() { return S.user && S.owner === S.user.id; }
function ownerLabel() {
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  if (isMine()) return (S.settings && S.settings.display_name) || cap(S.profile && S.profile.username) || 'toi';
  const sh = S.shares.find((x) => x.owner_id === S.owner);
  return (S.settings && S.settings.display_name) || (sh && (sh.owner_display || sh.owner_name)) || 'son suivi';
}
function cfg() { return Object.assign({ interval_days: 28, dose_mg: 300, display_name: '', reminder_hour: 19, pens_left: null, cal_token: null }, S.settings || {}); }
function sorted() { return S.list.slice().sort((a, b) => new Date(a.done_at) - new Date(b.done_at)); }
// Numéro de la piqûre en comptant aussi les manquées (« la 6ᵉ »)
function slotOf(x) { return sorted().findIndex((y) => y.id === x.id) + 1; }
const CAL_HOST = (window.BOUCLIER_SUPABASE && window.BOUCLIER_SUPABASE.url || '').replace(/^https:\/\//, '');
const calUrl = (scheme) => { const t = cfg().cal_token; return t ? scheme + '://' + CAL_HOST + '/functions/v1/bouclier-calendar?t=' + t : null; };
const calSubscribed = () => !!LS.get('calsub:' + S.owner, false);
function done() { return sorted().filter((x) => x.status === 'faite'); }
function nextInfo() {
  const d = done(), c = cfg();
  if (!d.length) return { none: true };
  const last = d[d.length - 1];
  const next = new Date(d0(last.done_at).getTime() + c.interval_days * DAY);
  const left = daysBetween(new Date(), next);
  const elapsed = c.interval_days - left;
  return { last, next, left, ratio: Math.max(0, Math.min(1, elapsed / c.interval_days)) };
}
function suggestSite() {
  const d = done().filter((x) => x.site);
  const last = d.length ? d[d.length - 1].site : null;
  if (!last) return 'ventre-g';
  const [area, side] = last.split('-');
  return area + '-' + (side === 'g' ? 'd' : 'g');
}
function stats() {
  const all = sorted(), d = done(), c = cfg();
  const solo = d.filter((x) => x.given_by === 'elle').length;
  const missed = all.filter((x) => x.status === 'manquee').length;
  let onTime = 0, gaps = 0, run = 0, best = 0;
  for (let i = 1; i < d.length; i++) {
    const g = daysBetween(d[i - 1].done_at, d[i].done_at); gaps++;
    if (g <= c.interval_days + 3) { onTime++; run++; best = Math.max(best, run); } else run = 0;
  }
  // série en cours : injections faites d'affilée, sans « manquée » entre elles et à l'heure
  let streak = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const x = all[i]; if (x.status !== 'faite') break;
    const prev = all.slice(0, i).reverse().find((y) => y.status === 'faite');
    streak++;
    if (prev && daysBetween(prev.done_at, x.done_at) > c.interval_days + 3) break;
  }
  const pains = d.filter((x) => x.pain != null).map((x) => x.pain);
  const span = d.length > 1 ? daysBetween(d[0].done_at, d[d.length - 1].done_at) : 0;
  const siteCount = {}; d.forEach((x) => { if (x.site) siteCount[x.site] = (siteCount[x.site] || 0) + 1; });
  return { total: d.length, solo, missed, regularity: gaps ? Math.round(onTime / gaps * 100) : null, streak, best: Math.max(best + (best ? 1 : 0), streak), pains, span, siteCount, painZero: pains.includes(0), team: d.some((x) => x.given_by === 'partenaire') };
}
const BADGES = [
  { id: 'premiere', ic: '🌱', t: 'Première piqûre', s: '1 injection', ok: (s) => s.total >= 1 },
  { id: 'solo', ic: '🦸‍♀️', t: 'Toute seule !', s: '1ʳᵉ en solo', ok: (s) => s.solo >= 1 },
  { id: 'solo3', ic: '🔥', t: 'Pro du stylo', s: '3 en solo', ok: (s) => s.solo >= 3 },
  { id: 'equipe', ic: '🤝', t: 'Équipe', s: 'Faite à deux', ok: (s) => s.team },
  { id: 'serie3', ic: '🎯', t: 'Pile à l’heure', s: '3 d’affilée', ok: (s) => s.streak >= 3 },
  { id: 'zen', ic: '🧘‍♀️', t: 'Zen', s: 'Zéro douleur', ok: (s) => s.painZero },
  { id: 'six', ic: '🛡️', t: 'Bouclier', s: '6 injections', ok: (s) => s.total >= 6 },
  { id: 'douze', ic: '👑', t: 'Reine', s: '12 injections', ok: (s) => s.total >= 12 },
  { id: 'annee', ic: '🎂', t: 'Un an', s: '365 jours', ok: (s) => s.span >= 365 }
];
const unlocked = () => { const s = stats(); return BADGES.filter((b) => b.ok(s)).map((b) => b.id); };

/* ---------- Icônes ---------- */
const IC = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 15h3"/></svg>',
  prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg>',
  set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>'
};
const shieldSVG = (id = 'sg') => `<svg viewBox="0 0 100 104" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7875F"/><stop offset=".55" stop-color="#E2537A"/><stop offset="1" stop-color="#8C4E9E"/></linearGradient></defs><path d="M50 4 90 18v30c0 26-17 44-40 52C27 92 10 74 10 48V18Z" fill="url(#${id})"/><path d="M50 4 90 18v30c0 26-17 44-40 52Z" fill="#fff" opacity=".12"/><path d="M50 72c-11-8-19-15-19-24 0-6 4-10 9.5-10 4 0 7 2.4 9.5 6 2.5-3.6 5.5-6 9.5-6C64.5 38 69 42 69 48c0 9-8 16-19 24Z" fill="#fff"/></svg>`;

/* ---------- Toast & confettis ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), ctx = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const cols = ['#F27F5B', '#E2537A', '#8C4E9E', '#F0BC5A', '#5CCB9E', '#FFFFFF'];
  const P = Array.from({ length: 170 }, (_, i) => ({
    x: innerWidth / 2 + (Math.random() - .5) * 60, y: innerHeight * .38,
    vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 4, s: Math.random() * 7 + 4,
    r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length], shape: i % 3
  }));
  let f = 0;
  (function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach((p) => {
      p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - f / 200);
      if (p.shape === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.6, 0, 6.3); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0, -p.s / 2); ctx.lineTo(p.s / 2, p.s / 2); ctx.lineTo(-p.s / 2, p.s / 2); ctx.fill(); }
      ctx.restore();
    });
    if (++f < 210) requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

/* ---------- Supabase ---------- */
function authErr(e) {
  const m = (e && (e.message || e.error_description)) || String(e || '');
  if (/invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse e-mail (lien reçu par mail).';
  if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/password.*(at least|characters)/i.test(m)) return 'Mot de passe trop court (8 caractères minimum).';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Pas de connexion Internet.';
  return m || 'Une erreur est survenue.';
}
async function init() {
  if (!CFG || !window.supabase) { app.innerHTML = '<div class="empty"><div class="ic">📡</div><p>Impossible de charger l’application. Vérifie ta connexion.</p></div>'; return; }
  S.sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'academie-auth' } });
  S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { S.authMode = 'newpass'; }
    const u = session ? session.user : null, was = S.user && S.user.id;
    S.user = u;
    if (u && u.id !== was) setTimeout(onLogin, 0);
    else if (!u && was) setTimeout(() => { S.owner = null; S.list = []; S.settings = null; S.shares = []; render(); }, 0);
  });
  const { data } = await S.sb.auth.getSession();
  S.ready = true;
  if (!data.session) render();
}
async function onLogin() {
  if (S.authMode === 'newpass') { render(); return; }
  S.loading = true; render();
  try {
    const [p, sh] = await Promise.all([
      S.sb.from('profiles').select('username').eq('id', S.user.id).maybeSingle(),
      S.sb.rpc('xolair_share_list')
    ]);
    S.profile = p.data || null; S.shares = sh.data || [];
    const saved = LS.get('owner:' + S.user.id, null);
    const shared = S.shares.filter((x) => x.member_id === S.user.id).map((x) => x.owner_id);
    S.owner = saved && (saved === S.user.id || shared.includes(saved)) ? saved : S.user.id;
    await loadOwner();
    if (isMine() && !S.list.length && shared.length && !saved) { S.owner = shared[0]; await loadOwner(); }
  } catch (e) { S.offline = true; restoreCache(); }
  S.loading = false; render();
}
async function loadOwner() {
  const [st, inj] = await Promise.all([
    S.sb.from('xolair_settings').select('*').eq('owner_id', S.owner).maybeSingle(),
    S.sb.from('xolair_injections').select('*').eq('owner_id', S.owner).order('done_at', { ascending: true })
  ]);
  if (inj.error) throw inj.error;
  S.settings = st.data || null; S.list = inj.data || []; S.offline = false;
  LS.set('cache:' + S.owner, { settings: S.settings, list: S.list });
}
function restoreCache() { const c = LS.get('cache:' + (S.owner || (S.user && S.user.id)), null); if (c) { S.owner = S.owner || S.user.id; S.settings = c.settings; S.list = c.list || []; } }
async function refresh() { if (!S.user || !S.owner) return; try { await loadOwner(); render(true); } catch (e) { S.offline = true; } }
async function saveSettings(patch) {
  const c = Object.assign({}, cfg(), patch);
  const row = { owner_id: S.user.id, display_name: c.display_name || null, interval_days: c.interval_days, dose_mg: c.dose_mg, reminder_hour: c.reminder_hour, updated_at: new Date().toISOString() };
  const r = await S.sb.from('xolair_settings').upsert(row).select().maybeSingle();
  if (r.error) throw r.error;
  S.settings = r.data; LS.set('cache:' + S.owner, { settings: S.settings, list: S.list });
}
async function saveInjection(row, id) {
  const clean = { owner_id: S.owner, done_at: row.done_at, status: row.status, dose_mg: row.status === 'faite' ? row.dose_mg : null, site: row.status === 'faite' ? row.site || null : null, given_by: row.status === 'faite' ? row.given_by || null : null, pain: row.status === 'faite' ? row.pain : null, feeling: row.feeling, notes: (row.notes || '').slice(0, 1000) || null };
  const q = id ? S.sb.from('xolair_injections').update(clean).eq('id', id) : S.sb.from('xolair_injections').insert(clean);
  const r = await q.select().single();
  if (r.error) throw r.error;
  if (id) S.list = S.list.map((x) => (x.id === id ? r.data : x)); else S.list.push(r.data);
  LS.set('cache:' + S.owner, { settings: S.settings, list: S.list });
  return r.data;
}
async function setPens(v) {
  const r = await S.sb.rpc('xolair_pens_set', { p_owner: S.owner, p_value: v });
  if (r.error) throw r.error;
  S.settings = Object.assign({}, S.settings || { owner_id: S.owner }, { pens_left: r.data });
  LS.set('cache:' + S.owner, { settings: S.settings, list: S.list });
  return r.data;
}
async function calInit() {
  const r = await S.sb.rpc('xolair_cal_reset');
  if (r.error) throw r.error;
  await loadOwner();
}

/* ---------- Rendu ---------- */
function render(soft) {
  if (!S.ready) return;
  if (!S.user || S.authMode === 'newpass') { tabbar.hidden = true; app.innerHTML = authView(); return; }
  if (S.loading) { tabbar.hidden = true; app.innerHTML = '<div class="skel" style="margin-top:80px"></div><div class="skel" style="margin-top:14px;height:90px"></div>'; return; }
  tabbar.hidden = false; tabbar.innerHTML = tabs();
  const v = { home: homeView, hist: histView, prog: progView, set: setView }[S.tab]();
  app.innerHTML = header() + `<section class="view${soft ? '' : ' stagger'}">${v}</section>`;
  setTimeout(() => { const p = $('.ring .prog'); if (p) p.style.strokeDashoffset = p.dataset.off; }, soft ? 0 : 60);
}
function tabs() {
  return [['home', 'Accueil'], ['hist', 'Historique'], ['prog', 'Progrès'], ['set', 'Profil']]
    .map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}" aria-label="${l}">${IC[k]}${l}</button>`).join('');
}
function header() {
  const shared = S.shares.filter((x) => x.member_id === S.user.id);
  const h = new Date().getHours();
  const hi = h < 6 ? 'Bonne nuit' : h < 18 ? 'Coucou' : 'Bonsoir';
  const titles = { home: (isMine() ? hi + ' ' : 'Suivi de ') + esc(ownerLabel()), hist: 'Historique', prog: 'Progrès', set: 'Profil' };
  const pick = shared.length ? `<label class="who">👁️<select data-owner aria-label="Suivi affiché"><option value="${S.user.id}"${isMine() ? ' selected' : ''}>Mon suivi</option>${shared.map((x) => `<option value="${x.owner_id}"${S.owner === x.owner_id ? ' selected' : ''}>${esc(x.owner_display || x.owner_name || 'Partagé')}</option>`).join('')}</select></label>` : '';
  return `<header class="top"><div class="hello"><small>${S.offline ? 'Hors ligne · ' : ''}${esc(fmtDate(new Date()))}</small><h1>${titles[S.tab]}</h1></div>${pick}</header>`;
}

function ring(n) {
  const R = 96, C = 2 * Math.PI * R;
  const off = C * (1 - (n.none ? 0 : n.ratio));
  return `<div class="ring">${n.left <= 0 && !n.none ? '<div class="pulse"></div>' : ''}<svg viewBox="0 0 228 228"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7875F"/><stop offset=".55" stop-color="#E2537A"/><stop offset="1" stop-color="#8C4E9E"/></linearGradient></defs><circle class="track" cx="114" cy="114" r="${R}" fill="none" stroke-width="16"/><circle class="prog" cx="114" cy="114" r="${R}" fill="none" stroke-width="16" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${off}"/></svg><div class="center">${n.none ? `<div style="width:96px">${shieldSVG('hs')}</div>` : n.left > 0 ? `<div class="num">${n.left}</div><div class="unit">jour${n.left > 1 ? 's' : ''} restant${n.left > 1 ? 's' : ''}</div>` : n.left === 0 ? `<div class="num">0</div><div class="unit">c’est aujourd’hui</div>` : `<div class="num">+${-n.left}</div><div class="unit">jour${n.left < -1 ? 's' : ''} de retard</div>`}</div></div>`;
}
function homeView() {
  const n = nextInfo(), st = stats(), c = cfg();
  let when, sub, pill;
  if (n.none) { when = 'Prête pour le suivi ?'; sub = 'Enregistre ta prochaine piqûre ou ajoute les précédentes.'; pill = ''; }
  else {
    when = 'Prochaine : ' + fmtDate(n.next);
    sub = 'Dernière le ' + fmtShort(n.last.done_at) + ' · tous les ' + c.interval_days + ' jours';
    pill = n.left > 3 ? `<span class="pill ok">Tout roule ✨</span>` : n.left > 0 ? `<span class="pill gold">Bientôt 🗓️</span>` : n.left === 0 ? `<span class="pill gold">C’est le jour J 💉</span>` : `<span class="pill warn">En retard · pense à ton médecin si besoin</span>`;
  }
  const last = n.none ? null : n.last;
  const readyBtn = n.none || n.left <= 3;
  return `
  <div class="card hero">${ring(n)}<div class="when">${when}</div><div class="sub">${sub}</div><div style="margin-top:10px">${pill}</div>
    <div class="btns"><button class="btn ${readyBtn ? 'primary' : 'ghost'}" data-act="flow">💉 ${isMine() ? 'Je fais ma piqûre' : 'Enregistrer une piqûre'}</button></div>
  </div>
  <div class="grid2">
    <div class="stat accent"><b>${st.total}</b><span>injection${st.total > 1 ? 's' : ''} faite${st.total > 1 ? 's' : ''}</span></div>
    <div class="stat"><b>${st.solo}</b><span>toute seule 💪</span></div>
  </div>
  ${pensCard(n)}
  ${last ? `<div class="card"><div class="row between"><h2 style="margin:0">Dernière piqûre</h2><span class="pill">n°${slotOf(last)}</span></div>
    <p class="muted" style="margin:6px 0 0">${esc(fmtDate(last.done_at))} à ${fmtTime(last.done_at)}</p>
    <div class="chips">${last.site ? `<span class="pill">📍 ${SITES[last.site]}</span>` : ''}${last.given_by ? `<span class="pill">${GIVER_SHORT[last.given_by]}</span>` : ''}${last.dose_mg ? `<span class="pill">${last.dose_mg} mg</span>` : ''}${last.pain != null ? `<span class="pill">Douleur ${PAIN[last.pain]}</span>` : ''}</div>
    <p class="muted" style="margin:10px 0 0">Prochain site conseillé : <b style="color:var(--mint)">${SITES[suggestSite()]}</b></p></div>` : ''}
  <div class="card"><div class="btns" style="margin:0">
    ${calSubscribed() ? `<div class="pill ok" style="justify-content:center;min-height:44px">🔔 Rappels actifs dans le calendrier</div>` : `<button class="btn ghost" data-act="cal">🔔 Activer les rappels sur l’iPhone</button>`}
    <button class="btn ghost" data-act="add">➕ Ajouter une ancienne piqûre</button>
  </div></div>
  <a class="sos" href="tel:112">🚨 Réaction grave : adrénaline si elle est prescrite, puis appeler le 15 ou le 112</a>`;
}
function pensCard(n) {
  if (!isMine() && !S.settings) return '';
  const c = cfg(), p = c.pens_left;
  let sub, cls = '';
  if (p == null) sub = 'Indique combien il t’en reste.';
  else if (p === 0) { sub = 'Plus aucun stylo : ordonnance et pharmacie avant la prochaine.'; cls = ' low'; }
  else if (p === 1) { sub = 'Dernier stylo : pense à en racheter.'; cls = ' low'; }
  else sub = n && !n.none ? 'Couverte jusqu’au ' + fmtShort(new Date(n.next.getTime() + (p - 1) * c.interval_days * DAY)) : p + ' piqûres d’avance';
  return `<div class="card pens${cls}"><div class="row between"><div><h2 style="margin:0">🧊 Stylos au frigo</h2><p class="muted" style="margin:4px 0 0;font-size:.88rem">${sub}</p></div>
    <div class="stepper"><button data-pens="-1" aria-label="Un stylo de moins">−</button><b>${p == null ? '–' : p}</b><button data-pens="1" aria-label="Un stylo de plus">+</button></div></div></div>`;
}

function histView() {
  const all = sorted();
  if (!all.length) return `<div class="card empty"><div class="ic">🗓️</div><p>Aucune piqûre enregistrée pour l’instant.</p><button class="btn primary" data-act="add">Ajouter la première</button></div>`;
  const numbered = all.map((x, i) => ({ x, n: i + 1 })).reverse();
  let html = `<button class="btn ghost" data-act="add" style="margin-bottom:6px">➕ Ajouter une piqûre passée ou manquée</button>`, cur = '';
  numbered.forEach(({ x, n }) => {
    const d = new Date(x.done_at), m = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (m !== cur) { html += (cur ? '</div>' : '') + `<div class="month">${m}</div><div class="tl">`; cur = m; }
    html += x.status === 'manquee'
      ? `<button class="entry missed" data-edit="${x.id}"><div class="row between"><div class="t">Piqûre manquée</div><div class="n" style="color:var(--muted)">n°${n}</div></div><div class="m">${esc(fmtDate(x.done_at))}${x.notes ? ' · ' + esc(x.notes) : ''}</div></button>`
      : `<button class="entry" data-edit="${x.id}"><div class="row between"><div class="t">${esc(fmtDate(x.done_at))}</div><div class="n">n°${n}</div></div><div class="m">${fmtTime(x.done_at)}${x.dose_mg ? ' · ' + x.dose_mg + ' mg' : ''}</div><div class="chips">${x.site ? `<span class="pill">📍 ${SITES[x.site]}</span>` : ''}${x.given_by ? `<span class="pill${x.given_by === 'elle' ? ' ok' : ''}">${GIVER_SHORT[x.given_by]}</span>` : ''}${x.pain != null ? `<span class="pill">Douleur ${PAIN[x.pain]}</span>` : ''}${x.feeling != null ? `<span class="pill">Moral ${FEEL[x.feeling]}</span>` : ''}</div>${x.notes ? `<div class="m" style="margin-top:6px">“${esc(x.notes)}”</div>` : ''}</button>`;
  });
  return html + '</div>';
}

function bodyMap(opts) {
  const z = { 'bras-d': [46, 98, 8, 15], 'bras-g': [154, 98, 8, 15], 'ventre-d': [84, 128, 12, 10], 'ventre-g': [116, 128, 12, 10], 'cuisse-d': [79, 196, 11, 19], 'cuisse-g': [121, 196, 11, 19] };
  const max = Math.max(1, ...Object.values(opts.heat || {}));
  const zones = Object.entries(z).map(([k, [cx, cy, rx, ry]]) => {
    const cls = ['zone', opts.sel === k ? 'sel' : '', opts.sug === k ? 'sug' : '', opts.last === k ? 'last' : ''].join(' ');
    const heat = opts.heat ? `<ellipse class="heat" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="var(--rose)" opacity="${((opts.heat[k] || 0) / max * .85).toFixed(2)}"/>` : '';
    const lbl = opts.heat ? `<text x="${cx}" y="${cy + 3}" style="fill:var(--ink)">${opts.heat[k] || 0}</text>` : '';
    return `<ellipse class="${cls}" data-site="${opts.pick ? k : ''}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"><title>${SITES[k]}</title></ellipse>${heat}${lbl}`;
  }).join('');
  return `<svg class="body-map" viewBox="0 0 200 296" role="img" aria-label="Sites d’injection">
    <circle class="sil" cx="100" cy="32" r="19"/><rect class="sil" x="92" y="48" width="16" height="12" rx="4"/>
    <path class="sil" d="M62 64Q100 54 138 64L146 152Q100 168 54 152Z"/>
    <path class="sil" d="M62 66Q44 72 40 110L33 168Q37 176 46 172L57 116Z"/><path class="sil" d="M138 66Q156 72 160 110L167 168Q163 176 154 172L143 116Z"/>
    <path class="sil" d="M58 152Q78 162 98 160L93 282Q83 290 73 282Z"/><path class="sil" d="M142 152Q122 162 102 160L107 282Q117 290 127 282Z"/>
    <circle cx="100" cy="124" r="1.8" fill="var(--muted)"/>
    ${zones}
    <text x="30" y="70">Droite</text><text x="170" y="70">Gauche</text>
  </svg>`;
}

function spark(vals) {
  if (vals.length < 2) return '<p class="muted" style="margin:0">Encore quelques piqûres pour voir la courbe.</p>';
  const v = vals.slice(-10), W = 300, H = 70, pad = 8;
  const pts = v.map((y, i) => [pad + i * (W - 2 * pad) / (v.length - 1), pad + (y / 4) * (H - 2 * pad)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="sp" x1="0" x2="1"><stop offset="0" stop-color="#F7875F"/><stop offset="1" stop-color="#8C4E9E"/></linearGradient></defs><path d="${d}" fill="none" stroke="url(#sp)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--surface)" stroke="var(--rose)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}</svg><div class="emo-l"><span>Haut = sans douleur ${PAIN[0]}</span><span>${v.length} dernières</span></div>`;
}
function progView() {
  const s = stats(), un = unlocked();
  return `
  <div class="grid2">
    <div class="stat accent"><b>${s.total}</b><span>injections</span></div>
    <div class="stat"><b>${s.regularity == null ? '—' : s.regularity + '%'}</b><span>à l’heure</span></div>
    <div class="stat"><b>${s.streak}</b><span>série en cours 🔥</span></div>
    <div class="stat"><b>${s.missed}</b><span>manquée${s.missed > 1 ? 's' : ''}</span></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row between"><h2 style="margin:0">Badges</h2><span class="pill gold">${un.length}/${BADGES.length}</span></div><div class="badges" style="margin-top:12px">${BADGES.map((b) => `<div class="badge${un.includes(b.id) ? ' on' : ''}"><div class="ic">${b.ic}</div><b>${b.t}</b><small>${b.s}</small></div>`).join('')}</div></div>
  <div class="card"><h2>Douleur ressentie</h2>${spark(s.pains)}</div>
  <div class="card"><h2>Sites utilisés</h2>${bodyMap({ heat: s.siteCount })}<p class="muted" style="text-align:center;margin:4px 0 0;font-size:.85rem">Varier les sites limite les irritations.</p></div>`;
}

function setView() {
  const c = cfg(), mine = isMine();
  const members = S.shares.filter((x) => x.owner_id === S.user.id);
  const owners = S.shares.filter((x) => x.member_id === S.user.id);
  const name = (S.profile && S.profile.username) || S.user.email;
  return `
  <div class="card"><div class="row"><div style="width:52px;flex:none">${shieldSVG('ps')}</div><div><b>${esc(name)}</b><div class="muted" style="font-size:.88rem">${esc(S.user.email)}</div><div class="muted" style="font-size:.78rem">Même compte que l’Académie</div></div></div></div>
  ${mine ? `<div class="card"><h2>Mon traitement</h2>
    <form data-form="settings">
      <label class="f" for="dn">Prénom affiché</label><input class="in" id="dn" name="display_name" maxlength="40" value="${esc(c.display_name || '')}" placeholder="Savannah">
      <label class="f">Fréquence des injections</label>
      <div class="seg" data-seg="interval">${[28, 30].map((d) => `<button type="button" data-v="${d}" class="${c.interval_days === d ? 'on' : ''}">${d === 28 ? 'Toutes les 4 semaines' : 'Tous les 30 jours'}</button>`).join('')}</div>
      <input class="in" style="margin-top:8px" type="number" inputmode="numeric" name="interval_days" min="7" max="90" value="${c.interval_days}" aria-label="Intervalle en jours">
      <div class="grid2"><div><label class="f" for="dz">Dose (mg)</label><input class="in" id="dz" type="number" inputmode="numeric" name="dose_mg" min="75" max="600" step="75" value="${c.dose_mg}"></div>
      <div><label class="f" for="rh">Heure du rappel</label><select class="in" id="rh" name="reminder_hour">${Array.from({ length: 17 }, (_, i) => i + 6).map((h) => `<option value="${h}"${c.reminder_hour === h ? ' selected' : ''}>${h}h00</option>`).join('')}</select></div></div>
      <button class="btn primary" style="margin-top:16px" type="submit">Enregistrer</button>
      <p class="note">La fréquence et la dose sont celles prescrites par ton médecin : l’app ne fait que les suivre.</p>
    </form></div>
  <div class="card"><h2>Partager mon suivi</h2><p class="muted" style="margin:0 0 10px;font-size:.92rem">La personne voit tes piqûres et peut en ajouter. Elle doit avoir un compte (Académie ou Bouclier).</p>
    <form data-form="share" class="row"><input class="in" name="username" placeholder="Nom d’utilisateur" autocapitalize="none" autocorrect="off" required><button class="btn small primary" style="width:auto;min-height:50px" type="submit">Ajouter</button></form>
    <div style="margin-top:8px">${members.map((x) => `<div class="list-row"><span>👤 ${esc(x.member_name || 'Utilisateur')}</span><button class="btn small danger" style="width:auto" data-unshare="${x.owner_id}|${x.member_id}">Retirer</button></div>`).join('')}</div>
  </div>` : `<div class="card"><h2>Suivi partagé</h2><p class="muted" style="margin:0">Tu consultes le suivi de <b>${esc(ownerLabel())}</b>. Seule cette personne peut modifier les réglages du traitement.</p></div>`}
  ${calCard(mine)}
  ${owners.length ? `<div class="card"><h2>Partagés avec moi</h2>${owners.map((x) => `<div class="list-row"><span>🛡️ ${esc(x.owner_display || x.owner_name)}</span><button class="btn small danger" style="width:auto" data-unshare="${x.owner_id}|${x.member_id}">Quitter</button></div>`).join('')}</div>` : ''}
  <div class="card"><h2>Données</h2><div class="btns" style="margin:0">
    <button class="btn ghost" data-act="csv">⬇️ Exporter l’historique (CSV)</button>
    <button class="btn ghost" data-act="theme">🌗 Thème : ${({ auto: 'automatique', light: 'clair', dark: 'sombre' })[LS.get('theme', 'auto')]}</button>
    <button class="btn danger" data-act="logout">Se déconnecter</button>
  </div></div>
  <p class="muted" style="text-align:center;font-size:.78rem">Bouclier est un carnet de suivi. Il ne remplace pas l’avis de ton médecin.</p>`;
}

function calCard(mine) {
  const web = calUrl('webcal'), https = calUrl('https'), c = cfg();
  const body = web
    ? `<a class="btn primary" href="${web}" data-act="calsub">📅 S’abonner dans Calendrier</a>
      <p class="note">Sur l’écran d’abonnement, <b>désactive « Supprimer les alertes »</b> puis touche <b>Ajouter</b>. La prochaine piqûre se met ensuite à jour toute seule, avec 3 alertes : la veille, 40 min avant (sortir le stylo du frigo) et à ${c.reminder_hour}h00.</p>
      ${calSubscribed() ? '<p class="msg ok" style="text-align:center">✅ Abonnement fait sur cet appareil</p>' : ''}
      <a class="link" href="${https}" rel="noopener">Ajouter seulement la prochaine (sans abonnement)</a>
      ${mine ? '<button class="link" style="color:var(--muted)" data-act="calreset">Générer un nouveau lien (l’ancien s’arrête)</button>' : ''}`
    : mine ? `<button class="btn primary" data-act="calinit">🔔 Activer les rappels</button>`
      : `<p class="muted" style="margin:0">${esc(ownerLabel())} doit d’abord activer les rappels dans son profil.</p>`;
  return `<div class="card" id="rappels"><h2>Rappels sur l’iPhone 🔔</h2><p class="muted" style="margin:0 0 12px;font-size:.92rem">${mine ? 'Un calendrier « Bouclier » s’ajoute à l’app Calendrier.' : 'Reçois toi aussi les alertes de ' + esc(ownerLabel()) + ' dans ton calendrier.'}</p>${body}</div>`;
}

function authView() {
  const m = S.authMode;
  const forms = {
    login: `<form data-form="login"><label class="f" for="l">E-mail ou nom d’utilisateur</label><input class="in" id="l" name="login" autocomplete="username" autocapitalize="none" autocorrect="off" required>
      <label class="f" for="p">Mot de passe</label><input class="in" id="p" type="password" name="password" autocomplete="current-password" required>
      <button class="btn primary" style="margin-top:18px" type="submit">Se connecter</button><button type="button" class="link" data-auth="forgot">Mot de passe oublié ?</button></form>`,
    signup: `<form data-form="signup"><label class="f" for="u">Nom d’utilisateur</label><input class="in" id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" required>
      <label class="f" for="e">E-mail</label><input class="in" id="e" type="email" name="email" autocomplete="email" required>
      <label class="f" for="p1">Mot de passe (8 caractères min.)</label><input class="in" id="p1" type="password" name="password" autocomplete="new-password" required>
      <label class="f" for="p2">Confirmer</label><input class="in" id="p2" type="password" name="password2" autocomplete="new-password" required>
      <button class="btn primary" style="margin-top:18px" type="submit">Créer mon compte</button></form>`,
    forgot: `<form data-form="forgot"><label class="f" for="e">E-mail du compte</label><input class="in" id="e" type="email" name="email" required><button class="btn primary" style="margin-top:18px" type="submit">Recevoir un lien</button><button type="button" class="link" data-auth="login">Retour</button></form>`,
    newpass: `<form data-form="newpass"><label class="f" for="p1">Nouveau mot de passe</label><input class="in" id="p1" type="password" name="password" autocomplete="new-password" required><label class="f" for="p2">Confirmer</label><input class="in" id="p2" type="password" name="password2" autocomplete="new-password" required><button class="btn primary" style="margin-top:18px" type="submit">Valider</button></form>`
  };
  return `<section class="auth view"><div class="logo">${shieldSVG('lg')}</div><h1>Bouclier</h1><p class="tag">Le carnet de tes piqûres de Xolair.<br>Connecte-toi avec ton compte de l’Académie.</p>
    <div class="card">${m === 'login' || m === 'signup' ? `<div class="tabs"><button data-auth="login" class="${m === 'login' ? 'on' : ''}">Connexion</button><button data-auth="signup" class="${m === 'signup' ? 'on' : ''}">Créer un compte</button></div>` : ''}
    ${forms[m]}<div class="msg" id="amsg"></div></div></section>`;
}
const say = (t, ok) => { const e = $('#amsg') || $('#fmsg'); if (e) { e.textContent = t; e.className = 'msg ' + (ok ? 'ok' : 'err'); } };

/* ---------- Feuilles ---------- */
// mode : absent = nouvelle feuille (glisse depuis le bas) ; 'keep' = même écran rafraîchi sans animation ; 'swap' = nouvel écran dans la feuille ouverte
function openSheet(html, full, mode) {
  const ex = layer.querySelector('.sheet');
  if (mode && ex) {
    ex.classList.toggle('still', mode === 'keep'); ex.classList.toggle('full', !!full);
    ex.innerHTML = (full ? '' : '<div class="grab"></div>') + html;
    if (mode === 'swap') ex.scrollTop = 0;
    return;
  }
  layer.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet${full ? ' full' : ''}" role="dialog" aria-modal="true">${full ? '' : '<div class="grab"></div>'}${html}</div>`;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { layer.innerHTML = ''; document.body.style.overflow = ''; F = null; }

/* Parcours guidé */
let F = null;
const FLOW_STEPS = 5;
const FLOW_CHECKS = [
  ['frigo', 'Stylo sorti du frigo', '30 minutes avant, pour qu’il soit à température ambiante'],
  ['mains', 'Mains lavées', 'Eau et savon, puis bien sécher'],
  ['verif', 'Stylo vérifié', 'Date de péremption, liquide limpide, pas de dommage'],
  ['peau', 'Peau propre et prête', 'Désinfecte la zone et laisse sécher']
];
function startFlow() {
  F = { step: 0, checks: {}, site: suggestSite(), given_by: isMine() ? 'elle' : 'partenaire', pain: null, feeling: null, notes: '', when: toLocalInput(new Date()), dose: cfg().dose_mg, t: 0, timer: null };
  drawFlow();
}
function drawFlow() {
  const bar = `<div class="steps">${Array.from({ length: FLOW_STEPS }, (_, i) => `<i class="${i <= F.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = `<div class="sheet-h"><span class="pill">Étape ${F.step + 1}/${FLOW_STEPS}</span><button class="x" data-close aria-label="Fermer">✕</button></div>${bar}`;
  const nav = (next, label = 'Continuer', dis = false) => `<div class="btns"><button class="btn primary" data-flow="${next}"${dis ? ' disabled' : ''}>${label}</button>${F.step ? '<button class="btn ghost" data-flow="back">Retour</button>' : ''}</div>`;
  const checks = FLOW_CHECKS;
  const allChecked = checks.every(([k]) => F.checks[k]);
  let body = '';
  if (F.step === 0) body = `<div class="step"><h2>On se prépare 🧴</h2><p class="muted">Coche au fur et à mesure.</p>${checks.map(([k, t, s]) => `<button class="check${F.checks[k] ? ' on' : ''}" data-check="${k}"><span class="box">${IC.check}</span><span>${t}<small>${s}</small></span></button>`).join('')}${nav(1, allChecked ? 'Tout est prêt' : 'Continuer', !allChecked)}</div>`;
  else if (F.step === 1) {
    const d = done().filter((x) => x.site), last = d.length ? d[d.length - 1].site : null;
    body = `<div class="step"><h2>Où piquer ? 📍</h2><p class="muted">Touche une zone. En vert : celle conseillée pour alterner.</p>${bodyMap({ pick: true, sel: F.site, sug: suggestSite(), last })}
      <div class="legend"><span><i style="background:var(--mint)"></i>Conseillée</span><span><i style="background:var(--muted)"></i>Dernière fois</span><span><i style="background:var(--rose)"></i>Choisie</span></div>
      <p id="siteLbl" style="text-align:center;font-weight:800;margin:10px 0 0">${F.site ? SITES[F.site] : '—'}</p>
      <p class="note">Ventre : évite les 5 cm autour du nombril. Le haut du bras, seulement si quelqu’un d’autre fait la piqûre.</p>${nav(2, 'C’est parti', !F.site)}</div>`;
  }
  else if (F.step === 2) body = `<div class="step" style="text-align:center"><h2>On respire 🌬️</h2><p class="muted">Suis le cercle : inspire quand il grandit, expire quand il rétrécit.</p><div class="breath"><div class="c2"></div><div class="c"></div><span id="bt">Inspire…</span></div>${nav(3, 'Je suis prête')}</div>`;
  else if (F.step === 3) body = `<div class="step" style="text-align:center"><h2>À toi de jouer 💉</h2><p class="muted">Injecte comme indiqué dans la notice. Le compteur t’accompagne pendant que tu maintiens le stylo.</p><div class="timer" id="tm">${F.t}</div><div class="muted" style="font-weight:800">secondes</div>
      <div class="btns"><button class="btn ghost" data-act="timer">${F.timer ? '⏸ Pause' : F.t ? '▶︎ Reprendre' : '▶︎ Lancer le compteur'}</button><button class="btn primary" data-flow="4">✅ C’est fait !</button><button class="btn ghost" data-flow="back">Retour</button></div></div>`;
  else if (F.step === 4) body = `<div class="step"><h2>Le petit bilan 📝</h2>
      <label class="f">Qui a fait la piqûre ?</label><div class="seg" data-seg="given_by">${Object.entries(GIVER_SHORT).map(([k, l]) => `<button type="button" data-v="${k}" class="${F.given_by === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="f">Douleur</label><div class="emo" data-emo="pain">${PAIN.map((e, i) => `<button type="button" data-v="${i}" class="${F.pain === i ? 'on' : ''}">${e}</button>`).join('')}</div><div class="emo-l"><span>Rien du tout</span><span>Très douloureux</span></div>
      <label class="f">Comment tu te sens ?</label><div class="emo" data-emo="feeling">${FEEL.map((e, i) => `<button type="button" data-v="${i}" class="${F.feeling === i ? 'on' : ''}">${e}</button>`).join('')}</div><div class="emo-l"><span>Pas bien</span><span>Super fière</span></div>
      <div class="grid2"><div><label class="f" for="fw">Date et heure</label><input class="in" id="fw" type="datetime-local" data-f="when" value="${F.when}"></div><div><label class="f" for="fd">Dose (mg)</label><input class="in" id="fd" type="number" inputmode="numeric" data-f="dose" value="${F.dose}"></div></div>
      <label class="f" for="fn">Une note ? (facultatif)</label><textarea class="in" id="fn" data-f="notes" maxlength="1000" placeholder="Ex. un petit bleu, aucune réaction…">${esc(F.notes)}</textarea>
      <div class="msg" id="fmsg"></div>${nav('save', 'Enregistrer ma piqûre')}</div>`;
  openSheet(head + body, true, F.drawn == null ? undefined : F.drawn === F.step ? 'keep' : 'swap');
  F.drawn = F.step;
  if (F.step === 2) breathLabel();
}
let breathT;
function breathLabel() {
  // respiration carrée : 4 s par phase, synchronisée avec l'animation CSS (16 s)
  clearInterval(breathT); let i = 0; const L = ['Inspire…', 'Retiens…', 'Expire…', 'Relâche…'];
  breathT = setInterval(() => { const e = $('#bt'); if (!e) { clearInterval(breathT); return; } i = (i + 1) % 4; e.textContent = L[i]; }, 4000);
}
async function finishFlow() {
  const before = unlocked();
  const when = new Date(F.when);
  if (isNaN(when)) { say('Date invalide.'); return; }
  const btn = $('[data-flow="save"]'); if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  let saved;
  try {
    saved = await saveInjection({ done_at: when.toISOString(), status: 'faite', dose_mg: Math.max(0, Math.min(600, parseInt(F.dose, 10) || cfg().dose_mg)), site: F.site, given_by: F.given_by, pain: F.pain, feeling: F.feeling, notes: F.notes });
  } catch (e) { say(authErr(e)); if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; } return; }
  const gained = unlocked().filter((x) => !before.includes(x)).map((id) => BADGES.find((b) => b.id === id));
  const st = stats(), solo = F.given_by === 'elle';
  const n = nextInfo(), num = slotOf(saved);
  let pens = cfg().pens_left;
  if (pens > 0) { try { pens = await setPens(pens - 1); } catch (e) { /* le stock se corrige à la main */ } }
  const msg = solo ? (st.solo === 1 ? 'Ta toute première piqûre en solo. Énorme. Tu peux être fière de toi !' : `${st.solo}ᵉ piqûre toute seule. Tu gères comme une pro.`) : 'Piqûre enregistrée. Une de plus dans le bouclier !';
  clearInterval(F.timer); F = null;
  const penLine = pens == null ? '' : pens === 0 ? '<p class="pill warn" style="margin-top:8px">🧊 Plus de stylo au frigo : pense à la pharmacie</p>' : `<p class="muted" style="margin-top:4px">🧊 Il reste ${pens} stylo${pens > 1 ? 's' : ''} au frigo</p>`;
  const calBtn = calSubscribed() ? '<p class="pill ok">🔔 Ton calendrier se met à jour tout seul</p>' : '<button class="btn primary" data-act="cal">🔔 Me rappeler la prochaine</button>';
  openSheet(`<div class="celebrate"><div class="shield">${shieldSVG('cs')}</div><span class="pill" style="margin-top:12px">Piqûre n°${num}</span><h2>Bravo !</h2><p>${msg}</p><p class="muted">Prochaine piqûre : <b>${esc(fmtDate(n.next))}</b></p>${penLine}
    ${gained.map((b) => `<div class="newbadge"><span style="font-size:1.6rem">${b.ic}</span><span>Badge débloqué<br><span class="muted" style="font-weight:700">${b.t}</span></span></div>`).join('<br>')}
    <div class="btns" style="margin-top:26px">${calBtn}<button class="btn ${calSubscribed() ? 'primary' : 'ghost'}" data-close>Terminer</button></div></div>`, true, 'swap');
  confetti(); render(true);
}

/* Édition / ajout manuel */
function editSheet(id) {
  const x = id ? S.list.find((y) => y.id === id) : null;
  const e = x ? Object.assign({}, x) : { done_at: new Date().toISOString(), status: 'faite', dose_mg: cfg().dose_mg, site: null, given_by: null, pain: null, feeling: null, notes: '' };
  F = { edit: true, id, status: e.status, site: e.site, given_by: e.given_by, pain: e.pain, feeling: e.feeling };
  let opened = false;
  const draw = () => {
    const f = e.status === 'faite';
    openSheet(`<div class="sheet-h"><h2>${x ? 'Modifier' : 'Ajouter une piqûre'}</h2><button class="x" data-close aria-label="Fermer">✕</button></div>
    <form data-form="edit">
      <div class="seg" data-seg="status"><button type="button" data-v="faite" class="${f ? 'on' : ''}">✅ Faite</button><button type="button" data-v="manquee" class="${!f ? 'on' : ''}">⏭️ Manquée</button></div>
      <label class="f" for="ew">Date${f ? ' et heure' : ''}</label><input class="in" id="ew" type="datetime-local" name="when" value="${toLocalInput(e.done_at)}" required>
      ${f ? `<label class="f">Qui l’a faite ?</label><div class="seg" data-seg="given_by">${Object.entries(GIVER_SHORT).map(([k, l]) => `<button type="button" data-v="${k}" class="${F.given_by === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="f">Site</label><div class="seg" data-seg="site">${Object.entries(SITES).map(([k, l]) => `<button type="button" data-v="${k}" class="${F.site === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="f">Douleur</label><div class="emo" data-emo="pain">${PAIN.map((em, i) => `<button type="button" data-v="${i}" class="${F.pain === i ? 'on' : ''}">${em}</button>`).join('')}</div>
      <label class="f">Ressenti</label><div class="emo" data-emo="feeling">${FEEL.map((em, i) => `<button type="button" data-v="${i}" class="${F.feeling === i ? 'on' : ''}">${em}</button>`).join('')}</div>
      <label class="f" for="ed">Dose (mg)</label><input class="in" id="ed" type="number" inputmode="numeric" name="dose" value="${e.dose_mg || cfg().dose_mg}">` : ''}
      <label class="f" for="en">Note</label><textarea class="in" id="en" name="notes" maxlength="1000">${esc(e.notes || '')}</textarea>
      <div class="msg" id="fmsg"></div>
      <div class="btns"><button class="btn primary" type="submit">Enregistrer</button>${x ? '<button class="btn danger" type="button" data-act="del">Supprimer</button>' : ''}</div>
    </form>`, false, opened ? 'keep' : undefined);
    opened = true;
  };
  F.redraw = (patch) => { const fm = $('form[data-form="edit"]'); if (fm) { e.done_at = new Date(fm.when.value || e.done_at).toISOString(); e.notes = fm.notes.value; if (fm.dose) e.dose_mg = fm.dose.value; } Object.assign(e, patch); draw(); };
  F.entry = e; draw();
}

/* ---------- Exports ---------- */
function download(name, type, text) {
  const blob = new Blob([text], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function goReminders() {
  closeSheet(); S.tab = 'set'; render();
  setTimeout(() => { const e = $('#rappels'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
}
function csv() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Heure', 'Statut', 'Dose (mg)', 'Site', 'Faite par', 'Douleur (0-4)', 'Ressenti (0-4)', 'Note']];
  sorted().forEach((x) => rows.push([new Date(x.done_at).toLocaleDateString('fr-FR'), fmtTime(x.done_at), x.status === 'faite' ? 'Faite' : 'Manquée', x.dose_mg, SITES[x.site] || '', GIVERS[x.given_by] || '', x.pain, x.feeling, x.notes]));
  download('suivi-xolair.csv', 'text/csv;charset=utf-8', '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'));
}
function applyTheme() { const t = LS.get('theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }

/* ---------- Événements ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const au = t.closest('[data-auth]'); if (au) { S.authMode = au.dataset.auth; render(); return; }
  if (t.closest('[data-close]')) { clearInterval(F && F.timer); closeSheet(); return; }
  // Sélections mises à jour sur place (les coches et puces gardent leur animation)
  const ck = t.closest('[data-check]');
  if (ck && F) {
    const k = ck.dataset.check; F.checks[k] = !F.checks[k]; ck.classList.toggle('on', F.checks[k]);
    const all = FLOW_CHECKS.every(([c]) => F.checks[c]), b = $('[data-flow="1"]');
    if (b) { b.disabled = !all; b.textContent = all ? 'Tout est prêt' : 'Continuer'; }
    return;
  }
  const site = t.closest('[data-site]');
  if (site && site.dataset.site && F) {
    F.site = site.dataset.site;
    document.querySelectorAll('.body-map .zone').forEach((z) => z.classList.toggle('sel', z.dataset.site === F.site));
    const l = $('#siteLbl'); if (l) { l.textContent = SITES[F.site]; l.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300 }); }
    const b = $('[data-flow="2"]'); if (b) b.disabled = false;
    return;
  }
  const seg = t.closest('[data-seg] button');
  if (seg) {
    const k = seg.parentElement.dataset.seg, v = seg.dataset.v;
    const mark = () => seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
    if (k === 'interval') { const i = $('input[name="interval_days"]'); if (i) i.value = v; mark(); return; }
    if (F && F.edit && k === 'status') { F.status = v; F.redraw({ status: v }); return; }
    if (F) { F[k] = v; mark(); }
    return;
  }
  const emo = t.closest('[data-emo] button');
  if (emo && F) {
    const k = emo.parentElement.dataset.emo, v = +emo.dataset.v, nv = F[k] === v ? null : v;
    F[k] = nv;
    emo.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', nv !== null && b === emo));
    return;
  }
  const fl = t.closest('[data-flow]');
  if (fl && F) {
    const v = fl.dataset.flow;
    if (v === 'save') { finishFlow(); return; }
    clearInterval(F.timer); F.timer = null;
    F.step = v === 'back' ? Math.max(0, F.step - 1) : +v; drawFlow(); return;
  }
  const un = t.closest('[data-unshare]');
  if (un) {
    const [o, m] = un.dataset.unshare.split('|');
    if (!confirm('Retirer ce partage ?')) return;
    const r = await S.sb.from('xolair_shares').delete().eq('owner_id', o).eq('member_id', m);
    if (r.error) { toast(authErr(r.error)); return; }
    S.shares = S.shares.filter((x) => !(x.owner_id === o && x.member_id === m));
    if (S.owner === o && o !== S.user.id) { S.owner = S.user.id; LS.set('owner:' + S.user.id, S.owner); await refresh(); }
    toast('Partage retiré'); render(true); return;
  }
  const ed = t.closest('[data-edit]'); if (ed) { editSheet(ed.dataset.edit); return; }
  const pb = t.closest('[data-pens]');
  if (pb) {
    if (S.busy) return;
    const cur = cfg().pens_left, nv = Math.max(0, Math.min(50, (cur == null ? 0 : cur) + +pb.dataset.pens));
    if (cur === nv) return;
    S.busy = true;
    try { await setPens(nv); render(true); const b = $('.stepper b'); if (b) b.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.3,1.6,.5,1)' }); }
    catch (e) { toast(authErr(e)); }
    finally { S.busy = false; }
    return;
  }
  const a = t.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'flow') startFlow();
  else if (act === 'add') editSheet(null);
  else if (act === 'cal') { const u = calUrl('webcal'); if (u) { LS.set('calsub:' + S.owner, true); location.href = u; setTimeout(() => render(true), 800); } else goReminders(); }
  else if (act === 'calsub') { LS.set('calsub:' + S.owner, true); setTimeout(() => render(true), 800); }
  else if (act === 'calinit' || act === 'calreset') {
    if (act === 'calreset' && !confirm('Créer un nouveau lien ? Les calendriers déjà abonnés ne recevront plus les mises à jour : il faudra se réabonner.')) return;
    a.disabled = true;
    try { await calInit(); LS.set('calsub:' + S.owner, false); toast(act === 'calinit' ? 'Rappels prêts : abonne-toi ✨' : 'Nouveau lien créé'); render(true); }
    catch (e) { toast(authErr(e)); a.disabled = false; }
  }
  else if (act === 'csv') csv();
  else if (act === 'theme') { const order = ['auto', 'light', 'dark'], cur = LS.get('theme', 'auto'); LS.set('theme', order[(order.indexOf(cur) + 1) % 3]); applyTheme(); render(true); }
  else if (act === 'logout') { await S.sb.auth.signOut(); toast('À bientôt 👋'); }
  else if (act === 'del' && F && F.id) {
    if (!confirm('Supprimer cette piqûre de l’historique ?')) return;
    const r = await S.sb.from('xolair_injections').delete().eq('id', F.id);
    if (r.error) { say(authErr(r.error)); return; }
    S.list = S.list.filter((x) => x.id !== F.id); closeSheet(); toast('Supprimée'); render(true);
  }
  else if (act === 'timer' && F) {
    if (F.timer) { clearInterval(F.timer); F.timer = null; }
    else F.timer = setInterval(() => { F.t++; const e = $('#tm'); if (e) { e.textContent = F.t; e.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 }); } }, 1000);
    a.textContent = F.timer ? '⏸ Pause' : '▶︎ Reprendre';
  }
});
document.addEventListener('input', (ev) => { const k = ev.target.dataset && ev.target.dataset.f; if (k && F) F[k] = ev.target.value; });
document.addEventListener('change', async (ev) => {
  if (ev.target.matches('[data-owner]')) { S.owner = ev.target.value; LS.set('owner:' + S.user.id, S.owner); S.loading = true; render(); try { await loadOwner(); } catch (e) { restoreCache(); S.offline = true; } S.loading = false; render(); }
});
document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault(); if (S.busy) return;
  const kind = f.dataset.form, fd = new FormData(f), v = (k) => String(fd.get(k) || '').trim();
  const btn = f.querySelector('button[type="submit"]'), label = btn ? btn.textContent : '';
  const busy = (x) => { S.busy = x; if (btn) { btn.disabled = x; btn.textContent = x ? 'Patiente…' : label; } };
  const redirect = location.origin + location.pathname;
  busy(true); say('');
  try {
    if (kind === 'login') {
      const id = v('login'), pwd = String(fd.get('password') || ''); let email = id;
      if (!id.includes('@')) {
        const q = await S.sb.rpc('resolve_login', { p_login: id, p_password: pwd });
        if (q.error) { say(authErr(q.error)); return; }
        if (!q.data) { say('Identifiant ou mot de passe incorrect. Après 10 essais, ce nom d’utilisateur est bloqué 15 minutes.'); return; }
        email = q.data;
      }
      const r = await S.sb.auth.signInWithPassword({ email, password: pwd });
      if (r.error) { say(authErr(r.error)); return; }
      toast('Connexion réussie 🛡️');
    } else if (kind === 'signup') {
      const u = v('username'), em = v('email'), pw = String(fd.get('password') || '');
      if (!/^[A-Za-z0-9._-]{3,24}$/.test(u)) { say('Nom d’utilisateur : 3 à 24 caractères (lettres sans accent, chiffres, . - _).'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say('Adresse e-mail invalide.'); return; }
      if (pw.length < 8) { say('Mot de passe : 8 caractères minimum.'); return; }
      if (pw !== String(fd.get('password2') || '')) { say('Les deux mots de passe ne correspondent pas.'); return; }
      const a = await S.sb.rpc('username_available', { p_username: u });
      if (a.error) { say(authErr(a.error)); return; }
      if (a.data === false) { say('Ce nom d’utilisateur est déjà pris.'); return; }
      const r = await S.sb.auth.signUp({ email: em, password: pw, options: { data: { username: u }, emailRedirectTo: redirect } });
      if (r.error) { say(authErr(r.error)); return; }
      if (r.data.user && Array.isArray(r.data.user.identities) && !r.data.user.identities.length) { say('Un compte existe déjà avec cette adresse e-mail.'); return; }
      if (!r.data.session) { S.authMode = 'login'; render(); say('Compte créé ! Ouvre le lien reçu par e-mail, puis connecte-toi.', true); return; }
    } else if (kind === 'forgot') {
      const r = await S.sb.auth.resetPasswordForEmail(v('email'), { redirectTo: redirect });
      if (r.error) { say(authErr(r.error)); return; }
      say('Si un compte existe, un lien vient d’être envoyé (pense aux indésirables).', true);
    } else if (kind === 'newpass') {
      const p1 = String(fd.get('password') || '');
      if (p1.length < 8) { say('8 caractères minimum.'); return; }
      if (p1 !== String(fd.get('password2') || '')) { say('Les deux mots de passe ne correspondent pas.'); return; }
      const r = await S.sb.auth.updateUser({ password: p1 });
      if (r.error) { say(authErr(r.error)); return; }
      S.authMode = 'login'; toast('Mot de passe modifié'); onLogin();
    } else if (kind === 'settings') {
      const iv = Math.max(7, Math.min(90, parseInt(v('interval_days'), 10) || 28));
      const dz = Math.max(75, Math.min(600, parseInt(v('dose_mg'), 10) || 300));
      const rh = Math.max(0, Math.min(23, parseInt(v('reminder_hour'), 10) || 19));
      await saveSettings({ display_name: v('display_name').slice(0, 40) || null, interval_days: iv, dose_mg: dz, reminder_hour: rh });
      toast('Réglages enregistrés'); render(true);
    } else if (kind === 'share') {
      const r = await S.sb.rpc('xolair_share_add', { p_username: v('username') });
      if (r.error) throw r.error;
      const m = { ok: 'Suivi partagé ✨', introuvable: 'Aucun compte avec ce nom d’utilisateur.', 'soi-meme': 'C’est ton propre compte 🙂', limite: '5 partages maximum.' }[r.data] || 'Erreur';
      toast(m);
      if (r.data === 'ok') { const sh = await S.sb.rpc('xolair_share_list'); S.shares = sh.data || S.shares; render(true); }
    } else if (kind === 'edit' && F) {
      const e = F.entry, when = new Date(fd.get('when'));
      if (isNaN(when)) { say('Date invalide.'); return; }
      const st = F.status || e.status;
      await saveInjection({ done_at: when.toISOString(), status: st, dose_mg: Math.max(0, Math.min(600, parseInt(fd.get('dose'), 10) || cfg().dose_mg)), site: F.site, given_by: F.given_by, pain: F.pain, feeling: F.feeling, notes: v('notes') }, F.id);
      const wasEdit = !!F.id; closeSheet(); toast(wasEdit ? 'Modifiée' : 'Enregistrée ✅'); render(true);
    }
  } catch (err) { say(authErr(err)); if (kind === 'settings' || kind === 'share') toast(authErr(err)); }
  finally { busy(false); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
addEventListener('online', refresh);

applyTheme();
init();
})();
