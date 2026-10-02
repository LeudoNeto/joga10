def _setup(api, n_teams=3, per_team=2, wins_to_leave=0):
    admin = api.user()
    g, players, ev = api.group_with_players(admin, [5] * (n_teams * per_team))
    ids = [p["id"] for p in players]
    teams = [ids[i * per_team:(i + 1) * per_team] for i in range(n_teams)]
    out = api.req(
        "PUT", f"/events/{ev['id']}/teams", admin, 200,
        json={"mode": "optimal", "proven": True, "use_substitutes": True, "teams": teams},
    ).json()
    if wins_to_leave:
        api.req("PATCH", f"/events/{ev['id']}", admin, 200, json={"wins_to_leave": wins_to_leave})
    return admin, g, ev, out


def _goal(api, auth, ev, match, side, n=1):
    team = match[f"team_{side}"]["id"]
    scorer = next(t for t in api.teams if t["id"] == team)["players"][0]["id"]
    for _ in range(n):
        match = api.req(
            "POST", f"/events/{ev['id']}/matches/{match['id']}/goals", auth, 200,
            json={"team_id": team, "scorer_id": scorer},
        ).json()
    return match


def _play(api, auth, ev, goals_a, goals_b, staying=None):
    m = api.req("POST", f"/events/{ev['id']}/matches", auth, 201, json={}).json()
    if goals_a:
        m = _goal(api, auth, ev, m, "a", goals_a)
    if goals_b:
        m = _goal(api, auth, ev, m, "b", goals_b)
    opts = api.req("GET", f"/events/{ev['id']}/matches/{m['id']}/finish-options", auth, 200).json()
    res = api.req(
        "POST", f"/events/{ev['id']}/matches/{m['id']}/finish", auth, 200,
        json={"staying": staying or opts["default"]},
    ).json()
    return m, opts, res


def test_save_teams_validation(api):
    admin, g, ev, teams = _setup(api)
    assert [t["name"] for t in teams] == ["Time Vermelho", "Time Azul", "Time Verde"]
    ids = [p["id"] for t in teams for p in t["players"]]
    base = {"mode": "heuristic", "proven": True}
    api.req("PUT", f"/events/{ev['id']}/teams", admin, 400, json={**base, "teams": [[ids[0]], [ids[0]]]})
    api.req("PUT", f"/events/{ev['id']}/teams", admin, 400, json={**base, "teams": [[ids[0]], []]})
    api.req("PUT", f"/events/{ev['id']}/teams", admin, 400, json={**base, "teams": [[ids[0]], [99999]]})
    event = api.req("GET", f"/events/{ev['id']}", admin, 200).json()
    assert event["draw_mode"] == "optimal" and event["use_substitutes"] is True


def test_rotation_winner_stays_and_longest_waiting_enters(api):
    admin, g, ev, teams = _setup(api, n_teams=3)
    api.teams = teams
    red, blue, green = (t["id"] for t in teams)

    m1, opts, res = _play(api, admin, ev, 2, 1)
    assert (m1["team_a"]["id"], m1["team_b"]["id"]) == (red, blue)  # first match: team order
    assert opts["default"] == "a" and opts["options"] == ["a", "b"]  # 3 teams: no "none"
    assert (res["suggestion"]["team_a_id"], res["suggestion"]["team_b_id"]) == (red, green)

    teams_now = {t["id"]: t["stats"] for t in api.req("GET", f"/events/{ev['id']}/teams", admin, 200).json()}
    assert teams_now[red]["wins"] == 1 and teams_now[red]["goals_for"] == 2 and teams_now[red]["streak"] == 1
    assert teams_now[blue]["losses"] == 1 and teams_now[blue]["goals_against"] == 2


def test_wins_to_leave_with_three_and_four_teams(api):
    admin, g, ev, teams = _setup(api, n_teams=3, wins_to_leave=2)
    api.teams = teams
    red, blue, green = (t["id"] for t in teams)
    _play(api, admin, ev, 1, 0)  # red beats blue (streak 1)
    m2, opts, res = _play(api, admin, ev, 1, 0)  # red beats green: 2nd in a row
    assert opts["streak_after"] == 2
    assert opts["default"] == "b"  # only 3 teams: the loser (green) stays
    assert {res["suggestion"]["team_a_id"], res["suggestion"]["team_b_id"]} == {green, blue}

    admin, g, ev, teams = _setup(api, n_teams=4, wins_to_leave=2)
    api.teams = teams
    red, blue, green, yellow = (t["id"] for t in teams)
    _play(api, admin, ev, 1, 0)  # red x blue
    _, opts, res = _play(api, admin, ev, 1, 0)  # red x green
    assert opts["default"] == "none"  # both leave
    assert {res["suggestion"]["team_a_id"], res["suggestion"]["team_b_id"]} == {yellow, blue}


