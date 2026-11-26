// Drawings and controls. Every number shown comes from a calc in model.js.
const money = (v, d) => '$' + (+v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const fmts = {
  usd: (v) => (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e4 ? '$' + (v / 1e3).toFixed(1) + 'K' : money(v, Math.abs(v) >= 100 || !+v ? 0 : 2)),
  usd0: (v) => money(v, 0),
  usd2: (v) => money(v, 2),
  num: (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v).toLocaleString('en-US')),
  int: (v) => Math.round(v).toLocaleString('en-US'),
  dec: (v) => (+v).toLocaleString('en-US', {maximumFractionDigits: 2}),
  pct: (v) => (+v).toLocaleString('en-US', {maximumFractionDigits: 1}) + '%',
  delta: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + '%',
  text: (v) => String(v),
};
const fmt = (k, v) => (v === null || v === undefined || v === '' ? '—' : (fmts[k] || fmts.text)(v));
const tick = (v) => d3.format('$~s')(v).replace('k', 'K');
const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const all = (sel) => [...document.querySelectorAll(sel)];
const paint = (i) => dash.colors[i % dash.colors.length];
all('.cc').forEach((n) => n.style.setProperty('--cc-a', paint(0)));

// The rows a drawing needs, or null while they load or after they failed.
const ready = (box, ...ids) => {
  const got = ids.map((id) => dash.data(id)), bad = got.find((g) => g.status !== 'ok');
  box.classList.toggle('dash-skeleton', !!bad && bad.status === 'loading');
  if (!bad) return got.map((g) => g.data);
  box.replaceChildren(...(bad.status === 'loading' ? [] : [h('p', 'cc-fail', bad.status === 'error' ? 'This part did not load.' : '—')]));
  return null;
};
const tipOn = (box) => {
  const node = h('div', 'cc-tip');
  node.hidden = true;
  return {node, hide: () => { node.hidden = true; }, show(ev, title, lines) {
    node.replaceChildren(h('b', '', title), ...lines.filter(Boolean).map((l) => h('span', '', l)));
    node.hidden = false;
    const r = box.getBoundingClientRect(), b = ev.currentTarget.getBoundingClientRect();
    const px = (ev.clientX === undefined ? b.left + b.width / 2 : ev.clientX) - r.left, py = (ev.clientY === undefined ? b.top + b.height / 2 : ev.clientY) - r.top;
    node.style.left = Math.max(0, px + 14 + node.offsetWidth > box.clientWidth ? px - node.offsetWidth - 14 : px + 14) + 'px';
    node.style.top = Math.max(0, py + 14 + node.offsetHeight > box.clientHeight ? py - node.offsetHeight - 14 : py + 14) + 'px';
  }};
};
const hover = (node, tip, title, lines) => {
  const on = (ev) => tip.show(ev, title, lines);
  node.setAttribute('tabindex', '0');
  node.addEventListener('pointermove', on); node.addEventListener('focus', on);
  node.addEventListener('pointerleave', tip.hide); node.addEventListener('blur', tip.hide);
};
const legend = (items) => {
  const l = h('div', 'cc-legend');
  items.forEach(([name, color]) => { const k = h('span', 'cc-key'), s = h('span', 'cc-swatch'); s.style.background = color; k.append(s, name); l.append(k); });
  return l;
};
// Horizontal bars in plain HTML, so labels wrap and values stay readable at any width.
const bars = (box, rows, o, before) => {
  const max = Math.max(1e-9, ...rows.map((d) => (o.from ? o.from(d) : 0) + o.value(d)));
  const list = h('div', 'cc-bars'), tip = tipOn(box);
  rows.forEach((d, i) => {
    const row = h('div', 'cc-bar'), name = h('div', 'cc-bar-name', o.label(d)), track = h('div', 'cc-track'), fill = h('div', 'cc-fill'), val = h('div', 'cc-bar-v', o.text(d));
    fill.style.marginLeft = 100 * (o.from ? o.from(d) : 0) / max + '%';
    fill.style.width = 100 * o.value(d) / max + '%';
    const c = o.color && o.color(d, i);
    if (c) fill.style.background = c;
    if (o.tag && o.tag(d)) name.append(h('span', 'cc-tag', o.tag(d)));
    if (o.sub && o.sub(d)) name.append(h('small', '', o.sub(d)));
    track.append(fill); row.append(name, track, val); hover(row, tip, o.label(d), o.tip(d)); list.append(row);
  });
  box.replaceChildren(...(before ? [before] : []), list, tip.node);
};
const frame = (box, H) => {
  const W = box.clientWidth || 600;
  return {W, H, svg: d3.select(box).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', box.getAttribute('aria-label') || '')};
};
const axisY = (svg, y, x0, x1) => y.ticks(4).forEach((t) => {
  svg.append('line').attr('class', t ? 'cc-gridline' : 'cc-refline').attr('x1', x0).attr('x2', x1).attr('y1', y(t)).attr('y2', y(t));
  svg.append('text').attr('class', 'cc-axis').attr('text-anchor', 'end').attr('x', x0 - 8).attr('y', y(t) + 4).text(tick(t));
});

// One drawing for every single figure or word: it reads its own data-source, data-field and data-where or data-row.
dash.draw('v', (el) => {
  const g = dash.data(el.dataset.source), rows = g.status === 'ok' && Array.isArray(g.data) ? g.data : [];
  const w = (el.dataset.where || '').split('=');
  const row = w.length === 2 ? rows.find((r) => String(r[w[0]]) === w[1]) : rows[+el.dataset.row || 0];
  const v = row ? row[el.dataset.field] : null;
  el.classList.toggle('dash-skeleton', g.status === 'loading');
  el.textContent = fmt(el.dataset.fmt, v);
  if (el.dataset.fmt === 'delta') { el.classList.toggle('cc-up', v > 0); el.classList.toggle('cc-down', v < 0); }
});

// One drawing for every table body: columns come from the table's own header cells.
dash.draw('rows', (body) => {
  const table = body.closest('table'), g = dash.data(table.dataset.source), key = table.dataset.rowKey;
  const cols = [...table.querySelectorAll('thead th')].map((th) => ({field: th.dataset.field, f: th.dataset.fmt || 'text', right: th.classList.contains('cc-r')}));
  body.replaceChildren(...(g.status === 'ok' ? g.data : []).map((r) => {
    const tr = h('tr');
    if (!cols.some((c) => c.field === key)) tr.dataset.key = r[key];
    cols.forEach((c) => {
      const td = h('td', c.right ? 'cc-r' : '');
      if (c.f === 'share') { const bar = h('span', 'cc-mini'), fill = h('i'); fill.style.width = Math.min(100, +r[c.field] || 0) + '%'; bar.append(fill); td.append(bar, fmt('pct', r[c.field])); }
      else td.textContent = fmt(c.f, r[c.field]);
      tr.append(td);
    });
    return tr;
  }));
});

dash.draw('chart-forecast', (box) => {
  const got = ready(box, 'forecast_agents', 'forecast');
  if (!got) return;
  const [split, years] = got, names = [...new Map(split.map((r) => [r.agent_id, r.agent]))];
  const color = (id) => paint(names.findIndex((n) => n[0] === id));
  box.replaceChildren(...(names.length > 1 ? [legend(names.map(([id, name]) => [name, color(id)]))] : []));
  const m = {t: 24, r: 6, b: 40, l: 50}, {svg, W, H} = frame(box, 260), tip = tipOn(box);
  const x = d3.scaleBand(years.map((p) => p.period), [m.l, W - m.r]).padding(0.42);
  const y = d3.scaleLinear([0, (d3.max(years, (p) => p.revenue_year) || 1) * 1.1], [H - m.b, m.t]).nice(4);
  axisY(svg, y, m.l, W - m.r);
  years.forEach((p) => {
    let base = 0;
    split.filter((r) => r.n === p.n && r.revenue_year > 0).forEach((r) => {
      const y0 = y(base), y1 = y(base += r.revenue_year);
      const rect = svg.append('rect').attr('x', x(p.period)).attr('width', x.bandwidth()).attr('y', y1).attr('height', Math.max(1, y0 - y1 - 2)).attr('rx', 3)
        .style('fill', color(r.agent_id)).style('opacity', p.n ? 1 : 0.5);
      hover(rect.node(), tip, r.agent + ', ' + p.period, [fmts.usd0(r.revenue_year) + ' a year', fmts.int(r.users) + ' users']);
    });
    const cx = x(p.period) + x.bandwidth() / 2;
    svg.append('text').attr('class', 'cc-label').attr('text-anchor', 'middle').attr('x', cx).attr('y', y(p.revenue_year) - 6).text(fmts.usd(p.revenue_year));
    svg.append('text').attr('class', 'cc-label').attr('text-anchor', 'middle').attr('x', cx).attr('y', H - m.b + 16).text(p.period);
    svg.append('text').attr('class', 'cc-axis').attr('text-anchor', 'middle').attr('x', cx).attr('y', H - m.b + 31).text(fmts.int(p.users) + ' users');
  });
  box.append(tip.node);
});

dash.draw('chart-runway', (box) => {
  const got = ready(box, 'runway');
  if (!got) return;
  box.replaceChildren();
  const rows = got[0], m = {t: 24, r: 10, b: 40, l: 50}, {svg, W, H} = frame(box, 260), tip = tipOn(box), c = paint(0);
  const x = d3.scaleLinear([0, 36], [m.l, W - m.r]), y = d3.scaleLinear([0, (d3.max(rows, (r) => r.cumulative) || 1) * 1.12], [H - m.b, m.t]).nice(4);
  axisY(svg, y, m.l, W - m.r);
  svg.append('path').attr('d', d3.area().x((r) => x(r.month)).y0(y(0)).y1((r) => y(r.cumulative))(rows)).style('fill', c).style('opacity', 0.12);
  svg.append('path').attr('d', d3.line().x((r) => x(r.month)).y((r) => y(r.cumulative))(rows)).style('fill', 'none').style('stroke', c).style('stroke-width', 2);
  [12, 24, 36].forEach((mth, i) => {
    const r = rows[mth];
    svg.append('circle').attr('cx', x(mth)).attr('cy', y(r.cumulative)).attr('r', 4.5).style('fill', c).style('stroke', 'var(--color-panel)').style('stroke-width', 2);
    svg.append('text').attr('class', 'cc-label').attr('text-anchor', 'end').attr('x', x(mth) - 8).attr('y', y(r.cumulative) - 8).text(fmts.usd(r.cumulative));
    svg.append('text').attr('class', 'cc-label').attr('text-anchor', mth === 36 ? 'end' : 'middle').attr('x', x(mth)).attr('y', H - m.b + 16).text('Year ' + (i + 1));
  });
  svg.append('text').attr('class', 'cc-axis').attr('x', m.l).attr('y', H - m.b + 16).text('Start');
  svg.append('text').attr('class', 'cc-axis').attr('text-anchor', 'end').attr('x', W - m.r).attr('y', H - m.b + 31).text('end of each year');
  const mark = svg.append('g').style('display', 'none');
  mark.append('line').attr('class', 'cc-refline').attr('y1', m.t).attr('y2', H - m.b);
  const dot = mark.append('circle').attr('r', 4).style('fill', 'var(--color-panel)').style('stroke', c).style('stroke-width', 2);
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H - m.t - m.b).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const r = rows[Math.max(0, Math.min(36, Math.round(x.invert(d3.pointer(ev)[0]))))];
      mark.style('display', null).attr('transform', 'translate(' + x(r.month) + ',0)');
      dot.attr('cy', y(r.cumulative));
      tip.show(ev, r.month ? 'Month ' + r.month + ', ' + r.period : 'Start', [fmts.usd0(r.cumulative) + ' so far', r.month ? fmts.usd0(r.revenue_month) + ' this month' : '']);
    })
    .on('pointerleave', () => { mark.style('display', 'none'); tip.hide(); });
  box.append(tip.node);
});

