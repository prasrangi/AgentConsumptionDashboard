"""Read Copilot Credit Calculator workbooks and write the dashboard's three data files.

Usage: python3 tools/extract_calculator.py data agent_id=WORKBOOK.xlsx [agent_id=WORKBOOK.xlsx ...] [--with-notes]

Every number is copied from a workbook cell; nothing is typed here. Each workbook follows the
"Copilot Credit Calculator - <Agent>" layout: Inputs, Standard Agent, Copilot Harness Agent,
Other Scenarios. Rates come from the first workbook's Inputs sheet. List every agent each time:
the three files are written afresh.

The workbooks' "What it means" notes can name a customer's systems, so they are left out unless
--with-notes is given. Needs openpyxl (pip install openpyxl). Then run tools/build.py.
"""
import json, os, sys
import openpyxl

# How each monthly volume behaves when the number of users changes. This is the only judgement
# in this file, taken from the "What it means" notes on the Other Scenarios sheet.
#   users: the volume is tied to users (per user, or per unit of work) and follows the user count
#   usage: a monthly business volume set on its own; grows with users in the forecast only
#   fixed: platform overhead that does not move with users
SCALING = {
    "Advisor or knowledge question": "users",          # note: 20 questions per user per month
    "Extra turn: clarify, rephrase or retry": "unit",  # note: one per quote
    "Tender page read": "usage",
    "Tender response draft": "usage",
    "Autonomous run (event or schedule)": "usage",
    "Polling check by a flow trigger": "fixed",
    "Harness build session": "fixed",
    "Harness test, preview or evaluation run": "fixed",
}
# A harness task that covers more than one standard prompt: the first prompt carries the task.
HARNESS_ALIAS = {"Start and confirm the quote": ["Start the quote", "Confirm the context card"]}
AGENT_NAMES = {"proposal": ("Proposal Agent", "quote")}


def num(v):
    return 0 if v is None else v


def read_agent(agent_id, path):
    wb = openpyxl.load_workbook(path, data_only=True)
    inp, std, har, oth = (wb[s] for s in ("Inputs", "Standard Agent", "Copilot Harness Agent", "Other Scenarios"))
    users, units = inp["B4"].value, inp["B5"].value
    name, unit = AGENT_NAMES.get(agent_id, (agent_id.replace("-", " ").title() + " Agent", "unit"))
    agent = {
        "agent_id": agent_id, "agent": name, "unit": unit,
        "users_label": inp["A4"].value, "units_label": inp["A5"].value, "extra_label": inp["A6"].value,
        "users": users, "units_per_user": units, "extra_per_month": inp["B6"].value,
        "licence_pct": round(inp["B7"].value * 100, 4), "model": inp["B8"].value,
        "licence_rule": "Conservative" if inp["B9"].value == "Yes" else "Guide",
        "build": "Standard", "workbook": os.path.basename(path),
    }
    harness = {}
    for r in range(3, har.max_row + 1):
        prompt, task = har.cell(r, 1).value, har.cell(r, 2).value
        if not prompt or prompt.startswith("Total"):
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

    for r in range(3, std.max_row + 1):
        prompt = std.cell(r, 1).value
        if not prompt or prompt.startswith("Total"):
            continue
        counts = {k: num(std.cell(r, c).value) for k, c in
                  (("replies", 2), ("tool_calls", 3), ("graph_searches", 4), ("ai_tokens_k", 5), ("flow_steps", 6))}
        counts["pages"] = 0
        times = num(std.cell(r, 10).value)
        if times == 0:  # not part of a unit of work: counted once per extra deliverable (Advisor draft)
            add("Advisor", prompt, "extra", 1, "usage", counts, std.cell(r, 8).value, harness[prompt], std.cell(r, 11).value)
        else:
            add("Quote", prompt, "unit", times, "users", counts, std.cell(r, 8).value, harness[prompt], std.cell(r, 11).value)

    for r in range(3, oth.max_row + 1):
        scen = oth.cell(r, 1).value
        if not scen or scen.startswith("Total"):
            continue
        counts = {k: num(oth.cell(r, c).value) for k, c in
                  (("replies", 3), ("tool_calls", 4), ("graph_searches", 5), ("ai_tokens_k", 6), ("flow_steps", 7), ("pages", 8))}
        volume, how = num(oth.cell(r, 2).value), SCALING.get(scen, "usage")
        if how == "users" and users:
            driver, volume, how = "user", volume / users, "users"
        elif how == "unit" and users and units:
            driver, volume, how = "unit", volume / (users * units), "users"
        else:
            driver = "month"
        add("Other", scen, driver, volume, how, counts, oth.cell(r, 10).value, oth.cell(r, 12).value, oth.cell(r, 14).value)
    return agent, acts, inp


def read_rates(inp):
    cells = (("price_per_credit", 10, "Buying"), ("pack_price", 11, "Buying"), ("pack_credits", 12, "Buying"),
             ("buffer", 13, "Buying"), ("reply", 15, "Standard agent"), ("tool_call", 16, "Standard agent"),
             ("graph_search", 17, "Standard agent"), ("ai_standard", 18, "Standard agent"),
             ("ai_premium", 19, "Standard agent"), ("flow_step", 21, "Standard agent"),
             ("light", 23, "Copilot harness"), ("medium", 24, "Copilot harness"), ("heavy", 25, "Copilot harness"),
             ("harness_flow_step", 26, "Copilot harness"), ("page_read", 28, "More rates"),
             ("build_session", 29, "More rates"))
    return [{"key": k, "rate": inp.cell(r, 1).value, "value": inp.cell(r, 2).value, "section": s,
             "meaning": inp.cell(r, 3).value} for k, r, s in cells]


def main(out_dir, pairs, notes=False):
    agents, activities, rates, books = [], [], None, []
    for pair in pairs:
        agent_id, path = pair.split("=", 1)
        agent, acts, inp = read_agent(agent_id, path)
        agents.append(agent)
        activities += acts
        books.append(os.path.basename(path))
        rates = rates or read_rates(inp)
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
