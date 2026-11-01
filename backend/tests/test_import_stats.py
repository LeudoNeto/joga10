from app.services.import_stats import parse_stats


def test_parse_stats_text_formats():
    rows = parse_stats(None, None, """Estatísticas da pelada
1. Neto ✅ - 3 - 1
Zico 2 1
Cafu: 0/2
- Dida - 2
Ronaldo - 31
Lucas - 200 - 1
""")
    got = [(r.name, r.goals, r.assists, r.error) for r in rows]
    assert got == [
        ("Estatísticas da pelada", 0, 0, "sem gols/assistências"),
        ("Neto", 3, 1, None),
        ("Zico", 2, 1, None),
        ("Cafu", 0, 2, None),
        ("Dida", 2, 0, None),  # assists optional
        ("Ronaldo", 31, 0, None),  # one number, not 3 and 1
        ("Lucas", 0, 1, "gols acima de 100"),  # line ignored because of the error
    ]


def test_parse_stats_table_with_or_without_header():
    csv = "Jogador;Assistências;Gols\nNeto;1;3\nZico;;2\n".encode()
    assert [(r.name, r.goals, r.assists) for r in parse_stats("s.csv", csv, None)] == [
        ("Neto", 3, 1),
        ("Zico", 2, 0),
    ]
    plain = b"Neto,3,1\nCafu,x,1\n"  # no header: name, goals, assists
    rows = parse_stats("s.csv", plain, None)
    assert (rows[0].name, rows[0].goals, rows[0].assists) == ("Neto", 3, 1)
    assert rows[1].error == "gols inválido (x)"


def _event_with(api):
    admin = api.user()
    g = api.req("POST", "/groups", admin, 201, json={"name": "Pelada"}).json()
    names = ["Neto", "Zico", "Lucas H.", "Lucas M.", "Cafu"]
    ids = {
        n: api.req("POST", f"/groups/{g['id']}/players", admin, 201, json={"name": n, "skill": 5}).json()["id"]
        for n in names
    }
    ev = api.req("POST", f"/groups/{g['id']}/events", admin, 201, json={"title": "E", "date": "2026-10-31"}).json()
    return admin, g, ev, ids


def _preview(api, auth, ev, text, expect=200):
    return api.req("POST", f"/events/{ev['id']}/stats/import", auth, expect, data={"text": text})


def test_stats_import_preview_matches_names(api):
    admin, g, ev, ids = _event_with(api)
    rows = _preview(api, admin, ev, "Pelada de quinta\n1. Neto - 3 - 1\nLucas 1\nFulano 2\nneto 1 1").json()["rows"]
    assert [(r["input"], r["status"], r["player_id"], r["error"]) for r in rows] == [
        ("Pelada de quinta", None, None, "sem gols/assistências"),
        ("Neto", "matched", ids["Neto"], None),
        ("Lucas", "ambiguous", None, None),
        ("Fulano", "not_found", None, None),
        ("neto", "duplicate", ids["Neto"], None),
    ]
    assert {c["id"] for c in rows[2]["candidates"]} == {ids["Lucas H."], ids["Lucas M."]}
    assert (rows[1]["goals"], rows[1]["assists"]) == (3, 1)


def test_stats_import_roles_and_matches(api):
    admin, g, ev, ids = _event_with(api)
    mod = api.join(g["id"], admin, "moderator")
    member = api.join(g["id"], admin, "member")
    body = {"stats": [{"player_id": ids["Neto"], "goals": 1, "assists": 0}]}

    # Same roles that edit other players' stats: admins and moderators.
    _preview(api, member, ev, "Neto 1", 403)
    api.req("POST", f"/events/{ev['id']}/stats/bulk", member, 403, json=body)
    _preview(api, mod, ev, "Neto 1")
    api.req("POST", f"/events/{ev['id']}/stats/bulk", mod, 200, json=body)

    # Only while the event has no matches.
    api.req(
        "PUT", f"/events/{ev['id']}/teams", admin, 200,
        json={"mode": "random", "teams": [[ids["Neto"]], [ids["Zico"]]]},
    )
    api.req("POST", f"/events/{ev['id']}/matches", admin, 201, json={})
    _preview(api, admin, ev, "Neto 1", 400)
    api.req("POST", f"/events/{ev['id']}/stats/bulk", admin, 400, json=body)


def test_stats_import_modes(api):
    admin, g, ev, ids = _event_with(api)
    url = f"/events/{ev['id']}/stats/bulk"

    def apply(mode, stats):
        rows = api.req("POST", url, admin, 200, json={"mode": mode, "stats": [
            {"player_id": ids[n], "goals": gl, "assists": a} for n, gl, a in stats
        ]}).json()
        return {r["name"]: (r["goals"], r["assists"]) for r in rows}

    assert apply("update", [("Neto", 3, 1), ("Zico", 1, 0)]) == {"Neto": (3, 1), "Zico": (1, 0)}
    # update: the players out of the list keep their numbers
    assert apply("update", [("Neto", 2, 2)]) == {"Neto": (2, 2), "Zico": (1, 0)}
    # add: summed to the current numbers
    assert apply("add", [("Neto", 1, 0), ("Cafu", 0, 1)]) == {"Neto": (3, 2), "Zico": (1, 0), "Cafu": (0, 1)}
    # replace: the event's stats become exactly the list
    assert apply("replace", [("Zico", 4, 0)]) == {"Zico": (4, 0)}

    # Each player once, only players of the event's group.
    api.req("POST", url, admin, 400, json={"stats": [
        {"player_id": ids["Neto"], "goals": 1}, {"player_id": ids["Neto"], "goals": 2},
    ]})
    outsider = api.user()
    other = api.req("POST", "/groups", outsider, 201, json={"name": "Outro"}).json()
    stranger = api.req("POST", f"/groups/{other['id']}/players", outsider, 201, json={"name": "X"}).json()
    api.req("POST", url, admin, 404, json={"stats": [{"player_id": stranger["id"], "goals": 1}]})
