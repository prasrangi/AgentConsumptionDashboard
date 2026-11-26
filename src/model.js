// The credit model. Every figure on the page is one of these calcs.
// Agents, their activities and Microsoft's rates come from the calculator workbooks;
// the settings come from the controls (dash.params). Money and credits are rounded to 2 places.
const num = (v, d = 0) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
const r2 = (x) => Math.round(x * 100) / 100;
const PERIODS = ['Today', 'Year 1', 'Year 2', 'Year 3'];
const BUILDS = {standard: 'Standard agent', harness: 'Copilot harness agent'};
const BASES = {payg: 'Pay-as-you-go', packs: 'Packs only', hybrid: 'Packs plus pay-as-you-go', lowest: 'Lowest of the three'};
const METERS = [['Replies', 'replies', 'reply'], ['Tool calls', 'tool_calls', 'tool_call'], ['Graph searches', 'graph_searches', 'graph_search'],
  ['AI drafting', 'ai_tokens_k', 'ai'], ['Flow steps', 'flow_steps', 'flow_step'], ['Page reads', 'pages', 'page_read']];
const TASKS = {Light: 'Light tasks', Medium: 'Medium tasks', Heavy: 'Heavy tasks', 'Flow steps': 'Flow steps', 'Per unit': 'Per-unit meters', Build: 'Build sessions'};

// The three ways to buy a month of credits, as on the workbook's Monthly Estimate sheet.
const buy = (credits, rate, basis) => {
  const payg = credits * rate.price_per_credit;
  const needed = Math.ceil(credits / rate.pack_credits), whole = Math.floor(credits / rate.pack_credits);
  const packs = needed * rate.pack_price;
  const hybrid = whole * rate.pack_price + (credits - whole * rate.pack_credits) * rate.price_per_credit;
  const lowest = Math.min(payg, packs, hybrid);
  const cheapest = payg <= Math.min(packs, hybrid) ? BASES.payg : hybrid <= packs ? BASES.hybrid : BASES.packs;
  return {payg, packs, hybrid, lowest, cheapest, needed, revenue: {payg, packs, hybrid, lowest}[basis] ?? payg};
};

// What the reader set for one agent, falling back to the workbook's own inputs.
const settings = (a, P) => {
  const g = (k, d) => P[a.agent_id + '_' + k] ?? d;
  return {
    users: Math.max(0, Math.round(num(g('users', a.users)))), units: Math.max(0, num(g('units', a.units_per_user))),
    extra: Math.max(0, num(g('extra', a.extra_per_month))), lic: Math.min(100, Math.max(0, num(g('lic', a.licence_pct)))) / 100,
    build: g('build', String(a.build).toLowerCase().includes('harness') ? 'harness' : 'standard') === 'harness' ? 'harness' : 'standard',
    model: g('model', a.model) === 'Premium' ? 'Premium' : 'Standard',
    rule: g('rule', a.licence_rule === 'Conservative' ? 'conservative' : 'guide') === 'conservative' ? 'conservative' : 'guide',
    other: g('other', 'in') === 'out' ? 'out' : 'in',
  };
};

// One month of one agent: users is the user count, grow multiplies the usage volumes that are set on their own.
const month = (acts, rate, s, users, grow) => {
  const ai = s.model === 'Premium' ? rate.ai_premium : rate.ai_standard;
  const out = {rows: [], groups: {Quote: 0, Advisor: 0, Other: 0}, meters: {}, unit: 0, unitLicensed: 0};
  for (const a of acts) {
    if (a.group === 'Other' && s.other === 'out') continue;
    const parts = METERS.map(([, col, key]) => num(a[col]) * (key === 'ai' ? ai : rate[key]));
    const full = parts.reduce((x, y) => x + y, 0);
    const charged = (i) => a.licensed_pay === 'Yes' || (s.rule === 'conservative' && i !== 0 && i !== 2);
    const licensed = parts.reduce((x, y, i) => x + (charged(i) ? y : 0), 0);
    const t = a.harness_task;
    const harness = t === 'Light' ? rate.light : t === 'Medium' ? rate.medium : t === 'Heavy' ? rate.heavy
      : t === 'Flow steps' ? num(a.flow_steps) * rate.harness_flow_step : t === 'Per unit' ? full : t === 'Build' ? rate.build_session : 0;
    const volume = a.driver === 'unit' ? users * s.units * a.volume : a.driver === 'user' ? users * a.volume
      : (a.driver === 'extra' ? s.extra : 1) * a.volume * (a.scaling === 'usage' ? grow : 1);
    const each = s.build === 'harness' ? harness : (1 - s.lic) * full + s.lic * licensed;
    const credits = volume * each;
    out.groups[a.group] += credits;
    if (s.build === 'harness') { if (credits) out.meters[TASKS[t]] = (out.meters[TASKS[t]] || 0) + credits; }
    else parts.forEach((p, i) => { out.meters[METERS[i][0]] = (out.meters[METERS[i][0]] || 0) + volume * ((1 - s.lic) * p + (charged(i) ? s.lic * p : 0)); });
    if (a.group === 'Quote') { out.unit += a.volume * (s.build === 'harness' ? harness : full); out.unitLicensed += a.volume * (s.build === 'harness' ? harness : licensed); }
    out.rows.push({seq: a.seq, activity: a.activity, group: a.group,
      follows: a.driver === 'unit' ? 'Each ' + s.unitName : a.driver === 'user' ? 'Each user' : a.driver === 'extra' ? 'Its own slider' : a.scaling === 'usage' ? 'A set monthly volume' : 'Fixed overhead',
      volume_month: r2(volume), credits_each: r2(each), credits_month: r2(credits), note: a.note});
  }
  out.before = out.groups.Quote + out.groups.Advisor + out.groups.Other;
  return out;
};
const usersIn = (users, growth, n) => Math.round(users * (1 + growth) ** n);

