# Copilot Credit Revenue Dashboard

An interactive, multi-agent view of Copilot Credit consumption and the revenue it generates,
rebuilt from the "Copilot Credit Calculator" workbooks. One page, no server: open `index.html`.

- Revenue today and a forecast for Year 1, Year 2 and Year 3 as users grow (10% a year by default)
- Sliders for users, work per user, licence share, safety buffer and growth; dropdowns for the build
  (standard agent or Copilot harness), licence rule, drafting model and purchase option
- All agents added together, with each agent's share, plus a detail view per agent
- The link in the address bar keeps your settings, so a scenario can be shared as a link

The figures are a planning estimate. Volumes are illustrative until real ones replace them, and the
rates are those recorded in the calculator workbook.

## Viewing it

With GitHub Pages on for this repository (Settings > Pages > Deploy from a branch), the page is at
<https://prasrangi.github.io/AgentConsumptionDashboard/>.

## Adding an agent

Each agent comes from its own calculator workbook with the same sheets as the Proposal Agent one
(Inputs, Standard Agent, Copilot Harness Agent, Other Scenarios).

```
pip install openpyxl
python3 tools/extract_calculator.py data proposal="Copilot Credit Calculator - Proposal Agent.xlsx" tender="Copilot Credit Calculator - Tender Agent.xlsx"
python3 tools/build.py
```

List every agent each time: the data files are written afresh. The page picks up the new agent, its
sliders and its defaults from the data, and adds it to every total and to the forecast. Give the
agent a display name and unit of work in `AGENT_NAMES`, and say how its other-scenario volumes move
with users in `SCALING`, both at the top of `tools/extract_calculator.py`.

An agent with no workbook yet can be added on the page itself (name, users, credits per user, year
it goes live). Those are kept in the browser that added them, not in this repository.

## What is here

| Path | What it is |
|---|---|
| `index.html` | The built page, self-contained. This is what gets served. |
| `src/model.js` | The credit model: every figure on the page |
| `src/app.js`, `src/page.html`, `src/style.css` | Charts, controls and layout |
| `src/runtime.js`, `src/theme.css` | What lets the page run on its own, and its light and dark colours |
| `data/*.json` | Agents, their prompts and scenarios, and the rates, read from the workbooks |
| `tools/` | `extract_calculator.py` reads workbooks into `data/`; `build.py` writes `index.html` |
| `vendor/` | d3 v7 and its licence |

Workbooks are not kept here (`.gitignore`), and their free-text notes are left out of `data/` unless
`--with-notes` is passed, because they can name a customer's systems.

## How the numbers work

- Credits follow the workbook line for line: each activity's monthly volume times its credits,
  blended by the share of licensed users, plus the safety buffer. At the workbook's own inputs the
  page shows the workbook's Monthly Estimate, for both builds.
- Revenue is those credits priced on the purchase option chosen: pay-as-you-go, capacity packs, or
  packs plus pay-as-you-go. Packs are bought for the whole portfolio.
- When users change, the volumes the workbook ties to users move with them. Volumes set on their
  own stay put, except in the forecast, where all usage grows with users and only platform overhead
  stays flat. A year's revenue is twelve months at that year's volume.
