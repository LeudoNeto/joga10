def _me(api, auth):
    return api.req("GET", "/auth/me", auth, 200).json()["id"]


def _link(api, gid, auth, player_id, by=None):
    api.req(
        "PUT", f"/groups/{gid}/members/{_me(api, auth)}/player", by or auth, 200,
        json={"player_id": player_id},
    )


def _vote(api, gid, auth, votes, expect=200):
    return api.req(
        "PUT", f"/groups/{gid}/votes", auth, expect,
        json={"votes": [{"player_id": p, "skill": s} for p, s in votes.items()]},
    )


def _summary(api, gid, admin):
    res = api.req("GET", f"/groups/{gid}/votes/summary", admin, 200).json()
    return res["voters"], {r["player_id"]: r for r in res["players"]}


def test_voting_rules_and_average(api):
    admin = api.user("Admin")
    g, players, _ = api.group_with_players(admin, [5, 6, 7, 8])
    gid = g["id"]
    p0, p1, p2, p3 = (p["id"] for p in players)
    alice = api.join(gid, admin, "member")
    bob = api.join(gid, admin, "member")

    # A member must say which player they are before voting.
    _vote(api, gid, alice, {p1: 7}, expect=400)
    _link(api, gid, alice, p0)
    _link(api, gid, bob, p1)

    # Never on themselves, only inside the group range, only group players.
    _vote(api, gid, alice, {p0: 9}, expect=400)
    _vote(api, gid, alice, {p1: 11}, expect=400)
    _, other_players, _ = api.group_with_players(admin, [5])
    _vote(api, gid, alice, {other_players[0]["id"]: 5}, expect=404)

    mine = _vote(api, gid, alice, {p1: 8, p2: 6, p3: None}).json()
    assert {v["player_id"]: v["skill"] for v in mine} == {p1: 8, p2: 6, p3: None}
    _vote(api, gid, bob, {p0: 4, p2: 9, p3: None})

    voters, rows = _summary(api, gid, admin)
    assert voters == 2
    assert (rows[p1]["vote_skill"], rows[p1]["vote_count"]) == (8, 1)
    assert (rows[p2]["vote_skill"], rows[p2]["vote_count"]) == (7.5, 2)
    # "Não sei" is kept apart and does not count in the average.
    assert (rows[p3]["vote_skill"], rows[p3]["vote_count"], rows[p3]["unknown_count"]) == (None, 0, 2)
    assert rows[p2]["skill"] == 7  # the real nota is untouched

    # Changing a vote (and "Não sei" -> nota) refreshes the average; votes
    # left out of the request are kept.
    mine = _vote(api, gid, alice, {p2: 10, p3: 5}).json()
    assert {v["player_id"]: v["skill"] for v in mine} == {p1: 8, p2: 10, p3: 5}
    _, rows = _summary(api, gid, admin)
    assert rows[p2]["vote_skill"] == 9.5
    assert (rows[p3]["vote_skill"], rows[p3]["unknown_count"]) == (5, 1)

    # Votes are private: each member only reads their own.
    bobs = api.req("GET", f"/groups/{gid}/votes", bob, 200).json()
    assert {v["player_id"] for v in bobs} == {p0, p2, p3}


def test_summary_and_apply_are_admin_only(api):
    admin = api.user("Admin")
    g, players, _ = api.group_with_players(admin, [5, 6])
    gid = g["id"]
    p0, p1 = (p["id"] for p in players)
    mod = api.join(gid, admin, "moderator")
    _link(api, gid, mod, p0)
    _vote(api, gid, mod, {p1: 9})

    api.req("GET", f"/groups/{gid}/votes/summary", mod, 403)
    api.req("POST", f"/groups/{gid}/votes/apply", mod, 403, json={"updates": [{"player_id": p1, "skill": 9}]})

    # Out of range, empty or foreign players are rejected (nothing written).
    api.req("POST", f"/groups/{gid}/votes/apply", admin, 400, json={"updates": [{"player_id": p1, "skill": 11}]})
    api.req("POST", f"/groups/{gid}/votes/apply", admin, 422, json={"updates": []})
    api.req("POST", f"/groups/{gid}/votes/apply", admin, 404, json={"updates": [{"player_id": 999, "skill": 5}]})

    # The admin accepts the vote for one and types a nota for the other.
    updated = api.req(
        "POST", f"/groups/{gid}/votes/apply", admin, 200,
        json={"updates": [{"player_id": p1, "skill": 9}, {"player_id": p0, "skill": 5.5}]},
    ).json()
    assert {p["id"]: p["skill"] for p in updated} == {p0: 5.5, p1: 9}
    _, rows = _summary(api, gid, admin)
    assert (rows[p1]["skill"], rows[p1]["vote_skill"]) == (9, 9)


def test_votes_follow_membership_and_range_changes(api):
    admin = api.user("Admin")
    g, players, _ = api.group_with_players(admin, [5, 6, 7])
    gid = g["id"]
    p0, p1, p2 = (p["id"] for p in players)
    alice = api.join(gid, admin, "member")
    bob = api.join(gid, admin, "member")
    _link(api, gid, alice, p0)
    _link(api, gid, bob, p1)
    _vote(api, gid, alice, {p1: 10, p2: 2})
    _vote(api, gid, bob, {p2: 8})

    # Narrowing the range clamps the votes and their averages.
    api.req("PATCH", f"/groups/{gid}", admin, 200, json={"min_skill": 3, "max_skill": 9})
    _, rows = _summary(api, gid, admin)
    assert rows[p1]["vote_skill"] == 9
    assert rows[p2]["vote_skill"] == 5.5  # (3 + 8) / 2

    # Alice becomes p2: her vote on herself is discarded.
    _link(api, gid, alice, p2, by=admin)
    _, rows = _summary(api, gid, admin)
    assert (rows[p2]["vote_skill"], rows[p2]["vote_count"]) == (8, 1)
    mine = api.req("GET", f"/groups/{gid}/votes", alice, 200).json()
    assert [v["player_id"] for v in mine] == [p1]

    # Leaving the group removes the member's votes.
    api.req("DELETE", f"/groups/{gid}/leave", bob, 204)
    voters, rows = _summary(api, gid, admin)
    assert voters == 1
    assert (rows[p2]["vote_skill"], rows[p2]["vote_count"]) == (None, 0)

    # Deleting a player deletes the votes on it.
    api.req("DELETE", f"/groups/{gid}/players/{p1}", admin, 204)
    assert api.req("GET", f"/groups/{gid}/votes", alice, 200).json() == []
