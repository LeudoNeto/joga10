import io

from PIL import Image


def _png(w=800, h=600, color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def test_skill_range_limits_and_clamps_players(api):
    admin = api.user("Admin")
    g, players, _ = api.group_with_players(admin, [2, 8, 9.5])
    assert (g["min_skill"], g["max_skill"]) == (0, 10)

    # out of the default 0-10 range
    api.req("POST", f"/groups/{g['id']}/players", admin, 400, json={"name": "X", "skill": 11})

    # narrowing the range clamps the players outside it
    detail = api.req("PATCH", f"/groups/{g['id']}", admin, 200, json={"min_skill": 3, "max_skill": 5}).json()
    assert (detail["min_skill"], detail["max_skill"]) == (3, 5)
    skills = sorted(p["skill"] for p in api.req("GET", f"/groups/{g['id']}/players", admin, 200).json())
    assert skills == [3, 5, 5]

    # new player without nota gets the middle of the range
    p = api.req("POST", f"/groups/{g['id']}/players", admin, 201, json={"name": "Novo"}).json()
    assert p["skill"] == 4

    api.req("PATCH", f"/groups/{g['id']}", admin, 400, json={"min_skill": 6})  # min >= max


def test_import_preview_uses_group_range(api):
    admin = api.user()
    g, _, _ = api.group_with_players(admin, [], min_skill=0, max_skill=5)
    res = api.req(
        "POST", f"/groups/{g['id']}/players/import", admin, 200,
        data={"text": "Neto - 4.80\nZico - 9\nSem nota"},
    ).json()
    assert [r["skill"] for r in res["rows"]] == [4.8, 5, 2.5]


def test_moderator_permissions(api):
    admin = api.user()
    g, players, _ = api.group_with_players(admin, [5])
    mod = api.join(g["id"], admin, "moderator")
    member = api.join(g["id"], admin, "member")
    pid = players[0]["id"]

    detail = api.req("GET", f"/groups/{g['id']}", mod, 200).json()
    assert detail["role"] == "moderator"

    # moderator: position yes, anything else no
    api.req("PUT", f"/groups/{g['id']}/players/{pid}", mod, 200, json={"position": "Goleiro"})
    api.req("PUT", f"/groups/{g['id']}/players/{pid}", mod, 403, json={"skill": 9})
    api.req("POST", f"/groups/{g['id']}/players", mod, 403, json={"name": "X"})
    # member: read only
    api.req("PUT", f"/groups/{g['id']}/players/{pid}", member, 403, json={"position": "Meia"})


def test_member_role_change(api):
    admin = api.user()
    g, _, _ = api.group_with_players(admin, [])
    member = api.join(g["id"], admin, "member")
    detail = api.req("GET", f"/groups/{g['id']}", admin, 200).json()
    target = next(m for m in detail["members"] if not m["is_creator"])
    creator = next(m for m in detail["members"] if m["is_creator"])

    detail = api.req(
        "PATCH", f"/groups/{g['id']}/members/{target['user_id']}", admin, 200,
        json={"role": "moderator"},
    ).json()
    assert next(m for m in detail["members"] if m["user_id"] == target["user_id"])["role"] == "moderator"
    api.req("PATCH", f"/groups/{g['id']}/members/{creator['user_id']}", admin, 400, json={"role": "member"})
    api.req("PATCH", f"/groups/{g['id']}/members/{creator['user_id']}", member, 403, json={"role": "member"})


def test_member_player_link(api):
    admin = api.user("Admin")
    g, players, _ = api.group_with_players(admin, [5, 6, 7])
    gid = g["id"]
    mod = api.join(gid, admin, "moderator")
    member = api.join(gid, admin, "member")
    other = api.join(gid, admin, "member")
    p0, p1, p2 = (p["id"] for p in players)
    url = lambda user_id: f"/groups/{gid}/members/{user_id}/player"  # noqa: E731

    # A member picks their own player once.
    me = api.req("GET", "/auth/me", member, 200).json()["id"]
    api.req("PUT", url(me), member, 400, json={"player_id": None})
    detail = api.req("PUT", url(me), member, 200, json={"player_id": p0}).json()
    mine = next(m for m in detail["members"] if m["user_id"] == me)
    assert mine["player_id"] == p0 and mine["player_name"] == "P0"
    # ...and cannot change it afterwards.
    api.req("PUT", url(me), member, 403, json={"player_id": p1})
    # A member cannot touch other members.
    other_id = api.req("GET", "/auth/me", other, 200).json()["id"]
    api.req("PUT", url(other_id), member, 403, json={"player_id": p1})
    # A player can only be claimed by one member.
    api.req("PUT", url(other_id), other, 409, json={"player_id": p0})

    # Moderators/admins can change anyone's player (themselves included).
    mod_id = api.req("GET", "/auth/me", mod, 200).json()["id"]
    api.req("PUT", url(mod_id), mod, 200, json={"player_id": p2})
    api.req("PUT", url(mod_id), mod, 200, json={"player_id": p1})
    detail = api.req("PUT", url(me), admin, 200, json={"player_id": p2}).json()
    assert next(m for m in detail["members"] if m["user_id"] == me)["player_id"] == p2
    api.req("PUT", url(me), mod, 200, json={"player_id": None})
    # Players of another group are rejected.
    _, players2, _ = api.group_with_players(admin, [5])
    api.req("PUT", url(me), admin, 404, json={"player_id": players2[0]["id"]})

    # Deleting a player unlinks its member.
    api.req("DELETE", f"/groups/{gid}/players/{p1}", admin, 204)
    detail = api.req("GET", f"/groups/{gid}", admin, 200).json()
    assert next(m for m in detail["members"] if m["user_id"] == mod_id)["player_id"] is None


def test_photo_upload_serve_and_delete(api, client):
    admin = api.user()
    g, players, _ = api.group_with_players(admin, [5])
    mod = api.join(g["id"], admin, "moderator")
    pid = players[0]["id"]
    url = f"/groups/{g['id']}/players/{pid}/photo"

    api.req("POST", url, mod, 400, files={"file": ("x.png", b"not an image", "image/png")})
    player = api.req("POST", url, mod, 200, files={"file": ("x.png", _png(), "image/png")}).json()
    assert player["photo_url"].startswith("/api/photos/")

    res = client.get(player["photo_url"])  # public capability URL
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(res.content)).size == (512, 512)  # square, resized

    player = api.req("DELETE", url, mod, 200).json()
    assert player["photo_url"] is None
    assert client.get(res.url.path).status_code == 404