dash.draw('chart-purchase', (box) => {
  const got = ready(box, 'purchase');
  if (got) bars(box, got[0], {label: (d) => d.option, value: (d) => d.cost_month, text: (d) => fmts.usd0(d.cost_month), color: (d) => (d.chosen ? paint(0) : ''),
    sub: (d) => (d.chosen ? 'Counted as revenue here' : ''), tag: (d) => (d.cheapest ? 'Lowest' : ''), tip: (d) => [fmts.usd2(d.cost_month) + ' a month', d.cheapest ? 'The cheapest way to buy this month' : '']});
});

const GROUPS = ['Quote', 'Advisor', 'Other'];
dash.draw('chart-waterfall', (box) => {
  const got = ready(box, 'waterfall');
  if (got) bars(box, got[0], {label: (d) => d.step, from: (d) => d.from, value: (d) => d.to - d.from, text: (d) => fmts.num(d.credits),
    color: (d, i) => (d.total ? 'var(--color-fg-muted)' : i < 3 ? paint(i) : ''), tip: (d) => [fmts.dec(d.credits) + ' credits a month', d.total ? 'Everything, buffer included' : 'Running total ' + fmts.num(d.to)]});
});
dash.draw('chart-activities', (box) => {
  const got = ready(box, 'activity_credits', 'waterfall');
  if (!got) return;
  const rows = got[0].filter((r) => r.credits_month > 0).sort((a, b) => b.credits_month - a.credits_month);
  bars(box, rows, {label: (d) => d.activity, sub: (d) => fmts.num(d.volume_month) + ' a month, ' + fmts.dec(d.credits_each) + ' credits each on average', value: (d) => d.credits_month,
    text: (d) => fmts.num(d.credits_month), color: (d) => paint(GROUPS.indexOf(d.group)), tip: (d) => [fmts.pct(d.share_pct) + ' of the credits before the buffer', 'Volume driven by: ' + d.follows.toLowerCase(), d.note]},
  legend(got[1].slice(0, 3).map((s, i) => [s.step, paint(i)])));
});
dash.draw('chart-meters', (box) => {
  const got = ready(box, 'meters');
  if (got) bars(box, got[0], {label: (d) => d.meter, value: (d) => d.credits_month, text: (d) => fmts.num(d.credits_month), sub: (d) => fmts.pct(d.share_pct), color: () => paint(0),
    tip: (d) => [fmts.dec(d.credits_month) + ' credits a month', fmts.pct(d.share_pct) + ' of the credits before the buffer']});
});
// One card per agent. The tick decides what counts; Adjust picks the agent the sliders change.
const PARTS = ['Quotes', 'Advisor drafts', 'Other scenarios'];
let pickSearch = null, pickBox = null;
const pickFilter = () => {
  const q = pickSearch ? pickSearch.value.trim().toLowerCase() : '';
  if (pickBox) pickBox.querySelectorAll('.cc-ag').forEach((n) => { n.hidden = !!q && !n.dataset.name.includes(q); });
};
dash.draw('agent-cards', (box) => {
  const got = ready(box, 'agent_cards', 'portfolio');
  if (!got) return;
  const now = dash.data('agent_now'), editing = now.status === 'ok' && now.data[0] ? now.data[0].agent_id : '';
  const [cards, pf] = got, p = pf[0] || {}, off = new Set(String(p.off || '').split(',').filter(Boolean));
  pickBox = box;
  const setOff = (next) => dash.setParams({off: [...next].join(',')});
  const tools = h('div', 'cc-pick-tools'), all = h('button', 'cc-btn', 'Select all'), none = h('button', 'cc-btn', 'Clear');
  const sum = h('p', 'cc-pick-sum');
  sum.append(h('b', '', fmts.int(p.selected || 0) + ' of ' + fmts.int(cards.length)), ' agents ticked ', h('span', 'cc-hero-dot', '·'), ' ', h('b', '', fmts.usd0(p.revenue_month || 0)), ' a month');
  all.type = none.type = 'button';
  all.addEventListener('click', () => setOff([]));
  none.addEventListener('click', () => setOff(cards.map((c) => c.agent_id)));
  if (cards.length > 8) {
    if (!pickSearch) { pickSearch = h('input', 'cc-text cc-pick-q'); pickSearch.type = 'search'; pickSearch.placeholder = 'Search agents'; pickSearch.setAttribute('aria-label', 'Search agents'); pickSearch.addEventListener('input', pickFilter); }
    tools.append(sum, pickSearch, all, none);
  } else tools.append(sum, all, none);
  const grid = h('div', 'cc-pick-grid');
  cards.forEach((c) => {
    const card = h('article', 'cc-ag' + (c.on ? ' cc-ag-on' : '') + (c.agent_id === editing ? ' cc-ag-edit-now' : ''));
    card.dataset.name = c.agent.toLowerCase();
    const top = h('div', 'cc-ag-top'), label = h('label', 'cc-ag-name'), tick = h('input');
    tick.type = 'checkbox'; tick.checked = c.on;
    tick.addEventListener('change', () => { const next = new Set(off); if (tick.checked) next.delete(c.agent_id); else next.add(c.agent_id); setOff(next); });
    label.append(tick, h('span', '', c.agent));
    top.append(label, h('span', 'cc-ag-pill' + (c.status === 'Live' ? ' cc-ag-live' : ''), c.status));
    const val = h('p', 'cc-ag-v', fmts.usd0(c.revenue_month));
    const later = c.live !== 'Live today' ? ' ' + c.live.replace('From', 'from') : '';
    val.append(h('small', '', ' a month' + later + (c.on ? '' : ', if ticked')));
    const track = h('div', 'cc-ag-track'), fill = h('i');
    fill.style.width = Math.min(100, c.share_pct) + '%';
    track.append(fill);
    const who = String(c.users_label || 'Users').split(' ')[0].toLowerCase();
    const counted = !c.on ? 'Not counted' : later ? 'Counts' + later : fmts.pct(c.share_pct) + ' of the selection';
    const meta = h('p', 'cc-ag-meta', counted + ' · ' + fmts.int(c.users) + ' ' + who + (c.editable ? ' · ' + c.build : ''));
    card.append(top, val, track, meta);
    if (c.parts.length) {
      const parts = h('div', 'cc-ag-parts'), bar = h('div', 'cc-ag-stack'), keys = h('div', 'cc-ag-keys');
      parts.append(h('span', 'cc-ag-k', 'Covers ' + c.covers + ' activities'));
      c.parts.forEach((x) => {
        const i = PARTS.indexOf(x.part) < 0 ? 0 : PARTS.indexOf(x.part), seg = h('i'), key = h('span', 'cc-key'), sw = h('span', 'cc-swatch');
        seg.style.width = x.pct + '%'; seg.style.background = paint(i); seg.title = x.part + ': ' + fmts.pct(x.pct);
        sw.style.background = paint(i); key.append(sw, x.part + ' ' + Math.round(x.pct) + '%');
        bar.append(seg); keys.append(key);
      });
      parts.append(bar, keys);
      card.append(parts);
    } else if (c.credits_per_user) card.append(h('p', 'cc-ag-meta', 'Your estimate: ' + fmts.dec(c.credits_per_user) + ' credits per user a month'));
    if (c.editable) {
      const go = h('button', 'cc-ag-btn', c.agent_id === editing ? 'Editing in the controls' : 'Adjust');
      go.type = 'button';
      go.addEventListener('click', () => dash.setParams({agent: c.agent_id}));
      card.append(go);
    }
    grid.append(card);
  });
  const add = h('button', 'cc-ag-add');
  add.type = 'button';
  add.append(h('b', '', '+ Add an agent'), h('small', '', 'One with no calculator yet'));
  add.addEventListener('click', () => { const f = document.querySelector('#add-agent input'); if (f) { f.scrollIntoView({behavior: 'smooth', block: 'center'}); f.focus({preventScroll: true}); } });
  grid.append(add);
  box.replaceChildren(tools, grid);
  if (cards.length > 8) pickFilter();
});

