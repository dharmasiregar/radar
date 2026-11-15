(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) {
    if (app) app.textContent = 'Local radar data is missing. Run the generator to create data.js.';
    return;
  }

  var state = { query: '', category: 'all', chain: 'all', watchlist: false, sort: 'rank', direction: 1, selected: null };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var factors = [
    { key: 'categoryMultiple', label: 'Category', note: 'Category median token multiple' },
    { key: 'growthMult', label: 'Growth', note: 'Weighted 7-day TVL change' },
    { key: 'maturityMult', label: 'Maturity', note: 'Protocol age adjustment' },
    { key: 'breadthMult', label: 'Breadth', note: 'Additional chain coverage' }
  ];

  function node(tag, attrs) {
    var item = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined) return;
      if (key === 'text') item.textContent = value;
      else if (key === 'class') item.className = value;
      else if (key.slice(0, 2) === 'on') item.addEventListener(key.slice(2), value);
      else item.setAttribute(key, value);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (Array.isArray(child)) child.forEach(function (part) { if (part) item.appendChild(part); });
      else if (child) item.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return item;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
    if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
    return money.format(value);
  }

  function formatChange(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    return days >= 365 ? (days / 365).toFixed(1) + 'y' : Math.max(0, Math.round(days)) + 'd';
  }

  function filteredRows() {
    var query = state.query.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      if (state.category !== 'all' && row.category !== state.category) return false;
      if (state.chain !== 'all' && row.chains.indexOf(state.chain) < 0) return false;
      if (state.watchlist && !row.watchlist) return false;
      if (!query) return true;
      return [row.name, row.slug, row.category, row.chains.join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) {
      var left = a[state.sort];
      var right = b[state.sort];
      if (left === null || left === undefined) left = -Infinity;
      if (right === null || right === undefined) right = -Infinity;
      if (left < right) return -state.direction;
      if (left > right) return state.direction;
      return a.rank - b.rank;
    });
  }

  function header() {
    return node('header', { class: 'masthead' },
      node('a', { class: 'wordmark', href: '#board', 'aria-label': 'Token Radar home' },
        node('span', { class: 'radar-mark', 'aria-hidden': 'true' }),
        node('span', { text: 'TOKEN / RADAR' })
      ),
      node('div', { class: 'snapshot' },
        node('span', { class: 'live-dot', 'aria-hidden': 'true' }),
        node('span', { text: 'SNAPSHOT ' + DATA.as_of }),
        node('span', { class: 'version', text: DATA.model_version + ' MODEL' })
      )
    );
  }

  function intro() {
    var model = DATA.model;
    var formula = node('section', { class: 'model-strip', 'aria-label': 'Model v2 formula' },
      node('div', { class: 'formula-title' },
        node('span', { class: 'eyebrow', text: 'MODEL / V2' }),
        node('p', { class: 'formula', text: 'implied = TVL × categoryMultiple × growthMult × maturityMult × breadthMult' })
      ),
      node('div', { class: 'factor-legend' }, [
        node('span', null, node('b', { text: 'categoryMultiple' }), ' category median'),
        node('span', null, node('b', { text: 'growthMult' }), ' 7d change'),
        node('span', null, node('b', { text: 'maturityMult' }), ' protocol age'),
        node('span', null, node('b', { text: 'breadthMult' }), ' chain coverage')
      ])
    );
    return node('section', { class: 'intro' },
      node('div', { class: 'intro-copy' },
        node('p', { class: 'eyebrow', text: 'PRE-TOKEN PROTOCOLS / ' + DATA.board_size + ' TRACKED' }),
        node('h1', null, 'Signal before ', node('span', { class: 'accent' }, 'the ticker.')),
        node('p', { class: 'description', text: 'A watchlist-first radar for protocols without a live token. Implied value is a model estimate, not a price target.' }),
        node('p', { class: 'floor-note', text: 'WATCHLIST FLOOR  ' + formatMoney(DATA.floor_usd) + ' TVL  /  ' + DATA.watchlist_size + ' protocols watched' })
      ),
      node('aside', { class: 'model-card' },
        node('div', { class: 'card-topline' }, node('span', { class: 'eyebrow', text: 'SCORING EQUATION' }), node('span', { class: 'tag', text: 'RADAR 2.0' })),
        formula,
        node('p', { class: 'model-footnote', text: 'Every row scored from snapshot TVL, change, age and chain coverage. ' + model.category_min_samples + '+ token samples per category; otherwise global median or ' + model.fallback_category_multiple + ' fallback.' })
      )
    );
  }

  function controlPanel() {
    var categories = Array.from(new Set(DATA.rows.map(function (row) { return row.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (all, row) { return all.concat(row.chains); }, []))).sort();
    var search = node('input', { type: 'search', placeholder: 'Name, category, chain…', value: state.query, 'aria-label': 'Search protocols', oninput: function (event) { state.query = event.target.value; render(); } });
    var category = node('select', { 'aria-label': 'Filter by category', onchange: function (event) { state.category = event.target.value; render(); } },
      node('option', { value: 'all', text: 'All categories' }),
      categories.map(function (value) { return node('option', { value: value, text: value, selected: value === state.category ? 'selected' : null }); })
    );
    var chain = node('select', { 'aria-label': 'Filter by chain', onchange: function (event) { state.chain = event.target.value; render(); } },
      node('option', { value: 'all', text: 'All chains' }),
      chains.map(function (value) { return node('option', { value: value, text: value, selected: value === state.chain ? 'selected' : null }); })
    );
    return node('section', { class: 'toolbar', 'aria-label': 'Board filters' },
      node('label', { class: 'search-control' }, node('span', { class: 'control-label', text: 'SEARCH' }), search),
      node('label', { class: 'select-control' }, node('span', { class: 'control-label', text: 'CATEGORY' }), category),
      node('label', { class: 'select-control' }, node('span', { class: 'control-label', text: 'CHAIN' }), chain),
      node('label', { class: 'watch-toggle' },
        node('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, onchange: function (event) { state.watchlist = event.target.checked; render(); } }),
        node('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
        node('span', { text: 'WATCHLIST ONLY' })
      )
    );
  }

  function sortButton(label, key) {
    var active = state.sort === key;
    return node('th', { scope: 'col', 'aria-sort': active ? (state.direction > 0 ? 'ascending' : 'descending') : 'none' },
      node('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.direction *= -1;
        else { state.sort = key; state.direction = key === 'rank' ? 1 : -1; }
        render();
      } }, label, node('span', { class: 'sort-indicator', 'aria-hidden': 'true', text: active ? (state.direction > 0 ? ' ↑' : ' ↓') : ' ↕' }))
    );
  }

  function table() {
    var rows = filteredRows();
    var max = rows.reduce(function (highest, row) { return Math.max(highest, row.implied_value_usd); }, 1);
    var body = node('tbody', null, rows.length ? rows.map(function (row) {
      var growth = row.change_7d === null ? '' : row.change_7d >= 0 ? 'positive' : 'negative';
      return node('tr', {
        tabindex: '0',
        'aria-label': row.name + ', rank ' + row.rank + ', open details',
        'data-selected': state.selected === row.slug ? 'true' : 'false',
        onclick: function () { openDetail(row); },
        onkeydown: function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(row); } }
      },
        node('td', { class: 'numeric rank', text: String(row.rank).padStart(3, '0') }),
        node('td', { class: 'protocol-cell' },
          node('span', { class: 'protocol-name', text: row.name }),
          node('span', { class: 'protocol-meta', text: (row.category || 'Other') + '  /  ' + row.chains.slice(0, 3).join(', ') + (row.chains.length > 3 ? ' +' + (row.chains.length - 3) : '') })
        ),
        node('td', { class: 'numeric', text: formatMoney(row.tvl_usd) }),
        node('td', { class: 'numeric ' + growth, text: formatChange(row.change_7d) }),
        node('td', { class: 'value-cell' },
          node('span', { class: 'numeric value-label', text: formatMoney(row.implied_value_usd) }),
          node('span', { class: 'value-track', 'aria-hidden': 'true' }, node('i', { style: 'width:' + Math.max(2, Math.round(row.implied_value_usd / max * 100)) + '%' }))
        ),
        node('td', null, row.watchlist ? node('span', { class: 'watch-badge', text: 'WATCH' }) : node('span', { class: 'early-badge', text: 'EARLY' }))
      );
    }) : [node('tr', null, node('td', { class: 'empty', colspan: '6', text: 'NO SIGNALS — loosen filters to scan the board.' }))]);
    var tableNode = node('table', null,
      node('thead', null, node('tr', null,
        sortButton('RANK', 'rank'),
        node('th', { scope: 'col', text: 'PROTOCOL' }),
        sortButton('TVL', 'tvl_usd'),
        sortButton('CHANGE 7D', 'change_7d'),
        sortButton('IMPLIED VALUE', 'implied_value_usd'),
        node('th', { scope: 'col', text: 'TRACK' })
      )),
      body
    );
    return node('section', { class: 'board-panel', 'aria-label': 'Protocol rankings' },
      node('div', { class: 'board-heading' },
        node('div', null, node('span', { class: 'eyebrow', text: 'LIVE SCAN / PRE-TOKEN' }), node('h2', { text: 'Protocol board' })),
        node('span', { class: 'result-count numeric', text: String(rows.length).padStart(3, '0') + ' / ' + DATA.board_size + ' ROWS' })
      ),
      node('div', { class: 'table-wrap' }, tableNode)
    );
  }

  function factorRow(row, factor) {
    var value = row[factor.key];
    var width = Math.max(2, Math.min(100, value / 1.2 * 100));
    return node('div', { class: 'factor-row' },
      node('div', { class: 'factor-copy' },
        node('span', { class: 'factor-name', text: factor.label }),
        node('span', { class: 'factor-note', text: factor.note })
      ),
      node('span', { class: 'numeric factor-value', text: Number(value).toFixed(4) }),
      node('span', { class: 'factor-track', 'aria-hidden': 'true' }, node('i', { style: 'width:' + width + '%' }))
    );
  }

  function openDetail(row) {
    state.selected = row.slug;
    var steps = (row.farm_steps || []).map(function (step) {
      var split = step.indexOf(' Cost: ');
      return node('li', null,
        node('span', { class: 'step-action', text: split < 0 ? step : step.slice(0, split) }),
        split < 0 ? null : node('span', { class: 'step-cost', text: step.slice(split + 1) })
      );
    });
    var dialog = node('dialog', { class: 'detail-panel', 'aria-labelledby': 'detail-title' },
      node('div', { class: 'detail-top' },
        node('div', null,
          node('span', { class: 'eyebrow', text: 'RANK ' + String(row.rank).padStart(3, '0') + ' / ' + (row.watchlist ? 'WATCHLIST' : 'EARLY SIGNAL') }),
          node('h2', { id: 'detail-title', text: row.name }),
          node('p', { class: 'detail-meta', text: (row.category || 'Other') + '  /  ' + row.chains.join(', ') })
        ),
        node('button', { class: 'close-button', type: 'button', 'aria-label': 'Close details', text: '×', onclick: function () { dialog.close(); } })
      ),
      node('div', { class: 'detail-stats' },
        node('div', null, node('span', { class: 'eyebrow', text: 'IMPLIED VALUE' }), node('b', { class: 'numeric', text: formatMoney(row.implied_value_usd) })),
        node('div', null, node('span', { class: 'eyebrow', text: 'TVL' }), node('b', { class: 'numeric', text: formatMoney(row.tvl_usd) })),
        node('div', null, node('span', { class: 'eyebrow', text: 'CHANGE 7D' }), node('b', { class: 'numeric', text: formatChange(row.change_7d) })),
        node('div', null, node('span', { class: 'eyebrow', text: 'AGE' }), node('b', { class: 'numeric', text: formatAge(row.age_days) }))
      ),
      node('section', { class: 'detail-section' },
        node('div', { class: 'section-heading' }, node('span', { class: 'eyebrow', text: 'MULTIPLIER BREAKDOWN' }), node('span', { class: 'numeric', text: '× 4 FACTORS' })),
        node('div', { class: 'factor-list' }, factors.map(function (factor) { return factorRow(row, factor); }))
      ),
      node('section', { class: 'detail-section farm-section' },
        node('div', { class: 'section-heading' }, node('span', { class: 'eyebrow', text: 'FARM PLAN' }), node('span', { class: 'numeric', text: String(steps.length).padStart(2, '0') + ' STEPS' })),
        node('ol', { class: 'farm-steps' }, steps)
      )
    );
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () { state.selected = null; });
    document.body.appendChild(dialog);
    dialog.addEventListener('close', function () { dialog.remove(); render(); }, { once: true });
    dialog.showModal();
  }

  function render() {
    var active = document.activeElement;
    var keepSearch = active && active.getAttribute('aria-label') === 'Search protocols';
    var cursor = keepSearch ? active.selectionStart : null;
    app.textContent = '';
    app.appendChild(node('main', { class: 'shell' }, header(), intro(), controlPanel(), table(),
      node('footer', { class: 'footer' }, node('span', { text: 'LOCAL SNAPSHOT  /  ' + DATA.as_of }), node('span', { text: 'No live requests · model output, not financial advice' }))
    ));
    app.setAttribute('aria-busy', 'false');
    if (keepSearch) {
      var search = app.querySelector('[aria-label="Search protocols"]');
      search.focus();
      if (cursor !== null) search.setSelectionRange(cursor, cursor);
    }
  }

  render();
})();
