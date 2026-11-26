"""Read Copilot Credit Calculator workbooks and write the dashboard's three data files.

Usage: python3 tools/extract_calculator.py data agent_id=WORKBOOK.xlsx [agent_id=WORKBOOK.xlsx ...] [--with-notes]

Every number is copied from a workbook cell; nothing is typed here. Two workbook layouts are read:
  - the first layout (Proposal Agent): Inputs has the volumes in fixed rows B4 to B9, and work is
    counted per user ("quotes per seller per month");
  - the newer layout (QEV Agent): Inputs has a Low / Average / High case switch and volume lines
    found by their labels, and work is a share of a business volume ("share of interactions
    evaluated"). The case in use (column B) is what is read.
Columns on the step sheets are found by their headers, so either layout works. Rates come from the
first workbook's Inputs; rates only the newer layout has (Basic AI model, quality agent run) are
added from the first workbook that has them, and shared rates are checked to agree. List every
agent each time: the three files are written afresh.

The workbooks' "What it means" notes and sources can name a customer and its systems, so they are
left out unless --with-notes is given. Needs openpyxl (pip install openpyxl). Then run tools/build.py.
"""
import json, os, sys
import openpyxl

# How each monthly volume on Other Scenarios behaves when the number of users changes. This is the
# only judgement in this file, taken from the "What it means" notes.
#   users: tied to users (per user) and follows the user count
#   unit:  tied to units of work (per quote) and follows them
#   usage: a monthly business volume set on its own; grows with users in the forecast only
#   fixed: platform overhead that does not move with users
SCALING = {
    "Advisor or knowledge question": "users",          # 20 questions per user per month
    "Extra turn: clarify, rephrase or retry": "unit",  # one per quote
    "QA evaluator asks the agent a question": "users", # users x questions per user
    "Polling check by a flow trigger": "fixed",
    "Harness build session": "fixed",
    "Harness test, preview or evaluation run": "fixed",
    "Test, preview or evaluation run": "fixed",
    "Quality agent simulation while tuning the COPC criteria": "fixed",  # same input as test runs
}
# A harness task that covers more than one standard prompt: the first prompt carries the task.
HARNESS_ALIAS = {"Start and confirm the quote": ["Start the quote", "Confirm the context card"]}
AGENT_NAMES = {"proposal": ("Proposal Agent", "quote"), "qev": ("QEV Agent", "evaluation")}
# Newer layout: which Inputs lines hold the agent's numbers (found by their label in column A).
NEWER = {
    "users": "Users who chat with the agent",
    "licence": "Share of those users with a Microsoft Copilot licence",
    "model": "AI model for prompts and drafting",
    "conservative": "Conservative case: licensed users still pay",
    "pool_year": "Customer interactions handled per year",
    "share": "Share of interactions evaluated (coverage)",
}
# Rates by key: (label in the first layout's rows, label in the newer layout).
RATES = [
    ("price_per_credit", "Buying", "Price per Copilot Credit", "Price per Copilot Credit, pay-as-you-go"),
    ("pack_price", "Buying", "Capacity pack price", "Capacity pack price"),
    ("pack_credits", "Buying", "Credits in one capacity pack", "Credits in one capacity pack"),
    ("buffer", "Buying", "Safety buffer", "Safety buffer"),
    ("reply", "Standard agent", "Reply", "Generative answer (reply)"),
    ("tool_call", "Standard agent", "Tool call", "Agent action (tool call, trigger or topic)"),
    ("graph_search", "Standard agent", "Graph search", "Tenant Graph grounding (Graph search)"),
    ("ai_basic", "Standard agent", None, "AI tool, Basic model"),
    ("ai_standard", "Standard agent", "AI drafting, Standard model", "AI tool, Standard model"),
    ("ai_premium", "Standard agent", "AI drafting, Premium model", "AI tool, Premium model"),
    ("flow_step", "Standard agent", "Flow step", "Agent flow action (flow step)"),
    ("quality_run", "Standard agent", None, "Quality evaluation of a closed conversation"),
    ("light", "Copilot harness", "Light task", "Light task"),
    ("medium", "Copilot harness", "Medium task", "Medium task"),
    ("heavy", "Copilot harness", "Heavy task", "Heavy task"),
    ("harness_flow_step", "Copilot harness", "Flow step on the harness", "Workflow step on the harness"),
    ("page_read", "More rates", "Content processing per page", "Content processing"),
    ("build_session", "More rates", "Harness build session (natural language)", "Build session"),
]
COUNTS = (("replies", ("Replies",)), ("tool_calls", ("Tool calls",)), ("graph_searches", ("Graph searches",)),
          ("ai_tokens_k", ("AI tokens (thousands)",)), ("flow_steps", ("Flow steps", "Flow actions")),
          ("pages", ("Pages read",)), ("quality_runs", ("Quality agent runs",)))


def num(v):
    return 0 if v is None or isinstance(v, str) else v


def newer(inp):
    return str(inp["A4"].value or "").startswith("Range case")


def by_label(ws):
    return {str(ws.cell(r, 1).value).strip(): ws.cell(r, 2).value for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value}


def columns(ws):
    head = {str(ws.cell(2, c).value).strip(): c for c in range(1, ws.max_column + 1) if ws.cell(2, c).value}
    def col(*names, prefix=False):
        for n in names:
            for h, c in head.items():
                if h == n or (prefix and h.startswith(n)):
                    return c
        return None
    return col