// The two builds side by side at the top: whichever earns more is the green one.
dash.draw('hero-builds', (box) => {
  const got = ready(box, 'build_compare', 'agents');
  if (!got) return;
  const [rows, agents] = got, ids = agents.map((a) => a.agent_id);
  if (!rows.length || !rows[0].agents_modelled) { box.replaceChildren(h('p', 'cc-hero-empty', 'Tick an agent that has a calculator to compare the two builds.')); return; }
  const card = (r) => {
    const c = h('article', 'cc-build ' + (r.higher ? 'cc-build-win' : 'cc-build-alt')), head = h('div', 'cc-build-head');
    c.setAttribute('aria-label', r.build + ': ' + fmts.usd0(r.revenue_month) + ' a month' + (r.higher ? ', the higher revenue' : ''));
    head.append(h('span', 'cc-build-name', r.build));
    if (r.in_use !== 'No') head.append(h('span', 'cc-badge', r.in_use === 'All' ? 'In use' : 'In use by ' + r.agents_on + ' of ' + r.agents_modelled));
    if (r.higher) head.append(h('span', 'cc-badge cc-badge-win', r.times_other ? '▲ ' + fmts.dec(Math.round(r.times_other * 10) / 10) + '× more revenue' : '▲ Higher revenue'));
    const big = h('p', 'cc-build-v', fmts.usd0(r.revenue_month));
    big.append(h('small', '', 'a month'));
    const sub = h('p', 'cc-build-sub');
    sub.append(h('b', '', fmts.usd(r.revenue_year)), ' a year ', h('span', 'cc-hero-dot', '·'), ' ', h('b', '', fmts.usd(r.three_year)), ' over three years');
    const track = h('div', 'cc-build-track'), fill = h('i');
    fill.style.width = Math.max(1.5, r.scale_pct) + '%';
    track.append(fill);
    c.append(head, big, sub, track, h('p', 'cc-build-foot', fmts.num(r.credits_month) + ' credits a month'));
    if (r.in_use !== 'All' && ids.length) {
      const go = h('button', 'cc-build-use', ids.length > 1 ? 'Switch every agent to this build' : 'Switch to this build');
      go.type = 'button';
      go.addEventListener('click', () => dash.setParams(Object.fromEntries(ids.map((id) => [id + '_build', r.build_id]))));
      c.append(go);
    }
    return c;
  };
  const vs = h('div', 'cc-vs', 'vs');
  vs.setAttribute('aria-hidden', 'true');
  box.replaceChildren(card(rows[0]), vs, ...rows.slice(1).map(card));
});
dash.draw('chart-heat', (box) => {
  const got = ready(box, 'heat');
  if (!got) return;
  const rows = got[0], users = [...new Set(rows.map((r) => r.users))], shares = [...new Set(rows.map((r) => r.licence_pct))];
  const max = d3.max(rows, (r) => r.revenue_month) || 1, tip = tipOn(box), table = h('table', 'cc-heat'), head = h('tr');
  head.append(h('th', '', ''), ...users.map((u) => h('th', '', fmts.int(u))));
  table.append(head);
  shares.forEach((s) => {
    const tr = h('tr');
    tr.append(h('th', '', s + '%'));
    users.forEach((u) => {
      const r = rows.find((d) => d.users === u && d.licence_pct === s), td = h('td', r.current ? 'cc-here' : '', fmts.usd(r.revenue_month));
      td.style.background = 'color-mix(in srgb, ' + paint(0) + ' ' + Math.round(6 + 49 * r.revenue_month / max) + '%, transparent)';
      hover(td, tip, fmts.int(u) + ' users, ' + s + '% licensed', [fmts.usd2(r.revenue_month) + ' a month', r.current ? 'The current setting' : '']);
      tr.append(td);
    });
    table.append(tr);
  });
  box.replaceChildren(table, tip.node);
});

