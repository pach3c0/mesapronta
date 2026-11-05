// Renderizador do site público do restaurante. Lê window.__SITE__ (JSON do tenant) e monta a página.
// Também expõe window.MPSite (modelos, fontes) para o painel.
(function () {
  'use strict';
  const PRESETS = {
    elegante:    { label: 'Elegante',    fonts: 'classica',      colors: { bg: '#FBF8F2', surface: '#F1E8DA', dark: '#2A1B14', text: '#2A1B14', muted: '#5B4030', accent: '#8E1F2C', accent2: '#B8914B' }, vars: { '--btn-r': '0px', '--img-r': '0px' } },
    moderno:     { label: 'Moderno',     fonts: 'contemporanea', colors: { bg: '#FFFFFF', surface: '#F4F1EC', dark: '#151515', text: '#151515', muted: '#5C5C5C', accent: '#E4572E', accent2: '#2F7D62' }, vars: { '--btn-r': '999px', '--img-r': '22px' } },
    industrial:  { label: 'Industrial',  fonts: 'urbana',        colors: { bg: '#1C1C1B', surface: '#242422', dark: '#0F0F0E', text: '#EDE8E0', muted: '#A9A298', accent: '#D9622B', accent2: '#C9A227' }, vars: { '--btn-r': '2px', '--img-r': '2px', '--map-filter': 'grayscale(1) invert(.9) contrast(.9)' } },
    minimalista: { label: 'Minimalista', fonts: 'limpa',         colors: { bg: '#FFFFFF', surface: '#F6F6F4', dark: '#141414', text: '#141414', muted: '#6E6E6E', accent: '#141414', accent2: '#8E8E88' }, vars: { '--btn-r': '0px', '--img-r': '0px', '--map-filter': 'grayscale(1)' } },
  };
  const FONTS = {
    classica:      { label: 'Clássica (Cormorant + Inter)',       d: '"Cormorant Garamond",Georgia,serif', b: 'Inter,system-ui,sans-serif', k: 'Inter,system-ui,sans-serif', q: 'Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600', hw: 500, ls: '-.015em', tt: 'none', logo: '600|.3em|uppercase', mq: 'italic 500 clamp(1.4rem,3vw,2.2rem)/1 "Cormorant Garamond",serif' },
    contemporanea: { label: 'Contemporânea (Bricolage + Inter)',  d: '"Bricolage Grotesque",system-ui,sans-serif', b: 'Inter,system-ui,sans-serif', k: 'Inter,system-ui,sans-serif', q: 'Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600', hw: 700, ls: '-.035em', tt: 'none', logo: '700|-.02em|none', mq: '700 clamp(1.3rem,3vw,2rem)/1 "Bricolage Grotesque",sans-serif' },
    urbana:        { label: 'Urbana (Oswald + IBM Plex)',          d: 'Oswald,Impact,sans-serif', b: '"IBM Plex Sans",system-ui,sans-serif', k: '"IBM Plex Mono",ui-monospace,monospace', q: 'Oswald:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500', hw: 600, ls: '.01em', tt: 'uppercase', logo: '600|.12em|uppercase', mq: '600 clamp(1.3rem,3vw,2rem)/1 Oswald,sans-serif' },
    limpa:         { label: 'Limpa (Manrope)',                     d: 'Manrope,system-ui,sans-serif', b: 'Manrope,system-ui,sans-serif', k: 'Manrope,system-ui,sans-serif', q: 'Manrope:wght@300;400;500;600', hw: 300, ls: '-.03em', tt: 'none', logo: '500|.08em|lowercase', mq: '300 clamp(1.2rem,2.6vw,1.8rem)/1 Manrope,sans-serif' },
    editorial:     { label: 'Editorial (Playfair + Lato)',         d: '"Playfair Display",Georgia,serif', b: 'Lato,system-ui,sans-serif', k: 'Lato,system-ui,sans-serif', q: 'Playfair+Display:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700', hw: 500, ls: '-.01em', tt: 'none', logo: '600|.08em|none', mq: 'italic 500 clamp(1.3rem,3vw,2rem)/1 "Playfair Display",serif' },
    artesanal:     { label: 'Artesanal (Fraunces + Work Sans)',    d: 'Fraunces,Georgia,serif', b: '"Work Sans",system-ui,sans-serif', k: '"Work Sans",system-ui,sans-serif', q: 'Fraunces:opsz,wght@9..144,500;9..144,600&family=Work+Sans:wght@400;500;600', hw: 500, ls: '-.02em', tt: 'none', logo: '600|.02em|none', mq: '500 clamp(1.3rem,3vw,2rem)/1 Fraunces,serif' },
  };
  const COLOR_KEYS = { bg: 'Fundo', surface: 'Fundo alternado', text: 'Texto', muted: 'Texto secundário', accent: 'Botões / destaque', accent2: 'Detalhes', dark: 'Faixas escuras e rodapé' };

  // ---------- utilidades ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = (s) => esc(s).replace(/\n/g, '<br>');
  const paras = (s) => String(s || '').split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${lines(p.trim())}</p>`).join('');
  const safeUrl = (u) => { u = String(u || '').trim(); return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : ''; };
  function lum(hex) {
    const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) return 0;
    const [r, g, b] = m.slice(1).map((x) => { const c = parseInt(x, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const onColor = (hex) => (lum(hex) > 0.36 ? '#141414' : '#FFFFFF');
  const waNumber = (n) => { let d = String(n || '').replace(/\D/g, ''); if (d && d.length <= 11) d = '55' + d; return d; };
  const waLink = (n, msg) => `https://wa.me/${waNumber(n)}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
  const fmtPhone = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const price = (p) => { const s = String(p ?? '').trim(); if (!s) return ''; return /^\d+([.,]\d{1,2})?$/.test(s) ? 'R$ ' + Number(s.replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: s.includes(',') || s.includes('.') ? 2 : 0, maximumFractionDigits: 2 }) : esc(s); };
  const WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.29.6 4.53 1.74 6.5L3 29l6.68-1.75A12.96 12.96 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3Zm0 23.62c-1.98 0-3.92-.53-5.61-1.53l-.4-.24-3.96 1.04 1.06-3.86-.26-.4a10.6 10.6 0 0 1-1.63-5.63c0-5.86 4.77-10.62 10.64-10.62 5.86 0 10.62 4.76 10.62 10.62 0 5.86-4.77 10.62-10.46 10.62Zm5.83-7.95c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66 0 1.57 1.14 3.08 1.3 3.3.16.21 2.25 3.43 5.44 4.81.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z"/></svg>';

  // ---------- tema ----------
  function themeVars(theme) {
    theme = theme || {};
    const preset = PRESETS[theme.preset] || PRESETS.elegante;
    const colors = { ...preset.colors, ...(theme.custom ? (theme.colors || {}) : {}) };
    const fk = (theme.custom && FONTS[theme.fonts]) ? theme.fonts : preset.fonts;
    const f = FONTS[fk];
    const [lw, lls, ltt] = f.logo.split('|');
    const v = {
      '--btn-r': '0px', '--img-r': '0px', '--map-filter': 'none', ...preset.vars,
      '--bg': colors.bg, '--surface': colors.surface, '--dark': colors.dark, '--text': colors.text, '--muted': colors.muted, '--accent': colors.accent, '--accent2': colors.accent2,
      '--on-accent': onColor(colors.accent), '--on-accent2': onColor(colors.accent2),
      '--on-dark': onColor(colors.dark) === '#FFFFFF' ? '#F3EEE6' : '#141414',
      '--on-dark-muted': onColor(colors.dark) === '#FFFFFF' ? '#CFC5B6' : '#4A4A4A',
      '--font-d': f.d, '--font-b': f.b, '--font-k': f.k, '--h-weight': f.hw, '--h-ls': f.ls, '--h-tt': f.tt,
      '--item-ls': f.tt === 'uppercase' ? '.02em' : '0', '--item-tt': f.tt,
      '--logo-weight': lw, '--logo-ls': lls, '--logo-tt': ltt, '--mq-font': f.mq,
    };
    return { vars: v, fontQuery: f.q, presetKey: PRESETS[theme.preset] ? theme.preset : 'elegante' };
  }
  function applyTheme(theme) {
    const t = themeVars(theme);
    const root = document.documentElement;
    root.className = root.className.replace(/\bt-\w+/g, '').trim() + ' t-' + t.presetKey;
    for (const [k, val] of Object.entries(t.vars)) root.style.setProperty(k, val);
    let link = document.getElementById('mp-fonts');
    const href = `https://fonts.googleapis.com/css2?family=${t.fontQuery}&display=swap`;
    if (!link) { link = document.createElement('link'); link.id = 'mp-fonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.href = href;
    let meta = document.querySelector('meta[name=theme-color]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = t.vars['--bg'];
  }

  // ---------- montagem ----------
  function build(s, opts) {
    const nav = s.nav || {}, brand = s.brand || {}, hero = s.hero || {}, about = s.about || {}, menu = s.menu || {}, gal = s.gallery || {}, res = s.reserve || {}, ct = s.contact || {};
    const wa = res.whatsapp || ct.phone;
    const waHref = wa ? waLink(wa, res.message || 'Olá! Gostaria de fazer uma reserva.') : '#reservar';
    const extraSecs = (s.sections || []).filter((x) => x.enabled !== false);
    const navItems = [
      menu.enabled !== false && ['#menu', nav.menu || 'Menu'],
      about.enabled !== false && ['#conceito', nav.about || 'Conceito'],
      gal.enabled !== false && (gal.items || []).length && ['#galeria', nav.gallery || 'Galeria'],
      ...extraSecs.filter((x) => x.navLabel).map((x) => ['#' + secId(x), x.navLabel]),
      ct.enabled !== false && ['#contato', nav.contact || 'Contato'],
    ].filter(Boolean);
    const logo = brand.logoUrl && safeUrl(brand.logoUrl) ? `<img src="${esc(safeUrl(brand.logoUrl))}" alt="${esc(brand.name)}">` : `<span class="logo-dot">${esc(brand.name || 'Restaurante')}</span>`;
    const reserveBtn = res.enabled !== false && wa ? `<li><a class="b" href="${esc(waHref)}" target="_blank" rel="noopener">${esc(nav.reserve || 'Reservar')}</a></li>` : '';

    let n = 0; const num = () => String(++n).padStart(2, '0');
    const out = [];
    out.push(`<div id="pg" aria-hidden="true"></div>
<header id="tp"><div class="w bar">
 <a class="logo" href="#topo" aria-label="${esc(brand.name)}, início">${logo}</a>
 <button id="mb" aria-label="Abrir menu" aria-expanded="false" aria-controls="mn"><i></i><i></i></button>
 <nav id="mn" aria-label="Principal"><ul>${navItems.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}${reserveBtn}</ul></nav>
</div></header><main>`);

    // Hero
    const titleLines = String(hero.title || brand.name || '').split('\n').filter(Boolean);
    const heroImg = safeUrl(hero.image);
    out.push(`<div id="topo" class="w hero${heroImg ? '' : ' noimg'}"><div>
  ${hero.kicker ? `<span class="br">${esc(hero.kicker)}</span>` : ''}
  <h1>${titleLines.map((l) => `<span class="ln"><span>${esc(l)}</span></span>`).join('')}</h1>
  ${hero.subtitle ? `<p class="lead">${lines(hero.subtitle)}</p>` : ''}
  <div class="ac">${res.enabled !== false && wa ? `<a class="b" href="${esc(waHref)}" target="_blank" rel="noopener">${esc(hero.primaryText || 'Reservar minha mesa')}</a>` : ''}${menu.enabled !== false ? `<a class="b o" href="#menu">${esc(hero.secondaryText || 'Ver o menu')}</a>` : ''}</div>
 </div>${heroImg ? `<div class="fr"><div class="im"><img src="${esc(heroImg)}" alt="" fetchpriority="high"></div></div>` : ''}</div>`);

    if (s.marquee?.enabled && s.marquee.text) {
      const sp = `<span>${esc(s.marquee.text)}</span>`.repeat(8);
      out.push(`<div class="mq" aria-hidden="true"><div>${sp}</div></div>`);
    }

    // Conceito / Sobre
    if (about.enabled !== false) out.push(textBlock('conceito', about, num(), false));

    // Galeria
    if (gal.enabled !== false && (gal.items || []).length) {
      const items = gal.items.filter((g) => safeUrl(g.url));
      const cats = [...new Set(items.map((g) => (g.category || '').trim()).filter(Boolean))];
      out.push(`<section id="galeria" class="sd"><div class="w">
 <span class="k rv">${num()} ${esc(gal.kicker || 'Galeria')}</span>
 <h2 class="rv">${lines(gal.title || 'Galeria')}</h2>${gal.intro ? `<p class="body-text rv">${lines(gal.intro)}</p>` : ''}
 ${cats.length > 1 ? `<div class="gf rv" role="group" aria-label="Filtrar fotos"><button class="chip" aria-pressed="true" data-f="">Todas</button>${cats.map((c) => `<button class="chip" aria-pressed="false" data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
 <div class="gl">${items.map((g, i) => `<figure class="pc rv" data-c="${esc((g.category || '').trim())}"><button class="ph" aria-label="Ampliar foto: ${esc(g.title || 'foto ' + (i + 1))}"><img src="${esc(safeUrl(g.url))}" alt="${esc(g.title || '')}" data-cap="${esc([g.title, g.caption].filter(Boolean).join(' — '))}" loading="lazy"></button>${g.title ? `<figcaption>${esc(g.title)}${g.caption ? `<small>${esc(g.caption)}</small>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>
</div></section>`);
    }

    // Seções livres
    extraSecs.forEach((x) => out.push(textBlock(secId(x), x, num(), true)));

    // Menu
    if (menu.enabled !== false) {
      const menus = (menu.menus || []).filter((m) => m.name);
      out.push(`<section id="menu" class="sd"><div class="w">
 <span class="k rv">${num()} ${esc(menu.kicker || 'Cardápio')}</span>
 <h2 class="rv">${lines(menu.title || 'Menu.')}</h2>${menu.intro ? `<p class="body-text rv">${lines(menu.intro)}</p>` : ''}
 ${menus.length ? `<div class="tabs rv" role="tablist">${menus.map((m, i) => `<button class="tab" role="tab" id="t-${i}" aria-controls="p-${i}" aria-selected="${i === 0}">${esc(m.name)}</button>`).join('')}</div>
 ${menus.map((m, i) => `<div class="mp rv" role="tabpanel" id="p-${i}" aria-labelledby="t-${i}"${i ? ' hidden' : ''}>
  ${(m.categories || []).filter((c) => (c.items || []).length).map((c) => `<div class="cat"><h3>${esc(c.name)}</h3><div class="items">${c.items.map((it) => `<div class="it"><div class="it-h"><strong>${esc(it.name)}</strong><i></i><span>${price(it.price)}</span></div>${it.description ? `<p>${esc(it.description)}</p>` : ''}${(it.tags || []).filter(Boolean).map((t) => `<span class="tg">${esc(t)}</span>`).join('')}</div>`).join('')}</div></div>`).join('') || (m.externalUrl ? '' : '<p class="empty">Cardápio em atualização.</p>')}
  ${safeUrl(m.externalUrl) ? `<div class="ext"><a class="b o" href="${esc(safeUrl(m.externalUrl))}" target="_blank" rel="noopener">Ver cardápio completo de ${esc(m.name.toLowerCase())}</a></div>` : ''}
 </div>`).join('')}` : '<p class="empty rv">Cardápio em atualização.</p>'}
</div></section>`);
    }

    // Reserva
    if (res.enabled !== false && wa) {
      out.push(`<section id="reservar" class="dk"><div class="w"><div class="rf rv">
 <span class="k">${num()} ${esc(res.kicker || 'Reservas')}</span>
 <h2>${lines(res.title || 'Reserve sua mesa.')}</h2>${res.text ? `<p>${lines(res.text)}</p>` : ''}
 ${res.showForm !== false ? `<form class="rform" id="rform">
  <label class="full">Seu nome<input name="nome" autocomplete="name" required></label>
  <label>Data<input type="date" name="data" required></label>
  <label>Horário<input type="time" name="hora" required></label>
  <label>Pessoas<select name="pessoas">${Array.from({ length: 12 }, (_, i) => `<option${i === 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}<option value="mais de 12">Mais de 12</option></select></label>
  <label>Ocasião<select name="ocasiao"><option value="">—</option><option>Aniversário</option><option>Encontro</option><option>Negócios</option><option>Família</option><option>Comemoração</option></select></label>
 </form><button class="b" form="rform" type="submit">${WA_SVG}Reservar pelo WhatsApp</button>`
        : `<a class="b" href="${esc(waHref)}" target="_blank" rel="noopener">${WA_SVG}Reservar pelo WhatsApp</a>`}
</div></div></section>`);
    }

    // Contato
    if (ct.enabled !== false) {
      const addr = String(ct.address || '').trim();
      const mapQ = encodeURIComponent(addr);
      const ig = String(ct.instagram || '').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
      out.push(`<section id="contato"><div class="w">
 <span class="k rv">${num()} ${esc(ct.kicker || 'Contato')}</span>
 <h2 class="rv">${lines(ct.title || 'Venha nos visitar.')}</h2>
 <div class="cn rv"><div><dl>
  ${addr ? `<dt>Endereço</dt><dd>${esc(addr)}</dd>` : ''}
  ${(ct.hours || []).filter((h) => h.days || h.time).length ? `<dt>Horários</dt>${ct.hours.filter((h) => h.days || h.time).map((h) => `<dd>${esc(h.days)}${h.days && h.time ? ': ' : ''}${esc(h.time)}</dd>`).join('')}` : ''}
  ${ct.phone ? `<dt>Telefone / WhatsApp</dt><dd><a href="${esc(waLink(ct.phone))}" target="_blank" rel="noopener">${esc(fmtPhone(ct.phone))}</a></dd>` : ''}
  ${ct.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></dd>` : ''}
  ${ig ? `<dt>Instagram</dt><dd><a href="https://www.instagram.com/${esc(encodeURIComponent(ig))}/" target="_blank" rel="noopener">@${esc(ig)}</a></dd>` : ''}
  ${safeUrl(ct.facebook) ? `<dt>Facebook</dt><dd><a href="${esc(safeUrl(ct.facebook))}" target="_blank" rel="noopener">Ver página</a></dd>` : ''}
 </dl>${addr ? `<a class="b o" href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener">Como chegar</a>` : ''}</div>
 ${addr && ct.showMap !== false ? `<div class="map"><iframe title="Mapa: ${esc(addr)}" src="https://maps.google.com/maps?q=${mapQ}&z=16&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` : ''}
 </div></div></section>`);
    }
    out.push('</main>');

    // Rodapé
    out.push(`<footer><div class="w"><div class="rod">
 <div><a class="logo" href="#topo">${logo}</a><p style="margin-top:12px">${esc(s.footer?.text || brand.tagline || '')}</p></div>
 <ul>${navItems.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}${wa && res.enabled !== false ? `<li><a href="${esc(waHref)}" target="_blank" rel="noopener">${esc(nav.reserve || 'Reservar')}</a></li>` : ''}</ul>
 </div><div class="made">© ${new Date().getFullYear()} ${esc(brand.name)} · Site criado com <a href="/" target="_blank" rel="noopener">MesaPronta</a></div></div></footer>`);

    if (wa && res.floatingButton !== false) out.push(`<a class="wa" href="${esc(waHref)}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">${WA_SVG}</a>`);
    out.push('<div id="lb" role="dialog" aria-modal="true" aria-label="Foto ampliada"><button id="cl" aria-label="Fechar">×</button><button id="pv" aria-label="Foto anterior">‹</button><button id="nx" aria-label="Próxima foto">›</button><img alt=""><p></p></div>');
    return out.join('\n');

    function secId(x) { return 'sec-' + String(x.id || '').replace(/[^\w-]/g, ''); }
    function textBlock(id, b, number, free) {
      const im = safeUrl(b.image);
      const layout = !im || b.layout === 'text-only' ? 'solo' : b.layout === 'image-left' ? 'r' : '';
      const btn = free && b.buttonText ? (() => { const u = safeUrl(b.buttonUrl) || (b.buttonUrl === 'whatsapp' ? waHref : '#reservar'); const ext = /^https?:/.test(u); return `<a class="b" href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ''} style="margin-top:12px">${esc(b.buttonText)}</a>`; })() : '';
      const hl = (b.highlights || []).filter((h) => h.title || h.text);
      return `<section id="${id}"><div class="w g2 ${layout}">
 <div class="rv">${b.kicker ? `<span class="k">${number} ${esc(b.kicker)}</span>` : ''}${b.title ? `<h2>${lines(b.title)}</h2>` : ''}
  <div class="body-text">${paras(b.text)}</div>${btn}
  ${hl.length ? `<div class="hl">${hl.map((h) => `<div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join('')}</div>` : ''}
 </div>${im ? `<div class="media of rv"><div class="px"><img src="${esc(im)}" alt="" loading="lazy"></div></div>` : ''}
</div></section>`;
    }
  }

  // ---------- comportamento ----------
  let cleanup = [];
  function wire(s) {
    cleanup.forEach((f) => f()); cleanup = [];
    const d = document, R = matchMedia('(prefers-reduced-motion:reduce)').matches;
    d.documentElement.classList.add('js');
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanup.push(() => el.removeEventListener(ev, fn, o)); };
    const h = d.getElementById('tp'), pg = d.getElementById('pg'), px = [...d.querySelectorAll('.px img')]; let t = 0;
    function sc() {
      const y = scrollY, m = d.documentElement.scrollHeight - innerHeight;
      h.classList.toggle('s', y > 30); pg.style.transform = 'scaleX(' + (m > 0 ? y / m : 0) + ')';
      if (!R) px.forEach((i) => { const b = i.parentNode.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) return; i.style.transform = 'translate3d(0,' + (((b.top + b.height / 2 - innerHeight / 2) / innerHeight) * -30).toFixed(1) + 'px,0) scale(1.1)'; });
    }
    on(window, 'scroll', () => { if (!t) t = requestAnimationFrame(() => { t = 0; sc(); }); }, { passive: true }); on(window, 'resize', sc); sc();
    const io = new IntersectionObserver((e) => e.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.08 });
    d.querySelectorAll('.rv').forEach((e) => io.observe(e)); cleanup.push(() => io.disconnect());
    const mn = d.getElementById('mn'), mb = d.getElementById('mb');
    const nv = (o) => { mn.classList.toggle('o', o); mb.setAttribute('aria-expanded', o); mb.setAttribute('aria-label', o ? 'Fechar menu' : 'Abrir menu'); };
    mb.onclick = () => nv(!mn.classList.contains('o')); mn.onclick = (e) => { if (e.target.tagName === 'A') nv(false); };
    // abas do cardápio
    const tabs = [...d.querySelectorAll('.tab')];
    tabs.forEach((tb, i) => tb.onclick = () => tabs.forEach((x, j) => { x.setAttribute('aria-selected', i === j); d.getElementById('p-' + j).hidden = i !== j; }));
    // filtro + lightbox da galeria
    d.querySelectorAll('.gf .chip').forEach((c) => c.onclick = () => {
      d.querySelectorAll('.gf .chip').forEach((x) => x.setAttribute('aria-pressed', x === c));
      d.querySelectorAll('.pc').forEach((p) => { p.hidden = !!c.dataset.f && p.dataset.c !== c.dataset.f; });
    });
    const lb = d.getElementById('lb'), li = lb.querySelector('img'), cp = lb.querySelector('p'); let k = 0, last, vis = [];
    const op = (i) => { k = (i + vis.length) % vis.length; li.src = vis[k].src; li.alt = vis[k].alt; cp.textContent = vis[k].dataset.cap || ''; };
    const show = (img) => { vis = [...d.querySelectorAll('.pc:not([hidden]) .ph img')]; last = d.activeElement; op(vis.indexOf(img)); lb.classList.add('on'); requestAnimationFrame(() => lb.classList.add('v')); d.getElementById('cl').focus(); d.body.style.overflow = 'hidden'; };
    const hide = () => { lb.classList.remove('v'); setTimeout(() => lb.classList.remove('on'), 350); d.body.style.overflow = ''; if (last) last.focus(); };
    d.querySelectorAll('.ph').forEach((b) => b.onclick = () => show(b.querySelector('img')));
    d.getElementById('cl').onclick = hide; d.getElementById('pv').onclick = () => op(k - 1); d.getElementById('nx').onclick = () => op(k + 1);
    lb.onclick = (e) => { if (e.target === lb) hide(); };
    on(d, 'keydown', (e) => { if (e.key === 'Escape') { nv(false); if (lb.classList.contains('on')) hide(); } if (lb.classList.contains('on')) { if (e.key === 'ArrowLeft') op(k - 1); if (e.key === 'ArrowRight') op(k + 1); } });
    // reserva → WhatsApp
    const rf = d.getElementById('rform');
    if (rf) {
      const dt = rf.querySelector('[name=data]'); dt.min = new Date().toISOString().slice(0, 10);
      rf.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(rf), r = s.reserve || {};
        const data = f.get('data') ? f.get('data').split('-').reverse().join('/') : '';
        const msg = [r.message || 'Olá! Gostaria de fazer uma reserva.', '', `Nome: ${f.get('nome')}`, `Data: ${data}`, `Horário: ${f.get('hora')}`, `Pessoas: ${f.get('pessoas')}`, f.get('ocasiao') ? `Ocasião: ${f.get('ocasiao')}` : ''].filter((x) => x !== null).join('\n').trim();
        window.open(waLink(r.whatsapp || s.contact?.phone, msg), '_blank', 'noopener');
      };
    }
  }

  function render(site, opts) {
    site = site || {};
    applyTheme(site.theme);
    const app = document.getElementById('app');
    const y = scrollY;
    app.innerHTML = build(site, opts || {});
    wire(site);
    if (opts && opts.keepScroll) scrollTo(0, y);
  }

  window.MPSite = { PRESETS, FONTS, COLOR_KEYS, render, themeVars, onColor };

  if (window.__SITE__ && document.getElementById('app')) {
    const opts = window.__OPTS__ || {};
    render(window.__SITE__, opts);
    // Pré-visualização ao vivo vinda do painel (mesma origem)
    if (opts.preview) {
      addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data || e.data.type !== 'mp:site') return;
        render(e.data.site, { keepScroll: true });
        if (e.data.scrollTo) { const el = document.querySelector(e.data.scrollTo); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
      });
      // No preview, links externos abrem em nova aba
      document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="http"]'); if (a) a.target = '_blank'; });
    }
  }
})();
