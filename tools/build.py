#!/usr/bin/env python3
"""Build index.html: one self-contained page from src/, data/ and vendor/.

Usage: python3 tools/build.py

The page's starting settings come from data/agents.json and data/rates.json, so an agent added by
tools/extract_calculator.py gets its sliders and defaults without any change to the page.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def rows(name):
    return json.loads(read(f"data/{name}.json"))["rows"]


def whole(x):
    return int(x) if float(x).is_integer() else x


def main():
    data = {name: rows(name) for name in ("agents", "activities", "rates")}
    rate = {r["key"]: r["value"] for r in data["rates"]}
    params = {"agent": data["agents"][0]["agent_id"], "basis": "payg", "buffer": whole(round(rate["buffer"] * 100, 4)), "growth": 10}
    for a in data["agents"]:
        key = a["agent_id"] + "_"
        params.update({
            key + "users": a["users"], key + "units": a["units_per_user"], key + "extra": a["extra_per_month"],
            key + "lic": whole(a["licence_pct"]), key + "build": "harness" if "harness" in str(a["build"]).lower() else "standard",
            key + "model": a["model"], key + "rule": "conservative" if a["licence_rule"] == "Conservative" else "guide", key + "other": "in",
        })
    embed = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    scoped = lambda path: "(function () {\n" + read(path) + "\n})();"
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copilot Credit revenue across agents</title>
<meta name="description" content="Interactive estimate of Copilot Credit consumption and revenue across agents, with a three-year forecast.">
<link rel="icon" href="data:,">
<style>
{read("src/style.css")}
{read("src/theme.css")}
</style>
</head>
<body>
<div id="dash-root">
{read("src/page.html")}
</div>
<script>
{read("vendor/d3.min.js")}
</script>
<script>
window.CC_DATA = {embed(data)};
window.CC_PARAMS = {embed(params)};
</script>
<script>
{read("src/runtime.js")}
</script>
<script>
{scoped("src/model.js")}
</script>
<script>
{scoped("src/app.js")}
</script>
</body>
</html>
"""
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"index.html written: {len(html):,} characters, {len(data['agents'])} agent(s), {len(data['activities'])} activities")


if __name__ == "__main__":
    main()