// Planned agents are rows people save on the page.
const PLANNED = 'data/portfolio/agents';
const save = async (work) => {
  let ok = true;
  try { const db = await claude.use('db'); if (!db) throw new Error('no store'); await work(db); } catch (e) { ok = false; }
  all('.cc-unsaved').forEach((p) => { p.hidden = ok; });
  return ok;
};
dash.draw('planned-list', (list) => {
  const g = dash.data('planned'), when = ['Live today', 'From Year 1', 'From Year 2', 'From Year 3'];
  list.replaceChildren(...(g.status === 'ok' ? g.data : []).map((r) => {
    const li = h('li'), gone = h('button', 'cc-btn', 'Remove');
    gone.type = 'button';
    gone.addEventListener('click', () => save((db) => db.doc(PLANNED + '/' + r.id).delete()));
    li.append(h('b', '', String(r.name || 'Planned agent')), fmt('int', +r.users || 0) + ' users', fmt('dec', +r.credits_per_user || 0) + ' credits per user', when[Math.min(3, Math.max(0, Math.round(+r.starts || 0)))], gone);
    return li;
  }));
});
all('#add-agent').forEach((form) => form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = new FormData(form), row = {name: String(f.get('agent_name') || '').trim().slice(0, 60), users: Math.max(0, Math.round(+f.get('users') || 0)),
    credits_per_user: Math.max(0, +f.get('credits') || 0), starts: Math.min(3, Math.max(0, Math.round(+f.get('starts') || 0)))};
  if (row.name) save((db) => db.collection(PLANNED).add(row)).then((ok) => ok && form.reset());
}));

