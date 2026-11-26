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

## Assumptions at a glance

These are the assumptions behind every figure on the page, in plain terms. They describe the
Proposal Agent at its starting settings. The use, licence, build, purchase and growth assumptions can
be changed with the sliders and dropdowns on the page. Prices and credit rates come from the
calculator workbook and change only when the data is refreshed from it.

### What we assumed about the agent's use

| # | Assumption | Starting value |
|---|---|---|
| 1 | Number of sellers using the agent | 100 |
| 2 | Quotes each seller prepares with the agent in a month | 10 (so 1,000 quotes a month) |
| 3 | Questions each seller asks the agent besides quotes | 20 a month, plus one follow-up turn per quote |
| 4 | Advisor drafts written in a month | 50, a set number that does not depend on sellers |
| 5 | Tender work in a month | 1,500 pages read and 100 response drafts, set numbers |
| 6 | Automatic runs started by an event or schedule | 50 a month, a set number |
| 7 | Sellers who already hold a Microsoft Copilot licence | Half (50%) |
| 8 | What a licence covers | Licensed sellers are not charged for the agent's conversations, but still pay for background automation (milestone notices, tender page reading, automatic runs). A cautious option charges them for tools and drafting too. |
| 9 | How the agent is built | As a standard agent. The Copilot harness is an alternative build and uses far more credits (about 24 times as many at these settings). |
| 10 | Drafting model | Standard. The Premium model costs more per draft. |

### What we assumed about price

| # | Assumption | Starting value |
|---|---|---|
| 11 | Revenue is the credit bill | What the credits used cost at list price. This is the "monthly cost" in the calculator workbook. |
| 12 | Price of a credit, pay-as-you-go | $0.01 |
| 13 | Capacity pack | 25,000 credits for $200 a month (equal to $0.008 a credit when fully used) |
| 14 | How credits are bought | Pay-as-you-go to begin with. Packs, or packs plus pay-as-you-go for the remainder, can be chosen. Packs are bought once for all agents together. |
| 15 | Safety buffer | 15% more credits than the activities add up to, as a safety margin |
| 16 | Credits used by each step of work | The rates in the calculator workbook (for example 2 per reply, 5 per tool call, 10 per search). They are read from the workbook and not changed here. |

### What we assumed about the forecast

| # | Assumption | Starting value |
|---|---|---|
| 17 | User growth | 10% more users each year, taking effect at the start of the year: 100, 110, 121, 133 |
| 18 | Usage grows with users | Everything grows with users, including drafts, tenders and automatic runs. Only background platform running costs stay flat. |
| 19 | Everything else holds still for three years | Same price per credit, same credit rates, same habits per user. No price changes, discounts, inflation or users leaving. |
| 20 | A year's revenue | Twelve months at that year's usage, with no gradual ramp inside the year |
| 21 | Agents not built yet | Counted from the year they go live, as users times an estimated number of credits per user, plus the buffer |
| 22 | Which agents count | Every agent ticked in the Agents section counts towards the totals, the forecast and the build comparison. New agents start ticked, and unticking one takes it out of every figure. |

### What is not counted

- Microsoft Copilot licences themselves
- Dataverse storage, Power Automate licences and Azure costs
- Taxes, enterprise discounts and currency effects (figures are in US dollars)

### What the starting settings produce

| | Users | Revenue a month | Revenue for the year |
|---|---|---|---|
| Today | 100 | $935 | $11,225 |
| Year 1 | 110 | $1,028 | $12,332 |
| Year 2 | 121 | $1,129 | $13,550 |
| Year 3 | 133 | $1,240 | $14,878 |

That is about $40,800 over the three years, 32.5% above today by Year 3. These are planning
figures. The volumes above are illustrative until real usage replaces them, so treat the totals as a
way to compare scenarios, not as a commitment.

## Viewing it

The page is live at <https://prasrangi.github.io/AgentConsumptionDashboard/>. Anyone with that link
can open it, with no sign-in and no need to visit this repository.

GitHub serves it from the `gh-pages` branch, which holds only the built `index.html`. After
changing data or code on `main`, rebuild and refresh that branch:

```
python3 tools/build.py
git checkout gh-pages
git checkout main -- index.html
git commit -am "Update the published page" && git push origin gh-pages
git checkout main
```

The page updates about a minute after the push.

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

Each agent appears as a card in the Agents section, with a tick box to include it and the parts it covers.
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