dash.calc('engine', {
  title: 'Agent credit model',
  description: 'Rebuilds each calculator workbook at the settings chosen on the page: monthly volume of every activity times its credits, blended by licence share, plus the safety buffer, for today and each forecast year.',
  inputs: ['agents', 'activities', 'rates'],
  fn: (agents, activities, rates) => {
    const P = dash.params();
    const rate = Object.fromEntries(rates.map((r) => [r.key, num(r.value)]));
    const buffer = Math.max(0, num(P.buffer, rate.buffer * 100)) / 100, growth = Math.max(0, num(P.growth, 10)) / 100;
    const basis = BASES[P.basis] ? P.basis : 'payg';
    const chosen = agents.find((a) => a.agent_id === P.agent) || agents[0];
    const out = {rate, buffer, growth, basis, agents: [], detail: null};
    for (const a of agents) {
      const acts = activities.filter((x) => x.agent_id === a.agent_id);
      const s = {...settings(a, P), unitName: a.unit};
      const users = PERIODS.map((p, n) => usersIn(s.users, growth, n));
      const grow = users.map((u, n) => (s.users ? u / s.users : (1 + growth) ** n));
      const alt = Object.fromEntries(Object.keys(BUILDS).map((build) => [build, users.map((u, n) => month(acts, rate, {...s, build}, u, grow[n]).before * (1 + buffer))]));
      out.agents.push({agent_id: a.agent_id, agent: a.agent, kind: 'Modelled', build: BUILDS[s.build], s_build: s.build, starts: 0, users, credits: alt[s.build], alt});
      if (a !== chosen) continue;
      const m = month(acts, rate, s, s.users, 1), total = m.before * (1 + buffer), b = buy(total, rate, basis);
      const extraName = String(a.extra_label || 'Extra work').replace(/ per month$/i, ''), unitsName = a.unit[0].toUpperCase() + a.unit.slice(1) + 's';
      const steps = [[unitsName, m.groups.Quote], [extraName, m.groups.Advisor], ['Other scenarios', m.groups.Other], ['Safety buffer', m.before * buffer]];
      let at = 0;
      const sorted = Object.entries(m.meters).sort((x, y) => y[1] - x[1]);
      const shares = [...new Set([0, 20, 40, 60, 80, 100, Math.round(s.lic * 100)])].sort((x, y) => y - x);
      const counts = [...new Set([0.5, 0.75, 1, 1.5, 2, 3].map((k) => Math.round((s.users || num(a.users, 100)) * k)))];
      const built = ['standard', 'harness'].map((build) => month(acts, rate, {...s, build}, s.users, 1).before * (1 + buffer));
      out.detail = {
        now: {agent_id: a.agent_id, agent: a.agent, unit: a.unit, users_label: a.users_label, units_label: a.units_label, extra_label: a.extra_label,
          build: BUILDS[s.build], s_build: s.build, s_model: s.model, s_rule: s.rule, s_other: s.other,
          users: s.users, units_per_user: s.units, extra_per_month: s.extra, licence_pct: Math.round(s.lic * 100),
          units_month: r2(s.users * s.units), credits_per_unit: r2(m.unit), credits_per_unit_licensed: r2(m.unitLicensed),
          cost_per_unit: s.users * s.units ? r2(m.groups.Quote * (1 + buffer) * rate.price_per_credit / (s.users * s.units)) : 0,
          credits_month: r2(total), without_other: r2((m.groups.Quote + m.groups.Advisor) * (1 + buffer)),
          payg: r2(b.payg), packs: r2(b.packs), hybrid: r2(b.hybrid), packs_needed: b.needed, cheapest: b.cheapest, lowest: r2(b.lowest),
          credits_per_user: s.users ? r2(m.before / s.users) : 0, harness_ratio: built[0] ? r2(built[1] / built[0]) : null, workbook: a.workbook},
        rows: m.rows.map((r) => ({...r, share_pct: m.before ? r2(100 * r.credits_month / m.before) : 0})),
        waterfall: steps.map(([step, v]) => ({step, credits: r2(v), from: r2(at), to: r2(at += v), total: false}))
          .concat({step: 'Total credits', credits: r2(total), from: 0, to: r2(total), total: true}),
        meters: sorted.map(([meter, v]) => ({meter, credits_month: r2(v), share_pct: m.before ? r2(100 * v / m.before) : 0})),
        heat: shares.flatMap((pct) => counts.map((u) => ({licence_pct: pct, users: u, current: u === s.users && pct === Math.round(s.lic * 100),
          revenue_month: r2(buy(month(acts, rate, {...s, lic: pct / 100}, u, 1).before * (1 + buffer), rate, basis).revenue)}))),
      };
    }
    return out;
  },
});