def test_member_player_position_and_card_photo(api, client):
    admin = api.user()
    g, players, _ = api.group_with_players(admin, [5, 6])
    member = api.join(g["id"], admin, "member")
    pid = players[0]["id"]
    p_other = players[1]["id"]
    me = api.req("GET", "/auth/me", member, 200).json()["id"]

    # Link member to pid
    api.req("PUT", f"/groups/{g['id']}/members/{me}/player", member, 200, json={"player_id": pid})

    # Member can update position and card_template of their own player
    res = api.req("PUT", f"/groups/{g['id']}/players/{pid}", member, 200, json={"position": "ATA", "card_template": "card-template2"}).json()
    assert res["position"] == "ATA"
    assert res["card_template"] == "card-template2"

    # Member cannot edit other fields of own player
    api.req("PUT", f"/groups/{g['id']}/players/{pid}", member, 403, json={"name": "New Name"})
    api.req("PUT", f"/groups/{g['id']}/players/{pid}", member, 403, json={"skill": 9.5})

    # Member cannot edit another player's position
    api.req("PUT", f"/groups/{g['id']}/players/{p_other}", member, 403, json={"position": "GOL"})

    # Member can upload card photo with is_card=True
    card_bytes = _png(644, 900)
    res = api.req(
        "POST",
        f"/groups/{g['id']}/players/{pid}/photo",
        member,
        200,
        files={"file": ("card.png", card_bytes, "image/png")},
        data={"is_card": "true"},
    ).json()
    assert res["photo_url"] is not None

    # Card photo preserves dimensions and aspect ratio
    card_res = client.get(res["photo_url"])
    assert card_res.status_code == 200
    im = Image.open(io.BytesIO(card_res.content))
    assert im.size == (644, 900)

    # Member can delete their photo
    api.req("DELETE", f"/groups/{g['id']}/players/{pid}/photo", member, 200)

    # Member cannot upload or delete another player's photo
    api.req("POST", f"/groups/{g['id']}/players/{p_other}/photo", member, 403, files={"file": ("c.png", card_bytes, "image/png")})
    api.req("DELETE", f"/groups/{g['id']}/players/{p_other}/photo", member, 403)


