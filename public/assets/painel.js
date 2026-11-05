// Painel do cliente (restaurante). Cada cliente só vê e edita o próprio site: o servidor usa o tenant da sessão.
(function () {
  'use strict';
  const { PRESETS, FONTS, COLOR_KEYS } = window.MPSite;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + Math.random().toString(36).slice(2, 10);
  const money = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';
  // ETIQUETA "EM AJUSTE" — pagamento
  // Ordem do dono do projeto em 05/11/2026: "deixa pendurado essa pendência de pagamento, não é algo que vamos definir agora".
  // Situação: a cobrança é manual (PIX + comprovante pelo WhatsApp; o admin dá baixa com "Marcar como pago").
  // Não existe gateway (Asaas, Mercado Pago…), pagamento online nem baixa automática. Boleto e cartão ainda não são oferecidos de verdade.
  // A causa NÃO foi investigada: é uma decisão de produto em aberto, não um defeito diagnosticado.
  // Para tirar: confirme com o dono que o pagamento foi definido e integrado, mude a flag para false
  // e apague a linha em PENDENCIAS.md e a checagem em scripts/checar-etiquetas.sh.
  const EM_AJUSTE = { pagamento: true };
  const SELO = '<span class="em-ajuste" title="Pagamento online ainda não disponível">Em ajuste</span>';
  const AVISO_PAGAMENTO = '<div class="aviso-ajuste"><b>Em ajuste:</b> o pagamento online ainda não está disponível. Por enquanto, pague pela chave PIX abaixo e envie o comprovante pelo WhatsApp do suporte.</div>';
  const STATUS = { trial: 'Em teste', active: 'Ativo', overdue: 'Pagamento pendente', suspended: 'Suspenso', canceled: 'Cancelado', pending: 'Em aberto', paid: 'Pago' };

  const S = { me: null, site: null, view: 'inicio', menuIdx: 0, dirty: false, saving: false, plans: [], pvMode: 'desk' };

  // ---------- API ----------
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: { ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    if (r.status === 401) { location.href = '/entrar'; throw new Error('Sessão expirada'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Algo deu errado. Tente novamente.');
    return data;
  }
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = err ? 'err' : ''), 3200);
  }

  // ---------- caminho de dados ----------
  const parts = (p) => p.split('.').map((k) => (/^\d+$/.test(k) ? +k : k));
  function get(o, p) { return parts(p).reduce((a, k) => (a == null ? a : a[k]), o); }
  function set(o, p, v) { const ks = parts(p); let a = o; ks.slice(0, -1).forEach((k, i) => { if (a[k] == null) a[k] = typeof ks[i + 1] === 'number' ? [] : {}; a = a[k]; }); a[ks.at(-1)] = v; }

  // ---------- salvar automático + prévia ----------
  let saveT, pvT;
  function changed(scrollTo) {
    S.dirty = true; status();
    clearTimeout(saveT); saveT = setTimeout(save, 1200);
    clearTimeout(pvT); pvT = setTimeout(() => pushPreview(scrollTo), 150);
  }
  async function save() {
    if (S.saving) { clearTimeout(saveT); saveT = setTimeout(save, 600); return; }
    S.saving = true; status();
    try { await api('/api/site', { method: 'PUT', body: JSON.stringify({ site: S.site }) }); S.dirty = false; S.err = null; }
    catch (e) { S.err = e.message; toast(e.message, true); }
    S.saving = false; status();
  }
  function status() {
    const el = $('#save'); if (!el) return;
    el.className = 'save' + (S.saving ? ' busy' : S.err ? ' err' : S.dirty ? ' dirty' : '');
    el.querySelector('span').textContent = S.saving ? 'Salvando…' : S.err ? 'Não salvo' : S.dirty ? 'Alterações pendentes' : 'Tudo salvo';
  }
  addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  const ANCHOR = { inicio: '#topo', aparencia: '#topo', capa: '#topo', cardapio: '#menu', conceito: '#conceito', galeria: '#galeria', reserva: '#reservar' };
  function pushPreview(scrollTo) {
    const f = $('#pv'); if (!f || !f.contentWindow) return;
    f.contentWindow.postMessage({ type: 'mp:site', site: S.site, scrollTo }, location.origin);
  }

  // ---------- imagens (comprime no navegador antes de enviar) ----------
  async function compress(file, max = 1600) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use imagens JPG, PNG ou WEBP.');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const keepPng = file.type === 'image/png' && max <= 600; // logos
    return await new Promise((r) => c.toBlob(r, keepPng ? 'image/png' : 'image/jpeg', 0.82));
  }
  async function upload(file, max) {
    const blob = await compress(file, max);
    const { url } = await api('/api/upload', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
    return url;
  }
  function pickImage(path, max) {
    const inp = $('#file'); inp.value = '';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { toast('Enviando imagem…'); set(S.site, path, await upload(f, max)); render(); changed(); toast('Imagem atualizada'); }
      catch (e) { toast(e.message, true); }
    };
    inp.click();
  }
  async function addPhotos(files) {
    const g = S.site.gallery; const lim = S.me.tenant.planInfo.photos;
    const room = lim - g.items.length;
    if (room <= 0) return toast(`Seu plano permite até ${lim} fotos.`, true);
    const list = [...files].slice(0, room);
    for (let i = 0; i < list.length; i++) {
      try { toast(`Enviando foto ${i + 1} de ${list.length}…`); g.items.push({ id: uid('g'), url: await upload(list[i]), title: '', caption: '', category: '' }); }
      catch (e) { toast(e.message, true); }
    }
    if (files.length > room) toast(`Só ${room} foto(s) couberam no seu plano.`, true); else toast('Fotos adicionadas');
    render(); changed('#galeria');
  }

  // ---------- componentes ----------
  const v = (p) => esc(get(S.site, p) ?? '');
  const field = (label, p, o = {}) => `<label class="f${o.full ? ' full' : ''}"><span>${label}</span>${o.rows
    ? `<textarea class="in" data-k="${p}" rows="${o.rows}" placeholder="${esc(o.ph || '')}" maxlength="${o.max || 2000}">${v(p)}</textarea>`
    : `<input class="in" data-k="${p}" value="${v(p)}" placeholder="${esc(o.ph || '')}" maxlength="${o.max || 200}"${o.type ? ` type="${o.type}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''}>`}${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
  const toggle = (label, p, hint) => `<label class="sw"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="tg" data-k="${p}"${get(S.site, p) !== false ? ' checked' : ''}></label>`;
  const select = (label, p, opts, o = {}) => `<label class="f${o.full ? ' full' : ''}"><span>${label}</span><select class="in" data-k="${p}">${opts.map(([val, l]) => `<option value="${esc(val)}"${String(get(S.site, p) ?? '') === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
  const image = (label, p, o = {}) => { const u = get(S.site, p); return `<div class="f${o.full ? ' full' : ''}"><span>${label}</span><div class="img"><div class="th" style="${u ? `background-image:url('${esc(u)}')` : ''}">${u ? '' : 'Sem imagem'}</div><div class="acts"><button class="btn s" data-act="img" data-p="${p}" data-max="${o.max || 1600}">${u ? 'Trocar' : 'Enviar imagem'}</button>${u ? `<button class="btn s dg" data-act="clear" data-p="${p}">Remover</button>` : ''}</div></div>${o.hint ? `<small>${o.hint}</small>` : ''}</div>`; };
  const mv = (p, i, n) => `<div class="mv"><button class="btn ic s" title="Subir" data-act="up" data-p="${p}" data-i="${i}"${i === 0 ? ' disabled' : ''}>↑</button><button class="btn ic s" title="Descer" data-act="down" data-p="${p}" data-i="${i}"${i === n - 1 ? ' disabled' : ''}>↓</button><button class="btn ic s dg" title="Excluir" data-act="del" data-p="${p}" data-i="${i}">✕</button></div>`;
  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', paint: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="16" cy="10" r="1.3"/><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3"/>',
    hero: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>', menu: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>', img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5L5 21"/>',
    wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.5 2 2 3.5 4 4l1.2-1.2 2 1-.5 1.7c-3.5.4-7.5-3.6-7.2-7.1L10.2 7l1 2z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const NAV = [
    ['Seu site', [['inicio', 'Início', 'home'], ['aparencia', 'Aparência', 'paint'], ['capa', 'Capa', 'hero'], ['cardapio', 'Cardápio', 'menu'], ['conceito', 'Conceito e seções', 'book'], ['galeria', 'Galeria', 'img'], ['reserva', 'Reserva e contato', 'wa']]],
    ['Conta', [['conta', 'Meus dados', 'user'], ['assinatura', 'Assinatura', 'card']]],
  ];

  // ---------- telas ----------
  const V = {};
  V.inicio = () => {
    const s = S.site, t = S.me.tenant;
    const items = (s.menu?.menus || []).reduce((n, m) => n + (m.categories || []).reduce((a, c) => a + (c.items || []).length, 0), 0);
    const demoImg = (u) => /images\.unsplash\.com/.test(u || '');
    const checks = [
      ['Escolher o modelo e as cores', true, 'aparencia'],
      ['Trocar a foto da capa por uma do seu restaurante', s.hero?.image && !demoImg(s.hero.image), 'capa'],
      ['Montar o cardápio de comidas e bebidas', items >= 3 && !JSON.stringify(s.menu).includes('Burrata da casa'), 'cardapio'],
      ['Contar o conceito ou a história da casa', s.about?.text && !/^Começamos pequenos/.test(s.about.text), 'conceito'],
      ['Subir fotos dos seus pratos na galeria', (s.gallery?.items || []).some((g) => !demoImg(g.url)), 'galeria'],
      ['Conferir WhatsApp e endereço', s.reserve?.whatsapp && s.contact?.address && !/Av\. Paulista, 1000/.test(s.contact.address), 'reserva'],
    ];
    const done = checks.filter((c) => c[1]).length;
    return `<div class="hd"><div><h1>Olá, ${esc(S.me.user.name.split(' ')[0])}!</h1><p>Seu site já está no ar com um conteúdo de exemplo. Siga os passos abaixo para deixá-lo com a cara do ${esc(t.restaurantName)}.</p></div>
      <a class="btn p" href="${esc(S.me.siteUrl)}" target="_blank" rel="noopener">${ic('ext')} Ver meu site</a></div>
    <div class="kpis">
      <div class="kpi"><small>Plano</small><b>${esc(t.planInfo.name)}</b></div>
      <div class="kpi"><small>Situação</small><b><span class="badge ${t.status}">${STATUS[t.status] || t.status}</span></b></div>
      <div class="kpi"><small>${t.status === 'trial' ? 'Teste grátis até' : 'Próximo vencimento'}</small><b>${dt(t.status === 'trial' ? t.trialEndsAt : t.nextDueDate)}</b></div>
    </div>
    <div class="card"><div class="ch"><h3>Primeiros passos</h3><span class="badge">${done} de ${checks.length}</span></div>
      <div class="meter"><i style="width:${(done / checks.length) * 100}%"></i></div>
      <ul class="check" style="margin-top:8px">${checks.map(([l, ok, go]) => `<li class="${ok ? 'ok' : ''}"><i>${ok ? '✓' : ''}</i><span>${l}</span><button class="btn s" data-go="${go}">${ok ? 'Revisar' : 'Fazer agora'}</button></li>`).join('')}</ul></div>
    <div class="card"><h3>Endereço do seu site</h3><p class="sub">Compartilhe no Instagram, no Google Meu Negócio e no WhatsApp.</p>
      <div class="pix"><span style="flex:1">${esc(S.me.siteUrl)}</span><button class="btn s" data-act="copy" data-v="${esc(S.me.siteUrl)}">${ic('copy')} Copiar</button></div></div>`;
  };

  V.aparencia = () => {
    const th = S.site.theme;
    const cur = PRESETS[th.preset] || PRESETS.elegante;
    const cols = { ...cur.colors, ...(th.custom ? th.colors : {}) };
    return `<div class="hd"><div><h1>Aparência</h1><p>Escolha um dos 4 modelos prontos. Se quiser, personalize as cores e as fontes do modelo escolhido.</p></div></div>
    <div class="card"><h3>Modelo</h3><p class="sub">Você pode trocar quando quiser: o conteúdo continua o mesmo.</p>
      <div class="models">${Object.entries(PRESETS).map(([k, p]) => { const f = FONTS[p.fonts]; return `<button class="model" data-act="preset" data-v="${k}" aria-pressed="${th.preset === k}">
        <div class="pv" style="background:${p.colors.bg};color:${p.colors.text}"><b style="font-family:${esc(f.d)};font-weight:${f.hw};text-transform:${f.tt}">${esc(S.site.brand.name.split(' ')[0] || 'Casa')}</b><div class="dots">${['accent', 'accent2', 'dark', 'surface'].map((c) => `<i style="background:${p.colors[c]}"></i>`).join('')}</div></div>
        <div class="nm">${p.label}<a href="/demo/${k}" target="_blank" rel="noopener" title="Ver demonstração" onclick="event.stopPropagation()">${ic('eye').replace('<svg', '<svg width="16" height="16"')}</a></div></button>`; }).join('')}</div>
      <label class="sw" style="margin-top:12px"><span><b>Personalizar cores e fontes</b><small>Ajuste o modelo ${esc(cur.label)} com as cores da sua marca.</small></span><input type="checkbox" class="tg" data-act="custom"${th.custom ? ' checked' : ''}></label>
      ${th.custom ? `<div class="colors" style="margin-top:8px">${Object.entries(COLOR_KEYS).map(([k, l]) => `<div class="color"><input type="color" data-color="${k}" value="${esc(cols[k])}" aria-label="${l}"><span>${l}</span><input class="in" type="text" data-color="${k}" value="${esc(cols[k])}" maxlength="7" aria-label="${l} (código)"></div>`).join('')}</div>
        <div class="grid" style="margin-top:14px">${select('Fontes', 'theme.fonts', [['', `Padrão do modelo (${FONTS[cur.fonts].label})`], ...Object.entries(FONTS).map(([k, f]) => [k, f.label])])}
        <div class="f" style="justify-content:flex-end"><button class="btn" data-act="reset-colors">Voltar às cores do modelo</button></div></div>` : ''}
    </div>
    <div class="card"><h3>Marca</h3><p class="sub">Nome e logo que aparecem no topo e no rodapé do site.</p>
      <div class="grid">${field('Nome do restaurante', 'brand.name', { max: 60 })}${field('Frase do rodapé', 'brand.tagline', { max: 120 })}
      ${image('Logo (opcional)', 'brand.logoUrl', { max: 600, hint: 'PNG com fundo transparente fica melhor. Sem logo, usamos o nome.', full: true })}</div></div>
    <div class="card"><h3>Botões do cabeçalho</h3><p class="sub">Mude os nomes, se quiser. Ex.: “Conceito” pode virar “Nossa história”.</p>
      <div class="grid c3">${field('Menu', 'nav.menu', { max: 24 })}${field('Conceito', 'nav.about', { max: 24 })}${field('Galeria', 'nav.gallery', { max: 24 })}${field('Contato', 'nav.contact', { max: 24 })}${field('Botão de reserva', 'nav.reserve', { max: 24 })}</div></div>
    <div class="card"><h3>Google e compartilhamento</h3><p class="sub">Como seu site aparece nas buscas e quando o link é compartilhado.</p>
      <div class="grid">${field('Título da página', 'seo.title', { max: 70, full: true })}${field('Descrição', 'seo.description', { rows: 2, max: 160, full: true })}</div></div>`;
  };

  V.capa = () => `<div class="hd"><div><h1>Capa</h1><p>A primeira coisa que o cliente vê. Use uma foto bonita e uma frase curta.</p></div></div>
    <div class="card"><div class="grid">
      ${field('Texto pequeno acima do título', 'hero.kicker', { max: 60, ph: 'Ex.: Cozinha italiana · Mooca' })}
      ${field('Botão principal (abre o WhatsApp)', 'hero.primaryText', { max: 30 })}
      ${field('Título', 'hero.title', { rows: 2, max: 80, full: true, hint: 'Cada linha aparece separada, com animação. Use 1 a 3 linhas curtas.' })}
      ${field('Subtítulo', 'hero.subtitle', { rows: 3, max: 220, full: true })}
      ${field('Botão secundário (leva ao menu)', 'hero.secondaryText', { max: 30 })}
      ${image('Foto da capa', 'hero.image', { hint: 'Vertical (retrato) funciona melhor. Sem foto, a capa fica só com texto.' })}
    </div></div>
    <div class="card"><h3>Faixa animada</h3><p class="sub">Uma frase que passa abaixo da capa.</p>
      ${toggle('Mostrar faixa', 'marquee.enabled')}${field('Frase', 'marquee.text', { max: 80 })}</div>`;

  V.cardapio = () => {
    const m = S.site.menu; const menus = m.menus || (m.menus = []);
    S.menuIdx = Math.min(S.menuIdx, Math.max(0, menus.length - 1));
    const cur = menus[S.menuIdx]; const mp = `menu.menus.${S.menuIdx}`;
    return `<div class="hd"><div><h1>Cardápio</h1><p>Crie quantos cardápios quiser (comidas, bebidas, vinhos, almoço executivo…). Eles aparecem em abas no site.</p></div></div>
    <div class="card">${toggle('Mostrar o cardápio no site', 'menu.enabled')}
      <div class="grid">${field('Título da seção', 'menu.title', { max: 60 })}${field('Texto pequeno acima', 'menu.kicker', { max: 40 })}${field('Introdução', 'menu.intro', { rows: 2, max: 240, full: true })}</div></div>
    <div class="tabs" role="tablist">${menus.map((x, i) => `<button class="tab" role="tab" aria-selected="${i === S.menuIdx}" data-act="menu-tab" data-i="${i}">${esc(x.name || 'Sem nome')}</button>`).join('')}<button class="tab" data-act="add-menu">+ Novo cardápio</button></div>
    ${cur ? `<div class="card"><div class="ch"><h3>${esc(cur.name || 'Cardápio')}</h3>${mv('menu.menus', S.menuIdx, menus.length)}</div>
      <div class="grid">${field('Nome da aba', `${mp}.name`, { max: 30, ph: 'Ex.: Comidas' })}${field('Link de um PDF ou cardápio externo (opcional)', `${mp}.externalUrl`, { ph: 'https://…', hint: 'Se preencher, aparece o botão “Ver cardápio completo”.' })}</div></div>
      ${(cur.categories || []).map((c, ci) => `<div class="cat"><div class="cat-h"><input class="in" data-k="${mp}.categories.${ci}.name" value="${esc(c.name)}" placeholder="Nome da categoria (ex.: Entradas)" maxlength="40">${mv(`${mp}.categories`, ci, cur.categories.length)}</div>
        <div class="items">${(c.items || []).map((it, ii) => { const ip = `${mp}.categories.${ci}.items.${ii}`; return `<div class="item">
          <input class="in" data-k="${ip}.name" value="${esc(it.name)}" placeholder="Nome do prato" maxlength="80">
          <input class="in" data-k="${ip}.price" value="${esc(it.price)}" placeholder="Preço" maxlength="20" inputmode="decimal">
          ${mv(`${mp}.categories.${ci}.items`, ii, c.items.length)}
          <textarea class="in d" data-k="${ip}.description" rows="2" placeholder="Descrição (ingredientes, porção…)" maxlength="300">${esc(it.description)}</textarea>
          <input class="in t" data-k="${ip}.tags" data-list="1" value="${esc((it.tags || []).join(', '))}" placeholder="Selos, separados por vírgula: vegano, sem glúten, mais pedido" maxlength="120">
        </div>`; }).join('') || '<p class="empty">Nenhum item ainda.</p>'}
        <button class="btn s" data-act="add-item" data-p="${mp}.categories.${ci}.items" style="margin-top:10px">+ Adicionar item</button></div></div>`).join('')}
      <button class="btn" data-act="add-cat" data-p="${mp}.categories">+ Nova categoria</button>`
      : '<p class="empty">Nenhum cardápio. Clique em “+ Novo cardápio”.</p>'}`;
  };

  const ABOUT_NAMES = ['Conceito', 'Nossa história', 'Sobre nós', 'O chef', 'A casa'];
  const layoutOpts = [['image-right', 'Foto à direita'], ['image-left', 'Foto à esquerda'], ['text-only', 'Só texto']];
  V.conceito = () => {
    const a = S.site.about, secs = S.site.sections || (S.site.sections = []);
    const lim = S.me.tenant.planInfo.sections;
    return `<div class="hd"><div><h1>Conceito e seções</h1><p>Conte o que faz sua casa especial: o conceito, a história, o chef. Você escolhe o nome do botão.</p></div></div>
    <div class="card">${toggle('Mostrar esta seção', 'about.enabled')}
      <div class="f" style="margin:6px 0 14px"><span>Nome no menu do site</span><div class="tabs" style="margin:0">${ABOUT_NAMES.map((n) => `<button class="tab" aria-selected="${S.site.nav.about === n}" data-act="about-name" data-v="${n}">${n}</button>`).join('')}</div><small>Ou escreva outro nome em Aparência → Botões do cabeçalho.</small></div>
      <div class="grid">${field('Texto pequeno acima', 'about.kicker', { max: 40 })}${select('Layout', 'about.layout', layoutOpts)}
      ${field('Título', 'about.title', { rows: 2, max: 80, full: true })}
      ${field('Texto', 'about.text', { rows: 7, max: 2000, full: true, hint: 'Deixe uma linha em branco para começar um novo parágrafo.' })}
      ${image('Foto', 'about.image', { full: true })}</div></div>
    <div class="card"><div class="ch"><div><h3>Destaques</h3><p class="sub" style="margin:2px 0 0">Até 3 pontos curtos que aparecem abaixo do texto (opcional).</p></div>${(a.highlights || []).length < 3 ? `<button class="btn s" data-act="add-hl">+ Destaque</button>` : ''}</div>
      <div class="list">${(a.highlights || []).map((h, i) => `<div class="row"><div class="row-h"><input class="in" data-k="about.highlights.${i}.title" value="${esc(h.title)}" placeholder="Título" maxlength="40">${mv('about.highlights', i, a.highlights.length)}</div><input class="in" style="margin-top:8px" data-k="about.highlights.${i}.text" value="${esc(h.text)}" placeholder="Frase curta" maxlength="120"></div>`).join('') || '<p class="empty">Sem destaques.</p>'}</div></div>
    <div class="hd" style="margin-top:28px"><div><h1 style="font-size:1.3rem">Seções livres</h1><p>Blocos para o que você quiser: o ambiente, eventos, delivery, música ao vivo… Seu plano permite ${lim}.</p></div>
      <button class="btn p" data-act="add-sec"${secs.length >= lim ? ' disabled' : ''}>+ Nova seção</button></div>
    ${secs.map((x, i) => { const p = `sections.${i}`; return `<div class="card"><div class="ch"><h3>${esc(x.title || 'Seção sem título')}</h3>${mv('sections', i, secs.length)}</div>
      ${toggle('Mostrar no site', `${p}.enabled`)}
      <div class="grid">${field('Texto pequeno acima', `${p}.kicker`, { max: 40 })}${field('Botão no menu do site (opcional)', `${p}.navLabel`, { max: 20, hint: 'Deixe vazio para não aparecer no cabeçalho.' })}
      ${field('Título', `${p}.title`, { rows: 2, max: 80, full: true })}${field('Texto', `${p}.text`, { rows: 5, max: 2000, full: true })}
      ${select('Layout', `${p}.layout`, layoutOpts)}${image('Foto', `${p}.image`)}
      ${field('Texto do botão (opcional)', `${p}.buttonText`, { max: 30 })}${select('O botão leva para', `${p}.buttonUrl`, [['#reservar', 'Seção de reservas'], ['whatsapp', 'WhatsApp'], ['#menu', 'Cardápio'], ['#galeria', 'Galeria'], ['#contato', 'Contato']])}</div></div>`; }).join('')}`;
  };

  V.galeria = () => {
    const g = S.site.gallery, lim = S.me.tenant.planInfo.photos, n = g.items.length;
    return `<div class="hd"><div><h1>Galeria</h1><p>Mostre seus pratos, drinks e o ambiente. Use categorias para criar filtros (ex.: Pratos, Drinks, Sobremesas).</p></div></div>
    <div class="card">${toggle('Mostrar a galeria no site', 'gallery.enabled')}
      <div class="grid">${field('Título', 'gallery.title', { rows: 2, max: 80 })}${field('Texto pequeno acima', 'gallery.kicker', { max: 40 })}${field('Introdução (opcional)', 'gallery.intro', { rows: 2, max: 240, full: true })}</div></div>
    <div class="card"><div class="ch"><h3>Fotos</h3><span class="badge">${n} de ${lim}</span></div>
      <div class="meter" style="margin:-6px 0 14px"><i style="width:${Math.min(100, (n / lim) * 100)}%"></i></div>
      <div class="gal">${g.items.map((it, i) => `<div class="ph"><div class="im" style="background-image:url('${esc(it.url)}')">${mv('gallery.items', i, n)}</div><div class="b">
        <input class="in" data-k="gallery.items.${i}.title" value="${esc(it.title)}" placeholder="Nome do prato" maxlength="60">
        <input class="in" data-k="gallery.items.${i}.caption" value="${esc(it.caption)}" placeholder="Legenda (opcional)" maxlength="120">
        <input class="in" data-k="gallery.items.${i}.category" value="${esc(it.category)}" placeholder="Categoria" maxlength="30" list="cats"></div></div>`).join('')}
        ${n < lim ? `<div class="drop" id="drop" role="button" tabindex="0"><b>+ Adicionar fotos</b><span>Clique ou arraste aqui. Comprimimos as fotos automaticamente.</span></div>` : ''}</div>
      <datalist id="cats">${[...new Set(['Pratos', 'Drinks', 'Sobremesas', 'Ambiente', ...g.items.map((x) => x.category).filter(Boolean)])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>`;
  };

  V.reserva = () => `<div class="hd"><div><h1>Reserva e contato</h1><p>O botão “Reservar” abre o WhatsApp do restaurante com uma mensagem pronta.</p></div></div>
    <div class="card"><h3>WhatsApp de reservas</h3><p class="sub">Número com DDD. Ex.: 11 98765-4321</p>
      <div class="grid">${field('WhatsApp', 'reserve.whatsapp', { im: 'tel', max: 20 })}${field('Mensagem inicial', 'reserve.message', { max: 160 })}</div>
      ${toggle('Formulário de reserva no site', 'reserve.showForm', 'O cliente escolhe data, horário e pessoas antes de abrir o WhatsApp.')}
      ${toggle('Botão flutuante do WhatsApp', 'reserve.floatingButton', 'Fica no canto da tela em todas as páginas.')}
      ${toggle('Mostrar a seção de reservas', 'reserve.enabled')}
      <div class="grid" style="margin-top:6px">${field('Título da seção', 'reserve.title', { rows: 2, max: 80 })}${field('Texto', 'reserve.text', { rows: 2, max: 200 })}</div>
      <div style="margin-top:12px"><button class="btn" data-act="test-wa">${ic('wa')} Testar WhatsApp</button></div></div>
    <div class="card"><h3>Contato e localização</h3>
      ${toggle('Mostrar a seção de contato', 'contact.enabled')}
      <div class="grid">${field('Endereço completo', 'contact.address', { max: 200, full: true, hint: 'Usado no mapa e no botão “Como chegar”.' })}
      ${field('Telefone', 'contact.phone', { im: 'tel', max: 20 })}${field('E-mail', 'contact.email', { type: 'email', max: 120 })}
      ${field('Instagram', 'contact.instagram', { ph: '@seurestaurante', max: 60 })}${field('Facebook (link)', 'contact.facebook', { ph: 'https://facebook.com/…', max: 200 })}
      ${field('Título da seção', 'contact.title', { rows: 2, max: 80 })}${field('Texto pequeno acima', 'contact.kicker', { max: 40 })}</div>
      ${toggle('Mostrar mapa do Google', 'contact.showMap')}</div>
    <div class="card"><div class="ch"><h3>Horários de funcionamento</h3><button class="btn s" data-act="add-hour">+ Horário</button></div>
      <div class="list">${(S.site.contact.hours || []).map((h, i) => `<div class="row"><div class="row-h"><input class="in" data-k="contact.hours.${i}.days" value="${esc(h.days)}" placeholder="Dias (ex.: Terça a sexta)" maxlength="40"><input class="in" data-k="contact.hours.${i}.time" value="${esc(h.time)}" placeholder="Horário (ex.: 12h às 23h)" maxlength="60">${mv('contact.hours', i, S.site.contact.hours.length)}</div></div>`).join('') || '<p class="empty">Nenhum horário.</p>'}</div></div>`;

  V.conta = () => `<div class="hd"><div><h1>Meus dados</h1><p>Dados da sua conta e para cobrança da mensalidade. Só você e a equipe MesaPronta veem estas informações.</p></div></div>
    <form id="acc"><div class="card"><h3>Responsável</h3><div class="grid" style="margin-top:12px">
      <label class="f"><span>Nome</span><input class="in" name="u.name" required maxlength="120"></label>
      <label class="f"><span>E-mail de acesso</span><input class="in" name="u.email" type="email" required maxlength="160"></label>
      <label class="f"><span>WhatsApp</span><input class="in" name="u.phone" inputmode="tel" maxlength="20"></label>
      <label class="f"><span>Nome do restaurante</span><input class="in" name="restaurantName" maxlength="120"></label></div></div>
    <div class="card"><h3>Dados de cobrança</h3><div class="grid" style="margin-top:12px">
      <label class="f"><span>Razão social ou nome completo</span><input class="in" name="b.legal_name" maxlength="160"></label>
      <label class="f"><span>CPF ou CNPJ</span><input class="in" name="b.document" inputmode="numeric" maxlength="18"></label>
      <label class="f"><span>E-mail financeiro</span><input class="in" name="b.email" type="email" maxlength="160"></label>
      <label class="f"><span>Telefone financeiro</span><input class="in" name="b.phone" inputmode="tel" maxlength="20"></label>
      <label class="f"><span>CEP</span><input class="in" name="b.cep" inputmode="numeric" maxlength="9"><small>Preenchemos o endereço pelo CEP.</small></label>
      <label class="f"><span>Rua</span><input class="in" name="b.street" maxlength="160"></label>
      <label class="f"><span>Número</span><input class="in" name="b.number" maxlength="20"></label>
      <label class="f"><span>Complemento</span><input class="in" name="b.complement" maxlength="80"></label>
      <label class="f"><span>Bairro</span><input class="in" name="b.district" maxlength="80"></label>
      <label class="f"><span>Cidade</span><input class="in" name="b.city" maxlength="80"></label>
      <label class="f"><span>UF</span><input class="in" name="b.state" maxlength="2"></label>
      <label class="f"><span>Dia de vencimento</span><select class="in" name="b.billing_day">${[5, 10, 15, 20, 25].map((d) => `<option value="${d}">Dia ${d}</option>`).join('')}</select></label>
      <label class="f"><span>Forma de pagamento ${EM_AJUSTE.pagamento ? SELO : ''}</span><select class="in" name="b.payment_method"><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="cartao">Cartão de crédito</option></select>${EM_AJUSTE.pagamento ? '<small>Em ajuste: por enquanto só PIX manual. Boleto e cartão ainda não estão disponíveis.</small>' : ''}</label>
    </div><div style="margin-top:16px"><button class="btn p" type="submit">Salvar dados</button></div></div></form>
    <form id="pw" class="card"><h3>Trocar senha</h3><div class="grid" style="margin-top:12px">
      <label class="f"><span>Senha atual</span><input class="in" name="current" type="password" autocomplete="current-password" required></label>
      <label class="f"><span>Nova senha</span><input class="in" name="next" type="password" autocomplete="new-password" minlength="8" required><small>Mínimo de 8 caracteres.</small></label></div>
      <div style="margin-top:16px"><button class="btn" type="submit">Trocar senha</button></div></form>`;

  V.assinatura = () => `<div class="hd"><div><h1>Assinatura</h1><p>Seu plano, suas faturas e como pagar.</p></div></div>
    <div class="card"><h3>Plano</h3><p class="sub">Troque quando quiser. A mudança vale para as próximas faturas.</p><div class="plans" id="plans"><p class="empty">Carregando…</p></div></div>
    <div class="card" id="payinfo"></div>
    <div class="card"><h3>Faturas</h3><div class="tw" id="inv"><p class="empty">Carregando…</p></div></div>`;

  // ---------- montagem da tela ----------
  function shell() {
    const t = S.me.tenant;
    const banner = t.status === 'overdue' ? `<div class="banner err"><b>Há uma mensalidade em aberto.</b> Regularize para manter seu site no ar.${EM_AJUSTE.pagamento ? ' Por enquanto o pagamento é pela chave PIX, com envio do comprovante.' : ''}<button class="btn s" data-go="assinatura">Ver fatura</button></div>`
      : t.status === 'trial' ? `<div class="banner"><b>Teste grátis até ${dt(t.trialEndsAt)}.</b> Seu site já está no ar; depois desse prazo é só pagar a primeira mensalidade.<button class="btn s" data-go="assinatura">Ver planos</button></div>`
      : t.status === 'suspended' || t.status === 'canceled' ? `<div class="banner err"><b>Seu site está fora do ar (${STATUS[t.status].toLowerCase()}).</b> Fale com o suporte para reativar.</div>` : '';
    $('#root').className = '';
    $('#root').innerHTML = `<div class="app" id="app">
      <header class="top"><a class="brand" href="/painel">Mesa<b>Pronta</b></a>
        <div class="site-url"><span>${esc(S.me.siteUrl.replace(/^https?:\/\//, ''))}</span><button class="btn s ic" title="Copiar link" data-act="copy" data-v="${esc(S.me.siteUrl)}">${ic('copy')}</button><a class="btn s ic" title="Abrir site" href="${esc(S.me.siteUrl)}" target="_blank" rel="noopener">${ic('ext')}</a></div>
        <div class="save" id="save"><i></i><span>Tudo salvo</span></div></header>
      <aside class="side">${NAV.map(([h, items]) => `<h6>${h}</h6>${items.map(([k, l, i]) => `<button class="nv" data-go="${k}" aria-current="${S.view === k}">${ic(i)}${l}${k === 'assinatura' && EM_AJUSTE.pagamento ? SELO : ''}</button>`).join('')}`).join('')}
        <div class="grow"></div><button class="nv" data-act="logout">${ic('out')}Sair</button>
        <div class="user"><div class="av">${esc(S.me.user.name.trim()[0] || '?').toUpperCase()}</div><div><b>${esc(S.me.user.name)}</b><small>${esc(S.me.user.email)}</small></div></div></aside>
      <main class="main" id="main">${banner}<div id="view"></div></main>
      <section class="pvw" id="pvw" aria-label="Pré-visualização"><div class="pvbar"><b style="color:var(--ink)">Prévia ao vivo</b><span>atualiza enquanto você edita</span>
        <div class="seg"><button data-act="pv-mode" data-v="desk" aria-pressed="true">Computador</button><button data-act="pv-mode" data-v="mob" aria-pressed="false">Celular</button></div>
        <button class="btn s pvclose" data-act="pv-close">Fechar</button></div>
        <div class="pvbox" id="pvbox"><iframe id="pv" src="/preview" title="Prévia do site"></iframe></div></section>
    </div><button class="btn p pvfab" data-act="pv-open">${ic('eye')} Ver prévia</button>`;
    $('#pv').addEventListener('load', () => pushPreview());
    new ResizeObserver(fitPreview).observe($('#pvbox'));
    status();
  }
  function fitPreview() {
    const box = $('#pvbox'), f = $('#pv'); if (!box || !f) return;
    if (S.pvMode === 'mob') { box.classList.add('mob'); return; }
    box.classList.remove('mob');
    const W = 1280, k = box.clientWidth / W;
    f.style.width = W + 'px'; f.style.height = (box.clientHeight / k) + 'px'; f.style.transform = `scale(${k})`;
  }
  function render() {
    const main = $('#main'), y = main.scrollTop;
    $('#view').innerHTML = V[S.view]();
    document.querySelectorAll('.nv[data-go]').forEach((b) => b.setAttribute('aria-current', b.dataset.go === S.view));
    main.scrollTop = y;
    if (S.view === 'conta') loadAccount();
    if (S.view === 'assinatura') loadBilling();
    if (S.view === 'galeria') wireDrop();
  }
  function go(view) { S.view = view; render(); $('#main').scrollTop = 0; pushPreview(ANCHOR[view]); history.replaceState(null, '', '#' + view); }

  // ---------- eventos ----------
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.color) return onColor(el);
    const k = el.dataset.k; if (!k || el.type === 'checkbox') return;
    let val = el.value;
    if (el.dataset.list) val = val.split(',').map((x) => x.trim()).filter(Boolean);
    set(S.site, k, val); changed();
    if (k === 'brand.name' || /^menu\.menus\.\d+\.name$/.test(k)) { /* nomes visíveis em abas: atualiza ao sair do campo */ el.onblur = () => render(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target, k = el.dataset.k;
    if (k && el.type === 'checkbox') { set(S.site, k, el.checked); changed(); }
    else if (k && el.tagName === 'SELECT') { set(S.site, k, el.value); changed(); }
    if (el.dataset.act === 'custom') {
      const th = S.site.theme; th.custom = el.checked;
      if (el.checked && !Object.keys(th.colors || {}).length) th.colors = { ...PRESETS[th.preset].colors };
      render(); changed();
    }
  });
  function onColor(el) {
    let val = el.value.trim(); if (!/^#[0-9a-f]{6}$/i.test(val)) return;
    S.site.theme.colors = { ...S.site.theme.colors, [el.dataset.color]: val };
    document.querySelectorAll(`[data-color="${el.dataset.color}"]`).forEach((x) => { if (x !== el) x.value = val; });
    changed();
  }
  const TPL = {
    item: () => ({ id: uid('i'), name: '', description: '', price: '', tags: [] }),
    cat: () => ({ id: uid('c'), name: 'Nova categoria', items: [] }),
  };
  document.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const a = b.dataset.act, p = b.dataset.p, i = +b.dataset.i;
    const arr = p ? get(S.site, p) : null;
    switch (a) {
      case 'up': case 'down': { const j = a === 'up' ? i - 1 : i + 1; [arr[i], arr[j]] = [arr[j], arr[i]]; if (p === 'menu.menus' && S.menuIdx === i) S.menuIdx = j; break; }
      case 'del': {
        const what = /items$/.test(p) && p.startsWith('gallery') ? 'esta foto' : /categories$/.test(p) ? 'esta categoria e todos os itens dela' : p === 'menu.menus' ? 'este cardápio inteiro' : 'este item';
        if (!confirm(`Excluir ${what}?`)) return;
        arr.splice(i, 1); if (p === 'menu.menus') S.menuIdx = Math.max(0, i - 1); break;
      }
      case 'add-item': arr.push(TPL.item()); render(); changed('#menu'); setTimeout(() => { const ins = document.querySelectorAll(`[data-k^="${p}."][data-k$=".name"]`); ins[ins.length - 1]?.focus(); }); return;
      case 'add-cat': arr.push(TPL.cat()); break;
      case 'add-menu': S.site.menu.menus.push({ id: uid('m'), name: 'Novo cardápio', externalUrl: '', categories: [TPL.cat()] }); S.menuIdx = S.site.menu.menus.length - 1; break;
      case 'menu-tab': S.menuIdx = i; render(); return;
      case 'add-hl': (S.site.about.highlights ||= []).push({ title: '', text: '' }); break;
      case 'add-hour': (S.site.contact.hours ||= []).push({ days: '', time: '' }); break;
      case 'add-sec': S.site.sections.push({ id: uid('sec'), enabled: true, navLabel: '', kicker: '', title: 'Nova seção', text: '', image: '', layout: 'image-right', buttonText: '', buttonUrl: '#reservar' }); render(); changed('#sec-' + S.site.sections.at(-1).id); return;
      case 'about-name': S.site.nav.about = b.dataset.v; if (!S.site.about.kicker || ABOUT_NAMES.includes(S.site.about.kicker)) S.site.about.kicker = b.dataset.v; break;
      case 'preset': if (e.target.closest('a')) return; S.site.theme.preset = b.dataset.v; if (S.site.theme.custom) S.site.theme.colors = { ...PRESETS[b.dataset.v].colors }; render(); changed('#topo'); return;
      case 'reset-colors': S.site.theme.colors = { ...PRESETS[S.site.theme.preset].colors }; S.site.theme.fonts = ''; break;
      case 'img': return pickImage(p, +b.dataset.max || 1600);
      case 'clear': set(S.site, p, ''); break;
      case 'copy': try { await navigator.clipboard.writeText(b.dataset.v); toast('Link copiado'); } catch { prompt('Copie o link:', b.dataset.v); } return;
      case 'test-wa': { const n = String(S.site.reserve.whatsapp || '').replace(/\D/g, ''); if (n.length < 10) return toast('Informe um WhatsApp com DDD.', true); window.open(`https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(S.site.reserve.message || '')}`, '_blank', 'noopener'); return; }
      case 'pv-mode': S.pvMode = b.dataset.v; document.querySelectorAll('[data-act=pv-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); fitPreview(); return;
      case 'pv-open': $('#pvw').classList.add('open'); fitPreview(); return;
      case 'pv-close': $('#pvw').classList.remove('open'); return;
      case 'set-plan': return setPlan(b.dataset.v);
      case 'logout': if (S.dirty) await save(); await api('/api/logout', { method: 'POST' }); location.href = '/entrar'; return;
      default: return;
    }
    render(); changed(ANCHOR[S.view]);
  });
  function wireDrop() {
    const d = $('#drop'); if (!d) return;
    const pick = () => { const inp = $('#files'); inp.value = ''; inp.onchange = () => addPhotos(inp.files); inp.click(); };
    d.onclick = pick; d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('on'); }; d.ondragleave = () => d.classList.remove('on');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('on'); addPhotos(e.dataTransfer.files); };
  }

  // ---------- conta ----------
  async function loadAccount() {
    const f = $('#acc'); const d = await api('/api/account');
    const vals = { 'u.name': d.user.name, 'u.email': d.user.email, 'u.phone': d.user.phone, restaurantName: d.restaurantName };
    Object.entries(d.billing).forEach(([k, val]) => (vals['b.' + k] = val));
    for (const [k, val] of Object.entries(vals)) { const el = f.elements[k]; if (el) el.value = val ?? ''; }
    f.elements['b.cep'].onblur = async () => {
      const cep = f.elements['b.cep'].value.replace(/\D/g, ''); if (cep.length !== 8) return;
      try { const r = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json(); if (r.erro) return;
        f.elements['b.street'].value = r.logradouro || ''; f.elements['b.district'].value = r.bairro || ''; f.elements['b.city'].value = r.localidade || ''; f.elements['b.state'].value = r.uf || ''; f.elements['b.number'].focus(); } catch { /* sem internet: preenche à mão */ }
    };
    f.onsubmit = async (e) => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); const body = { user: {}, billing: {}, restaurantName: fd.restaurantName };
      for (const [k, val] of Object.entries(fd)) { if (k.startsWith('u.')) body.user[k.slice(2)] = val; if (k.startsWith('b.')) body.billing[k.slice(2)] = val; }
      try { await api('/api/account', { method: 'PUT', body: JSON.stringify(body) }); toast('Dados salvos'); S.me = await api('/api/me'); } catch (err) { toast(err.message, true); }
    };
    $('#pw').onsubmit = async (e) => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
      try { await api('/api/password', { method: 'PUT', body: JSON.stringify(fd) }); toast('Senha alterada'); e.target.reset(); } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- assinatura ----------
  async function loadBilling() {
    const [{ plans }, { invoices }] = await Promise.all([S.plans.length ? { plans: S.plans } : api('/api/plans'), api('/api/invoices')]);
    S.plans = plans; const t = S.me.tenant;
    $('#plans').innerHTML = plans.map((p) => `<div class="plan${p.id === t.plan ? ' cur' : ''}"><b>${esc(p.name)}</b><div class="pr">${money(p.price)}<small style="font:400 .8rem Inter;color:var(--muted)">/mês</small></div>
      <ul><li>Até ${p.photos} fotos na galeria</li><li>${p.sections} seção(ões) livre(s)</li><li>Cardápio ilimitado</li><li>Reserva por WhatsApp e mapa</li></ul>
      ${p.id === t.plan ? '<span class="badge active">Seu plano</span>' : `<button class="btn s" data-act="set-plan" data-v="${p.id}">Mudar para ${esc(p.name)}</button>`}</div>`).join('');
    const sp = S.me.support;
    $('#payinfo').innerHTML = `<h3>Como pagar ${EM_AJUSTE.pagamento ? SELO : ''}</h3>${EM_AJUSTE.pagamento ? AVISO_PAGAMENTO : ''}<p class="sub">${esc(sp.note || 'Pagamento mensal.')}</p>
      ${sp.pixKey ? `<div class="pix"><span style="flex:1">Chave PIX: ${esc(sp.pixKey)}</span><button class="btn s" data-act="copy" data-v="${esc(sp.pixKey)}">${ic('copy')} Copiar</button></div>` : '<p class="empty">A chave PIX ainda não foi configurada. Fale com o suporte.</p>'}
      ${sp.whatsapp ? `<a class="btn" style="margin-top:12px" href="https://wa.me/${esc(String(sp.whatsapp).replace(/\D/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1'))}?text=${encodeURIComponent('Olá! Sou do ' + t.restaurantName + ' e quero enviar o comprovante da mensalidade.')}" target="_blank" rel="noopener">${ic('wa')} Enviar comprovante pelo WhatsApp</a>` : ''}`;
    $('#inv').innerHTML = invoices.length ? `<table><thead><tr><th>Referência</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>${invoices.map((i) => `<tr><td>${esc(i.reference.split('-').reverse().join('/'))}</td><td>${esc(i.description)}</td><td>${dt(i.due_date)}</td><td>${money(i.amount_cents)}</td><td><span class="badge ${i.status}">${STATUS[i.status] || i.status}</span>${i.paid_at ? ` <small style="color:var(--muted)">em ${dt(i.paid_at)}</small>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nenhuma fatura ainda.</p>';
  }
  async function setPlan(id) {
    const p = S.plans.find((x) => x.id === id);
    if (!confirm(`Mudar para o plano ${p.name} (${money(p.price)}/mês)?`)) return;
    try { await api('/api/plan', { method: 'PUT', body: JSON.stringify({ plan: id }) }); S.me = await api('/api/me'); toast('Plano alterado'); render(); } catch (e) { toast(e.message, true); }
  }

  // ---------- início ----------
  (async function init() {
    try {
      const [me, { site }] = await Promise.all([api('/api/me'), api('/api/site')]);
      S.me = me; S.site = site || window.starterSite?.({}) || {};
      ['nav', 'theme', 'brand', 'hero', 'marquee', 'about', 'menu', 'gallery', 'reserve', 'contact', 'seo', 'footer'].forEach((k) => (S.site[k] ||= {}));
      S.site.sections ||= []; S.site.gallery.items ||= []; S.site.menu.menus ||= []; S.site.theme.colors ||= {};
      const h = location.hash.slice(1); if (V[h]) S.view = h;
      shell(); render();
      addEventListener('hashchange', () => { const v = location.hash.slice(1); if (V[v] && v !== S.view) go(v); });
    } catch (e) { if (!/Sessão/.test(e.message)) $('#root').textContent = e.message; }
  })();
})();
