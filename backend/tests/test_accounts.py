from sqlalchemy.orm import Session

from app.models import Group, Player


def _email(api, auth):
    return api.req("GET", "/auth/me", auth, 200).json()["email"]


def _login(api, email, password):
    return api.c.post("/api/auth/login", json={"email": email, "password": password}).status_code


def test_delete_group_is_logical(api, engine):
    admin = api.user("Admin")
    g, players, ev = api.group_with_players(admin, [5, 6])
    gid = g["id"]
    invite = api.req("POST", f"/groups/{gid}/invites", admin, 201, json={"role": "member"}).json()
    member = api.join(gid, admin, "member")

    # Only the creator deletes, as before.
    api.req("DELETE", f"/groups/{gid}", member, 403)
    api.req("DELETE", f"/groups/{gid}", admin, 204)

    # Hidden everywhere: listing, group and event routes, invites.
    assert api.req("GET", "/groups", admin, 200).json() == []
    assert api.req("GET", "/groups", member, 200).json() == []
    api.req("GET", f"/groups/{gid}", admin, 404)
    api.req("GET", f"/groups/{gid}/players", member, 404)
    api.req("GET", f"/events/{ev['id']}", admin, 404)
    api.req("GET", f"/events/{ev['id']}/teams", admin, 404)
    api.req("DELETE", f"/groups/{gid}", admin, 404)
    preview = api.req("GET", f"/invites/{invite['token']}", api.user(), 200).json()
    assert preview["valid"] is False
    api.req("POST", f"/invites/{invite['token']}/accept", api.user(), 400)

    # ...but nothing was removed from the database.
    with Session(engine) as db:
        group = db.get(Group, gid)
        assert group is not None and group.deleted_at is not None
        assert db.query(Player).filter_by(group_id=gid).count() == len(players)
        assert len(group.memberships) == 2 and len(group.events) == 1


def test_change_own_password(api):
    auth = api.user()
    email = _email(api, auth)

    api.req("PUT", "/auth/password", auth, 400, json={"current_password": "wrong", "new_password": "novasenha"})
    api.req("PUT", "/auth/password", auth, 400, json={"current_password": "secret123", "new_password": "secret123"})
    api.req("PUT", "/auth/password", auth, 422, json={"current_password": "secret123", "new_password": "123"})
    assert _login(api, email, "secret123") == 200

    api.req("PUT", "/auth/password", auth, 204, json={"current_password": "secret123", "new_password": "novasenha"})
    assert _login(api, email, "novasenha") == 200
    assert _login(api, email, "secret123") == 401


def _uid(api, auth):
    return api.req("GET", "/auth/me", auth, 200).json()["id"]


def test_admin_sets_member_password_by_hierarchy(api):
    creator = api.user("Criador")
    gid = api.req("POST", "/groups", creator, 201, json={"name": "Pelada"}).json()["id"]
    admin = api.join(gid, creator, "admin")
    admin2 = api.join(gid, creator, "admin")
    mod = api.join(gid, creator, "moderator")
    member = api.join(gid, creator, "member")
    ids = {name: _uid(api, a) for name, a in
           [("creator", creator), ("admin", admin), ("admin2", admin2), ("mod", mod), ("member", member)]}
    url = lambda uid: f"/groups/{gid}/members/{uid}/password"  # noqa: E731
    body = {"new_password": "trocada1"}

    # Admins reach moderators and members; the creator reaches admins too.
    api.req("PUT", url(ids["member"]), admin, 204, json=body)
    assert _login(api, _email(api, member), "trocada1") == 200
    assert _login(api, _email(api, member), "secret123") == 401
    api.req("PUT", url(ids["mod"]), admin, 204, json=body)
    api.req("PUT", url(ids["admin2"]), admin, 403, json=body)
    api.req("PUT", url(ids["admin2"]), creator, 204, json=body)
    api.req("PUT", url(ids["mod"]), creator, 204, json=body)

    # Never the creator's, never their own (needs the current one), only admins.
    api.req("PUT", url(ids["creator"]), admin, 403, json=body)
    api.req("PUT", url(ids["admin"]), admin, 400, json=body)
    api.req("PUT", url(ids["member"]), mod, 403, json=body)
    api.req("PUT", url(ids["mod"]), member, 403, json=body)
    api.req("PUT", url(ids["member"]), admin, 422, json={"new_password": "123"})

    # The member list tells the admin where the key button applies.
    def flags(viewer):
        members = api.req("GET", f"/groups/{gid}", viewer, 200).json()["members"]
        return {m["user_id"] for m in members if m["can_set_password"]}

    assert flags(admin) == {ids["mod"], ids["member"]}
    assert flags(creator) == {ids["admin"], ids["admin2"], ids["mod"], ids["member"]}
    assert flags(mod) == set()

    # Someone of another group only is not reachable from here.
    outsider = api.user("Fora")
    api.req("PUT", url(_uid(api, outsider)), admin, 404, json=body)


def test_member_password_needs_rights_in_all_their_groups(api):
    creator = api.user("Criador")
    gid = api.req("POST", "/groups", creator, 201, json={"name": "Pelada"}).json()["id"]
    admin = api.join(gid, creator, "admin")
    member = api.join(gid, creator, "member")
    target = _uid(api, member)
    url = f"/groups/{gid}/members/{target}/password"
    body = {"new_password": "trocada1"}

    def can():
        members = api.req("GET", f"/groups/{gid}", admin, 200).json()["members"]
        return next(m["can_set_password"] for m in members if m["user_id"] == target)

    # The member joins another group where the admin is nobody: blocked.
    owner = api.user("Dono")
    other = api.req("POST", "/groups", owner, 201, json={"name": "Outro"}).json()["id"]
    invite = api.req("POST", f"/groups/{other}/invites", owner, 201, json={"role": "member"}).json()
    api.req("POST", f"/invites/{invite['token']}/accept", member, 200)
    detail = api.req("PUT", url, admin, 403, json=body).json()["detail"]
    assert "outro grupo" in detail and not can()

    # Admin there too: allowed again.
    invite = api.req("POST", f"/groups/{other}/invites", owner, 201, json={"role": "admin"}).json()
    api.req("POST", f"/invites/{invite['token']}/accept", admin, 200)
    assert can()
    api.req("PUT", url, admin, 204, json=body)

    # The member becomes an admin there, and the admin is not its creator: blocked.
    api.req("PATCH", f"/groups/{other}/members/{target}", owner, 200, json={"role": "admin"})
    api.req("PUT", url, admin, 403, json=body)
    assert not can()

    # Deleted groups do not count.
    api.req("DELETE", f"/groups/{other}", owner, 204)
    assert can()
    api.req("PUT", url, admin, 204, json=body)

    # Creating a group of their own makes the member unreachable for others.
    api.req("POST", "/groups", member, 201, json={"name": "Meu grupo"})
    api.req("PUT", url, admin, 403, json=body)
    assert not can()