def test_match_names(api):
    admin = api.user()
    g, _, _ = api.group_with_players(admin, [])
    for name in ["Neto", "Pedro Vital", "Gabriel Ribeiro", "Gabriel conv", "Afonso (Dylan)", "João Victor"]:
        api.req("POST", f"/groups/{g['id']}/players", admin, 201, json={"name": name})
    text = "Lista quinta\n1. neto ✅\n2- Pedro Vital\n3) Gabriel\n4 - Dylan\njoao victor - 3.87\nNeto\nFulano"
    res = api.req("POST", f"/groups/{g['id']}/players/match-names", admin, 200, data={"text": text}).json()
    status = {r["input"]: r["status"] for r in res["rows"]}
    assert status == {
        "Lista quinta": "not_found",
        "neto": "matched",
        "Pedro Vital": "matched",
        "Gabriel": "ambiguous",
        "Dylan": "similar",
        "joao victor": "matched",
        "Neto": "duplicate",
        "Fulano": "not_found",
    }
    assert res["matched"] == 4 and res["pending"] == 3


def test_import_matches_by_name_update_create_ignore(api):
    admin = api.user()
    g, _, _ = api.group_with_players(admin, [])
    for name, skill in [("Neto", 4.8), ("Igor", 3), ("Cauã", 4)]:
        api.req("POST", f"/groups/{g['id']}/players", admin, 201, json={"name": name, "skill": skill})

    text = "Neto - 4.80\nNovo - 2\nigor - 3,5\nNovo - 3\ncaua\n - 7"
    res = api.req("POST", f"/groups/{g['id']}/players/import", admin, 200, data={"text": text}).json()
    # updates first, then creates, then ignored rows (input order inside each)
    assert [(r["name"], r["action"]) for r in res["rows"]] == [
        ("igor", "update"),
        ("Novo", "create"),
        ("Neto", "ignore"),  # same name, same nota
        ("Novo", "ignore"),  # repeated in the list
        ("caua", "ignore"),  # exists, but the line has no nota
        ("", "ignore"),  # no name
    ]
    assert res["rows"][0]["current_skill"] == 3
    assert (res["to_update"], res["to_create"], res["ignored"]) == (1, 1, 4)

    rows = [{"name": r["name"], "skill": r["skill"]} for r in res["rows"] if r["action"] != "ignore"]
    done = api.req("POST", f"/groups/{g['id']}/players/bulk", admin, 201, json={"players": rows}).json()
    assert (done["created"], done["updated"]) == (1, 1)
    skills = {p["name"]: p["skill"] for p in api.req("GET", f"/groups/{g['id']}/players", admin, 200).json()}
    assert skills == {"Neto": 4.8, "Igor": 3.5, "Cauã": 4, "Novo": 2}  # name kept, nota updated

    again = api.req("POST", f"/groups/{g['id']}/players/bulk", admin, 201, json={"players": rows}).json()
    assert (again["created"], again["updated"], again["ignored"]) == (0, 0, 2)
    # an item without nota never overwrites an existing one
    api.req("POST", f"/groups/{g['id']}/players/bulk", admin, 201, json={"players": [{"name": "neto"}]})
    assert next(p for p in api.req("GET", f"/groups/{g['id']}/players", admin, 200).json() if p["name"] == "Neto")["skill"] == 4.8


def test_event_manual_stats(api):
    admin = api.user()
    g, players, ev = api.group_with_players(admin, [5.0, 6.0])
    member = api.join(g["id"], admin, "member")
    member_id = api.req("GET", "/auth/me", member, 200).json()["id"]
    p1, p2 = players[0], players[1]

    # Member links themselves to p1
    api.req("PUT", f"/groups/{g['id']}/members/{member_id}/player", member, 200, json={"player_id": p1["id"]})

    # Member updates their own stats in event (no matches exist)
    res = api.req("PUT", f"/events/{ev['id']}/stats/{p1['id']}", member, 200, json={"goals": 3, "assists": 2}).json()
    assert res["goals"] == 3 and res["assists"] == 2

    # Member cannot update p2 stats (403)
    api.req("PUT", f"/events/{ev['id']}/stats/{p2['id']}", member, 403, json={"goals": 1, "assists": 1})

    # Admin CAN update p2 stats
    res2 = api.req("PUT", f"/events/{ev['id']}/stats/{p2['id']}", admin, 200, json={"goals": 1, "assists": 4}).json()
    assert res2["goals"] == 1 and res2["assists"] == 4

    # Ranking returns both players with their manual stats and card_template
    ranking = api.req("GET", f"/events/{ev['id']}/stats", member, 200).json()
    assert len(ranking) >= 2
    r_map = {r["player_id"]: r for r in ranking}
    assert r_map[p1["id"]]["goals"] == 3
    assert r_map[p1["id"]]["assists"] == 2
    assert "card_template" in r_map[p1["id"]]
    assert r_map[p2["id"]]["goals"] == 1
    assert r_map[p2["id"]]["assists"] == 4


