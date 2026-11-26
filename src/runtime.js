// Stand-in for the dashboard host. It gives model.js and app.js the same `dash` and `claude`
// objects they use on claude.ai, backed by the data built into this page.
// Settings live in the link's hash; planned agents live in this browser's storage.
(function () {
  const sources = window.CC_DATA, defaults = window.CC_PARAMS, KEY = 'copilot-credit-planned-agents';
  const calcs = {}, draws = [], listeners = [], made = new Map();
  let cache = new Map(), queued = false;

  const fromHash = () => {
    const p = {...defaults};
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => {
      if (k in defaults) p[k] = typeof defaults[k] === 'number' ? (Number.isFinite(+v) ? +v : defaults[k]) : v;
    });
    return p;
  };
  let params = fromHash();
  const toHash = () => {
    const q = new URLSearchParams();
    Object.keys(params).forEach((k) => { if (params[k] !== defaults[k]) q.set(k, params[k]); });
    try { history.replaceState(null, '', q.toString() ? '#' + q : location.pathname + location.search); } catch (e) { /* the link just stays as it was */ }
  };

  let planned = [];
  try { const kept = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(kept)) planned = kept; } catch (e) { /* storage blocked: start empty */ }
  const keep = () => localStorage.setItem(KEY, JSON.stringify(planned));

  const data = (id) => {
    if (cache.has(id)) return cache.get(id);
    let out;
    if (calcs[id]) {
      const ins = calcs[id].inputs.map(data), bad = ins.find((d) => d.status !== 'ok');
      if (bad) out = {status: bad.status, data: null};
      else {
        try { out = {status: 'ok', data: calcs[id].fn(...ins.map((d) => d.data))}; }
        catch (e) { console.error(e); out = {status: 'error', data: null, message: String(e)}; }
      }
    } else if (id === 'planned') out = {status: 'ok', data: planned};
    else if (sources[id]) out = {status: 'ok', data: sources[id]};
    else out = {status: 'missing', data: []};
    cache.set(id, out);
    return out;
  };

  const run = () => {
    queued = false;
    cache = new Map();
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    draws.forEach(({name, spec}) => document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      try {
        if (typeof spec === 'function') return spec(el);
        if (!made.has(el)) made.set(el, spec.mount ? spec.mount(el) : undefined);
        if (spec.update) spec.update(el, made.get(el));
      } catch (e) { console.error(e); }
    }));
  };
  const queue = () => { if (!queued) { queued = true; Promise.resolve().then(run); } };

  window.dash = {
    colors: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'var(--series-' + n + ')'),
    data,
    calc: (id, spec) => { calcs[id] = spec; },
    loader: () => {},
    onData: (fn) => { listeners.push(fn); queue(); },
    draw: (name, spec) => { if (spec) draws.push({name, spec}); queue(); },
    params: () => ({...params}),
    setParams: (next) => {
      Object.entries(next).forEach(([k, v]) => { if (v === null || v === undefined) params[k] = defaults[k]; else params[k] = v; });
      toHash(); queue();
    },
    resetParams: () => { params = {...defaults}; toHash(); queue(); },
    refresh: queue,
    setLink: () => {},
  };

  const store = {
    collection: () => ({add: async (row) => {
      planned = planned.concat({id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...row});
      queue(); keep();
    }}),
    doc: (path) => ({delete: async () => {
      planned = planned.filter((r) => r.id !== path.split('/').pop());
      queue(); keep();
    }}),
  };
  window.claude = {use: async (name) => (name === 'db' ? store : null)};

  let width = 0;
  const root = document.getElementById('dash-root');
  if (window.ResizeObserver) new ResizeObserver(() => { if (root.clientWidth !== width) { width = root.clientWidth; queue(); } }).observe(root);
  window.addEventListener('hashchange', () => { params = fromHash(); queue(); });
})();