dash.calc('book', {
  title: 'Portfolio and forecast',
  description: 'Adds every agent together, planned ones from the year they go live, prices the credits on the purchase option chosen, and repeats that with users growing by the chosen rate each year. Packs are bought for the whole portfolio, so each agent takes its share of the bill by credits.',
  inputs: ['engine', 'planned'],
  fn: (engine, planned) => {
    const {rate, buffer, growth, basis} = engine;
    const agents = engine.agents.concat((Array.isArray(planned) ? planned : []).map((p) => {
      const starts = Math.min(3, Math.max(0, Math.round(num(p.starts)))), base = Math.max(0, Math.round(num(p.users)));
      const users = PERIODS.map((x, n) => usersIn(base, growth, n));
      return {agent_id: 'planned-' + p.id, row: p.id, agent: String(p.name || 'Planned agent').slice(0, 60), kind: 'Planned', build: 'Your estimate', starts, users,
        credits: users.map((u, n) => (n >= starts ? u * Math.max(0, num(p.credits_per_user)) * (1 + buffer) : 0))};
    }));
    const periods = PERIODS.map((period, n) => {
      const live = agents.filter((a) => n >= a.starts), credits = live.reduce((x, a) => x + a.credits[n], 0), b = buy(credits, rate, basis);
      return {period, n, agents: live.length, users: live.reduce((x, a) => x + a.users[n], 0), credits, b, revenue_month: b.revenue, revenue_year: b.revenue * 12};
    });
    const share = (a, n) => (periods[n].credits ? periods[n].revenue_month * a.credits[n] / periods[n].credits : 0);
    const today = periods[0];
    let sum = 0;
    const forecast = periods.map((p) => ({period: p.period, n: p.n, agents: p.agents, users: p.users, credits_month: r2(p.credits), packs_needed: p.b.needed,
      revenue_month: r2(p.revenue_month), revenue_year: r2(p.revenue_year),
      change_pct: p.n && today.revenue_year ? r2(100 * (p.revenue_year / today.revenue_year - 1)) : null,
      cumulative: p.n ? r2(sum += p.revenue_year) : null}));
    let run = 0;
    // The whole portfolio built one way or the other: every modelled agent switched, planned agents as entered.
    const modelled = engine.agents.length;
    const builds = Object.keys(BUILDS).map((build) => {
      const bought = PERIODS.map((x, n) => buy(agents.filter((a) => n >= a.starts).reduce((t, a) => t + (a.alt ? a.alt[build][n] : a.credits[n]), 0), rate, basis));
      const credits = agents.reduce((t, a) => t + (a.starts ? 0 : a.alt ? a.alt[build][0] : a.credits[0]), 0);
      const on = engine.agents.filter((a) => a.s_build === build).length;
      return {build_id: build, build: BUILDS[build], credits_month: r2(credits), revenue_month: r2(bought[0].revenue), revenue_year: r2(bought[0].revenue * 12),
        three_year: r2(bought.slice(1).reduce((t, b) => t + b.revenue * 12, 0)), agents_on: on, agents_modelled: modelled,
        in_use: on === 0 ? 'No' : on === modelled ? 'All' : 'Some'};
    });
    const top = Math.max(...builds.map((b) => b.revenue_month)), low = Math.min(...builds.map((b) => b.revenue_month));
    builds.forEach((b) => Object.assign(b, {higher: modelled > 0 && top > low && b.revenue_month === top, scale_pct: top ? r2(100 * b.revenue_month / top) : 0,
      times_other: b.revenue_month === top && low > 0 ? r2(top / low) : null,
      credit_ratio: builds[0].credits_month ? r2(builds[1].credits_month / builds[0].credits_month) : null}));
    return {
      builds,
      forecast,
      split: periods.flatMap((p) => agents.map((a) => ({period: p.period, n: p.n, agent_id: a.agent_id, agent: a.agent, kind: a.kind,
        users: p.n >= a.starts ? a.users[p.n] : 0, revenue_year: r2(share(a, p.n) * 12)}))),
      runway: Array.from({length: 37}, (x, m) => ({month: m, period: m ? PERIODS[Math.ceil(m / 12)] : 'Start',
        revenue_month: m ? r2(periods[Math.ceil(m / 12)].revenue_month) : 0, cumulative: r2(run += m ? periods[Math.ceil(m / 12)].revenue_month : 0)})),
      agents: agents.map((a) => ({agent_id: a.agent_id, row: a.row || '', agent: a.agent, kind: a.kind, build: a.build, live: a.starts ? 'From Year ' + a.starts : 'Live today',
        users: a.users[0], credits_month: r2(a.credits[0]), revenue_month: r2(share(a, 0)), revenue_year: r2(share(a, 0) * 12),
        revenue_per_user: a.starts === 0 && a.users[0] ? r2(share(a, 0) / a.users[0]) : 0,
        share_pct: today.credits ? r2(100 * a.credits[0] / today.credits) : 0, year3: r2(share(a, 3) * 12)})),
      purchase: [['Pay-as-you-go', today.b.payg, 'payg'], ['Packs only', today.b.packs, 'packs'], ['Packs plus pay-as-you-go', today.b.hybrid, 'hybrid']]
        .map(([option, cost, key]) => ({option, cost_month: r2(cost), cheapest: option === today.b.cheapest, chosen: key === basis || (basis === 'lowest' && option === today.b.cheapest)})),
      portfolio: {agents: today.agents, agents_all: agents.length, users: today.users, credits_month: r2(today.credits), revenue_month: r2(today.revenue_month),
        revenue_year: r2(today.revenue_year), revenue_per_user: today.users ? r2(today.revenue_month / today.users) : 0, packs_needed: today.b.needed,
        basis: BASES[basis], s_basis: basis, cheapest: today.b.cheapest, growth_pct: r2(growth * 100), buffer_pct: r2(buffer * 100),
        year1: forecast[1].revenue_year, year2: forecast[2].revenue_year, year3: forecast[3].revenue_year, three_year: forecast[3].cumulative,
        users_year3: periods[3].users, uplift_pct: forecast[3].change_pct},
    };
  },
});