def test_draw_needs_a_decision_and_two_teams_always_stay(api):
    admin, g, ev, teams = _setup(api, n_teams=4)
    api.teams = teams
    m = api.req("POST", f"/events/{ev['id']}/matches", admin, 201, json={}).json()
    opts = api.req("GET", f"/events/{ev['id']}/matches/{m['id']}/finish-options", admin, 200).json()
    assert opts["winner"] is None and opts["default"] is None and opts["options"] == ["a", "b", "none"]
    api.req("POST", f"/events/{ev['id']}/matches/{m['id']}/finish", admin, 400, json={"staying": "both"})

    admin, g, ev, teams = _setup(api, n_teams=2)
    m = api.req("POST", f"/events/{ev['id']}/matches", admin, 201, json={}).json()
    opts = api.req("GET", f"/events/{ev['id']}/matches/{m['id']}/finish-options", admin, 200).json()
    assert opts["options"] == ["both"]


def test_stats_permissions_assists_and_manual_adjust(api):
    admin, g, ev, teams = _setup(api, n_teams=2)
    mod = api.join(g["id"], admin, "moderator")
    member = api.join(g["id"], admin, "member")
    red = teams[0]
    scorer, assist = (p["id"] for p in red["players"])

    m = api.req("POST", f"/events/{ev['id']}/matches", mod, 201, json={}).json()
    api.req("POST", f"/events/{ev['id']}/matches", mod, 409, json={})  # one at a time
    goal = {"team_id": red["id"], "scorer_id": scorer, "assist_id": assist}
    api.req("POST", f"/events/{ev['id']}/matches/{m['id']}/goals", member, 403, json=goal)
    m = api.req("POST", f"/events/{ev['id']}/matches/{m['id']}/goals", mod, 200, json=goal).json()
    assert m["score_a"] == 1
    m = api.req(
        "POST", f"/events/{ev['id']}/matches/{m['id']}/stats", mod, 200,
        json={"team_id": red["id"], "player_id": scorer, "goals": -5},
    ).json()
    assert m["score_a"] == 0  # never below zero
    m = api.req(
        "POST", f"/events/{ev['id']}/matches/{m['id']}/stats", mod, 200,
        json={"team_id": red["id"], "player_id": scorer, "goals": 2},
    ).json()

    ranking = api.req("GET", f"/events/{ev['id']}/stats", member, 200).json()
    top = ranking[0]
    assert (top["player_id"], top["goals"], top["score"]) == (scorer, 2, 100)
    second = next(r for r in ranking if r["player_id"] == assist)
    assert second["assists"] == 1 and second["score"] == round(100 * 3 / 8)

    # teams can't be redrawn while a match is running
    api.req("PUT", f"/events/{ev['id']}/teams", admin, 409, json={"mode": "random", "teams": [[scorer], [assist]]})


def test_redraw_keeps_history_and_stats(api):
    admin, g, ev, teams = _setup(api, n_teams=2)
    api.teams = teams
    _play(api, admin, ev, 3, 1)
    ids = [p["id"] for t in teams for p in t["players"]]
    new = api.req(
        "PUT", f"/events/{ev['id']}/teams", admin, 200,
        json={"mode": "random", "teams": [ids[:2], ids[2:]]},
    ).json()
    assert all(t["stats"]["played"] == 0 for t in new)  # brand new teams
    history = api.req("GET", f"/events/{ev['id']}/matches", admin, 200).json()
    assert len(history) == 1 and history[0]["score_a"] == 3
    assert history[0]["team_a"]["active"] is False  # archived, not deleted
    ranking = api.req("GET", f"/events/{ev['id']}/stats", admin, 200).json()
    assert sum(r["goals"] for r in ranking) == 4


def test_move_player_between_teams_and_reopen(api):
    admin, g, ev, teams = _setup(api, n_teams=3)
    api.teams = teams
    red, blue = teams[0], teams[1]
    moved = red["players"][0]["id"]
    out = api.req("PUT", f"/events/{ev['id']}/teams/{blue['id']}/players/{moved}", admin, 200).json()
    sizes = {t["id"]: len(t["players"]) for t in out}
    assert sizes[red["id"]] == 1 and sizes[blue["id"]] == 3

    m, _, _ = _play(api, admin, ev, 1, 0)
    reopened = api.req("POST", f"/events/{ev['id']}/matches/{m['id']}/reopen", admin, 200).json()
    assert reopened["status"] == "in_progress" and reopened["score_a"] == 1
    api.req("DELETE", f"/events/{ev['id']}/matches/{m['id']}", admin, 204)
    assert api.req("GET", f"/events/{ev['id']}/matches/current", admin, 200).json() is None


def test_deleting_event_and_group_with_history(api):
    admin, g, ev, teams = _setup(api, n_teams=3)
    api.teams = teams
    _play(api, admin, ev, 2, 1)
    m = api.req("POST", f"/events/{ev['id']}/matches", admin, 201, json={}).json()
    _goal(api, admin, ev, m, "a")
    api.req("DELETE", f"/events/{ev['id']}", admin, 204)
    api.req("GET", f"/events/{ev['id']}", admin, 404)

    admin, g, ev, teams = _setup(api, n_teams=2)
    api.teams = teams
    _play(api, admin, ev, 1, 0)
    api.req("DELETE", f"/groups/{g['id']}", admin, 204)
    api.req("GET", f"/groups/{g['id']}", admin, 404)