// Controls: each one writes a filter; the calcs do the rest.
let agent = '', waiting = {}, frameId = 0;
const send = (name, value) => {
  waiting[name] = value;
  if (!frameId) frameId = requestAnimationFrame(() => { const p = waiting; waiting = {}; frameId = 0; dash.setParams(p); });
};
all('.cc [data-p]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
  const name = (el.dataset.scope === 'agent' ? agent + '_' : '') + el.dataset.p;
  if (el.tagName === 'SELECT') return send(name, el.value);
  if (el.value === '' || !Number.isFinite(+el.value) || (el.dataset.scope === 'agent' && !agent)) return;
  send(name, Math.min(+el.max || Infinity, Math.max(+el.min || 0, +el.value)));
}));
all('#reset').forEach((b) => b.addEventListener('click', () => dash.resetParams()));
dash.draw('agent-pick', (sel) => {
  const g = dash.data('agents'), now = dash.data('agent_now'), rows = g.status === 'ok' ? g.data : [];
  if (rows.map((r) => r.agent_id).join() !== [...sel.options].map((o) => o.value).join()) sel.replaceChildren(...rows.map((r) => new Option(r.agent, r.agent_id)));
  if (now.status === 'ok' && now.data[0]) sel.value = now.data[0].agent_id;
  sel.onchange = () => dash.setParams({agent: sel.value});
});
dash.onData(() => {
  const now = dash.data('agent_now'), pf = dash.data('portfolio'), g = dash.data('planned');
  const a = now.status === 'ok' ? now.data[0] : null, p = pf.status === 'ok' ? pf.data[0] : null;
  if (a) agent = a.agent_id;
  const values = {agent: a ? {users: a.users, units: a.units_per_user, extra: a.extra_per_month, lic: a.licence_pct, build: a.s_build, model: a.s_model, rule: a.s_rule, other: a.s_other} : {},
    all: p ? {basis: p.s_basis, buffer: p.buffer_pct, growth: p.growth_pct} : {}};
  all('.cc [data-p]').forEach((el) => {
    const v = values[el.dataset.scope === 'agent' ? 'agent' : 'all'][el.dataset.p];
    if (v !== undefined && document.activeElement !== el && String(el.value) !== String(v)) el.value = v;
    if (el.dataset.std !== undefined) el.disabled = !!a && a.s_build === 'harness';
  });
  all('#hint-harness').forEach((n) => { n.hidden = !a || a.s_build !== 'harness'; });
  all('#ctl-extra').forEach((n) => { n.hidden = !!a && !a.extra_label; });
  all('#planned-empty').forEach((n) => { n.hidden = g.status !== 'ok' || g.data.length > 0; });
});