// Each table and chart reads one of these.
const view = (id, from, title, description, pick) => dash.calc(id, {title, description, inputs: [from], fn: pick});
view('portfolio', 'book', 'Portfolio today', 'All agents live today: users, credits a month and revenue on the chosen purchase option.', (book) => [book.portfolio]);
view('forecast', 'book', 'Three-year forecast', `Today, then each year with users grown by the chosen rate. Annual revenue is twelve months at that year's volume.`, (book) => book.forecast);
view('forecast_agents', 'book', 'Forecast by agent', `Each agent's share of every year's revenue.`, (book) => book.split);
view('runway', 'book', 'Cumulative revenue by month', 'Revenue added month by month over the three forecast years.', (book) => book.runway);
view('agent_totals', 'book', 'Agents in the portfolio', 'One line per agent: users, credits, revenue today and in Year 3.', (book) => book.agents);
view('build_compare', 'book', 'Standard agent against Copilot harness, whole portfolio', 'Revenue if every modelled agent were built as a standard agent, and if every one ran on the Copilot harness, everything else as set. Planned agents count the same either way.', (book) => book.builds);
view('purchase', 'book', 'Ways to buy the credits', `This month's portfolio credits priced three ways.`, (book) => book.purchase);
view('agent_now', 'engine', 'Selected agent today', `The selected agent at the settings on the page, line for line with the workbook's Monthly Estimate.`, (engine) => (engine.detail ? [engine.detail.now] : []));
view('activity_credits', 'engine', 'Credits by activity', 'Monthly volume and credits of every prompt and scenario of the selected agent, before the buffer.', (engine) => (engine.detail ? engine.detail.rows : []));
view('waterfall', 'engine', 'How the monthly credits build up', 'Quote, extra work, other scenarios and buffer credits of the selected agent.', (engine) => (engine.detail ? engine.detail.waterfall : []));
view('meters', 'engine', 'Credits by billing meter', `The selected agent's monthly credits by what is billed, before the buffer.`, (engine) => (engine.detail ? engine.detail.meters : []));
view('heat', 'engine', 'Revenue by users and licence share', 'Monthly revenue of the selected agent at other user counts and licence shares, everything else as set.', (engine) => (engine.detail ? engine.detail.heat : []));