def read_agent(agent_id, path):
    wb = openpyxl.load_workbook(path, data_only=True)
    inp, std, har, oth = (wb[s] for s in ("Inputs", "Standard Agent", "Copilot Harness Agent", "Other Scenarios"))
    name, unit = AGENT_NAMES.get(agent_id, (agent_id.replace("-", " ").title() + " Agent", "unit"))
    common = {"agent_id": agent_id, "agent": name, "unit": unit, "build": "Standard", "workbook": os.path.basename(path)}
    if newer(inp):
        v = by_label(inp)
        users, pool, share = v[NEWER["users"]], v[NEWER["pool_year"]] / 12, v[NEWER["share"]]
        agent = {**common, "users_label": NEWER["users"], "units_label": "Share of interactions evaluated, %", "extra_label": None,
                 "users": users, "units_per_user": round(share * 100, 4), "extra_per_month": 0,
                 "unit_mode": "share", "unit_pool_month": pool, "units_max": 100, "units_step": 1,
                 "licence_pct": round(v[NEWER["licence"]] * 100, 4), "model": v[NEWER["model"]],
                 "licence_rule": "Conservative" if v[NEWER["conservative"]] == "Yes" else "Guide"}
        units = None
    else:
        users, units = inp["B4"].value, inp["B5"].value
        agent = {**common, "users_label": inp["A4"].value, "units_label": inp["A5"].value, "extra_label": inp["A6"].value,
                 "users": users, "units_per_user": units, "extra_per_month": inp["B6"].value,
                 "unit_mode": "per_user", "units_max": 60, "units_step": 1,
                 "licence_pct": round(inp["B7"].value * 100, 4), "model": inp["B8"].value,
                 "licence_rule": "Conservative" if inp["B9"].value == "Yes" else "Guide"}

    hc = columns(har)
    harness = {}
    for r in range(3, har.max_row + 1):
        prompt, task = har.cell(r, 1).value, har.cell(r, hc("Task type")).value
        if not prompt or not task or str(prompt).startswith("Total"):
            continue
        names = HARNESS_ALIAS.get(prompt, [prompt])
        harness[names[0]] = task
        for extra in names[1:]:
            harness[extra] = "Merged"
    acts = []

    def add(group, activity, driver, volume, scaling, counts, pay, task, note):
        acts.append({"agent_id": agent_id, "seq": len(acts) + 1, "activity": activity, "group": group,
                     "driver": driver, "volume": volume, "scaling": scaling, **counts,
                     "licensed_pay": pay, "harness_task": task, "note": note})

    sc = columns(std)
    times_c, pay_c, note_c = sc("Times per", prefix=True), sc("Licensed users pay", "Charged for licensed users"), sc("What it means")
    for r in range(3, std.max_row + 1):
        prompt, times = std.cell(r, 1).value, std.cell(r, times_c).value
        if not prompt or str(prompt).startswith("Total") or not isinstance(times, (int, float)):
            continue
        counts = {k: num(std.cell(r, sc(*h)).value) if sc(*h) else 0 for k, h in COUNTS}
        note = std.cell(r, note_c).value if note_c else None
        if times == 0:  # not part of a unit of work: counted once per extra deliverable (Advisor draft)
            add("Advisor", prompt, "extra", 1, "usage", counts, std.cell(r, pay_c).value, harness[prompt], note)
        else:
            add("Quote", prompt, "unit", times, "users", counts, std.cell(r, pay_c).value, harness[prompt], note)

    oc = columns(oth)
    vol_c, pay_c, task_c, note_c = oc("Volume per month"), oc("Licensed users pay", "Charged for licensed users"), oc("Harness task type"), oc("What it means")
    for r in range(3, oth.max_row + 1):
        scen, volume, task = oth.cell(r, 1).value, oth.cell(r, vol_c).value, oth.cell(r, task_c).value
        if not scen or str(scen).startswith("Total") or not task or not isinstance(volume, (int, float)):
            continue
        counts = {k: num(oth.cell(r, oc(*h)).value) if oc(*h) else 0 for k, h in COUNTS}
        how = SCALING.get(scen, "usage")
        if how == "users" and users:
            driver, volume, how = "user", volume / users, "users"
        elif how == "unit" and users and units:
            driver, volume, how = "unit", volume / (users * units), "users"
        else:
            driver = "month"
        add("Other", scen, driver, volume, how, counts, oth.cell(r, pay_c).value, task, oth.cell(r, note_c).value if note_c else None)
    return agent, acts, inp


def read_rates(inps):
    rows = []
    for key, section, old, new in RATES:
        found = []
        for inp in inps:
            label = new if newer(inp) else old
            if not label:
                continue
            for r in range(1, inp.max_row + 1):
                if str(inp.cell(r, 1).value or "").strip() == label:
                    found.append((label, inp.cell(r, 2).value, inp.cell(r, 3).value if newer(inp) else inp.cell(r, 3).value))
                    break
        if not found:
            raise SystemExit("rate not found in any workbook: " + key)
        if len({round(f[1], 6) for f in found}) > 1:
            print("WARNING: workbooks disagree on", key, [f[1] for f in found], "- using the first")
        label, value, meaning = found[0]
        rows.append({"key": key, "rate": label, "value": value, "section": section, "meaning": meaning})
    return rows


def main(out_dir, pairs, notes=False):
    agents, activities, inps, books = [], [], [], []
    for pair in pairs:
        agent_id, path = pair.split("=", 1)
        agent, acts, inp = read_agent(agent_id, path)
        agents.append(agent)
        activities += acts
        inps.append(inp)
        books.append(os.path.basename(path))
    rates = read_rates(inps)
    if not notes:
        for row in activities:
            row.pop("note", None)
        for row in rates:
            row.pop("meaning", None)
    os.makedirs(out_dir, exist_ok=True)
    for name, rows in (("agents", agents), ("activities", activities), ("rates", rates)):
        with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
            json.dump({"source": books, "rows": rows}, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(name, len(rows), "rows")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--with-notes"]
    main(args[0], args[1:], notes="--with-notes" in sys.argv)
