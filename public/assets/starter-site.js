// Conteúdo inicial do site de um restaurante (usado no cadastro e nas demos dos modelos).
// Funciona no Node (require) e no navegador (window.starterSite).
(function (root) {
  const img = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;
  let n = 0;
  const id = (p) => p + (++n).toString(36) + Math.random().toString(36).slice(2, 7);

  function starterSite(opts = {}) {
    const name = opts.restaurant || 'Casa Oliva';
    const theme = opts.theme || 'elegante';
    const phone = String(opts.whatsapp || '11999999999').replace(/\D/g, '');
    return {
      version: 1,
      theme: { preset: theme, custom: false, colors: {}, fonts: '' },
      brand: { name, logoUrl: '', tagline: 'Cozinha de verdade, feita com calma.' },
      nav: { menu: 'Menu', about: 'Conceito', gallery: 'Galeria', contact: 'Contato', reserve: 'Reservar' },
      hero: {
        kicker: `${name} · São Paulo`,
        title: 'Sabor de casa.\nJeito de festa.',
        subtitle: 'Ingredientes frescos, receitas autorais e uma mesa sempre pronta para receber você.',
        image: img('1504674900247-0877df9cc836'),
        primaryText: 'Reservar minha mesa',
        secondaryText: 'Ver o menu',
      },
      marquee: { enabled: true, text: 'Comida boa. Gente boa. Momentos bons.' },
      about: {
        enabled: true,
        kicker: 'Nossa filosofia',
        title: 'Cozinha com personalidade.',
        text: 'Começamos pequenos, com uma ideia simples: cozinhar como se fosse para a família. Cada prato nasce de ingredientes da estação, técnica cuidadosa e muita vontade de surpreender.\n\nAqui você encontra clássicos revisitados e criações da casa, sempre servidos com atenção.',
        image: img('1414235077428-338989a2e8c0'),
        layout: 'image-right',
        highlights: [
          { title: 'Ingredientes frescos', text: 'Compramos de pequenos produtores toda semana.' },
          { title: 'Feito na hora', text: 'Massas, molhos e sobremesas preparados aqui.' },
          { title: 'Ambiente acolhedor', text: 'Para jantar a dois, em família ou com amigos.' },
        ],
      },
      sections: [
        {
          id: id('sec'), enabled: true, navLabel: '', kicker: 'O ambiente', title: 'Mais do que uma refeição.',
          text: 'Um convite para descobrir sabores, compartilhar momentos e viver a experiência à mesa.',
          image: img('1517248135467-4c7edcad34c4'), layout: 'image-left', buttonText: 'Reservar minha mesa', buttonUrl: '#reservar',
        },
      ],
      menu: {
        enabled: true, kicker: 'Cardápio', title: 'Menu.', intro: 'Pratos e bebidas da casa. Os preços podem variar conforme a estação.',
        menus: [
          {
            id: id('m'), name: 'Comidas', externalUrl: '',
            categories: [
              { id: id('c'), name: 'Entradas', items: [
                { id: id('i'), name: 'Burrata da casa', description: 'Tomates confitados, pesto de manjericão e pão de fermentação natural.', price: '58', tags: ['vegetariano'] },
                { id: id('i'), name: 'Carpaccio clássico', description: 'Lâminas de filé, alcaparras, parmesão e rúcula.', price: '62', tags: [] },
              ] },
              { id: id('c'), name: 'Principais', items: [
                { id: id('i'), name: 'Tagliatelle ao ragu', description: 'Massa fresca com ragu de costela cozido por 8 horas.', price: '89', tags: ['mais pedido'] },
                { id: id('i'), name: 'Risoto de cogumelos', description: 'Arroz arbóreo, mix de cogumelos frescos e manteiga trufada.', price: '84', tags: ['vegetariano'] },
                { id: id('i'), name: 'Filé ao molho de vinho', description: 'Filé-mignon grelhado, purê de batata e legumes da estação.', price: '112', tags: [] },
              ] },
              { id: id('c'), name: 'Sobremesas', items: [
                { id: id('i'), name: 'Tiramisù', description: 'Receita da nonna, montado na hora.', price: '36', tags: [] },
              ] },
            ],
          },
          {
            id: id('m'), name: 'Bebidas', externalUrl: '',
            categories: [
              { id: id('c'), name: 'Drinks', items: [
                { id: id('i'), name: 'Negroni', description: 'Gin, vermute rosso e Campari.', price: '42', tags: [] },
                { id: id('i'), name: 'Spritz', description: 'Aperol, espumante e água com gás.', price: '38', tags: [] },
              ] },
              { id: id('c'), name: 'Sem álcool', items: [
                { id: id('i'), name: 'Limonada siciliana', description: 'Feita na hora.', price: '16', tags: [] },
                { id: id('i'), name: 'Água com ou sem gás', description: '500 ml', price: '9', tags: [] },
              ] },
            ],
          },
        ],
      },
      gallery: {
        enabled: true, kicker: 'Em destaque', title: 'O que a cozinha\nestá contando.', intro: '',
        items: [
          { id: id('g'), url: img('1473093295043-cdd812d0e601', 1000), title: 'Massa fresca', caption: 'Feita todos os dias', category: 'Pratos' },
          { id: id('g'), url: img('1600891964092-4316c288032e', 1000), title: 'Filé ao molho de vinho', caption: '', category: 'Pratos' },
          { id: id('g'), url: img('1551024709-8f23befc6f87', 1000), title: 'Drinks autorais', caption: '', category: 'Bebidas' },
          { id: id('g'), url: img('1540189549336-e6e99c3679fe', 1000), title: 'Salada da estação', caption: '', category: 'Pratos' },
          { id: id('g'), url: img('1565299624946-b28f40a0ae38', 1000), title: 'Pizza de fermentação longa', caption: '', category: 'Pratos' },
          { id: id('g'), url: img('1559339352-11d035aa65de', 1000), title: 'Nosso salão', caption: '', category: 'Ambiente' },
        ],
      },
      reserve: {
        enabled: true, kicker: 'Reservas', title: 'Sua próxima experiência começa aqui.',
        text: 'Escolha o dia e o número de pessoas. A confirmação chega pelo WhatsApp.',
        whatsapp: phone, message: 'Olá! Gostaria de fazer uma reserva.', showForm: true, floatingButton: true,
      },
      contact: {
        enabled: true, kicker: 'Contato', title: 'Venha nos visitar.',
        address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP', phone: phone, email: opts.email || '',
        instagram: '', facebook: '', showMap: true,
        hours: [ { days: 'Terça a sexta', time: '12h às 15h · 19h às 23h' }, { days: 'Sábado e domingo', time: '12h às 23h' } ],
      },
      footer: { text: '' },
      seo: { title: `${name} | Restaurante`, description: 'Reserve sua mesa pelo WhatsApp. Veja o menu, a galeria e como chegar.' },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = starterSite;
  else root.starterSite = starterSite;
})(typeof window !== 'undefined' ? window : globalThis);
