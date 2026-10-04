import os
import uuid
from datetime import datetime, timezone
from . import store, webauthn


def begin(conn, user, old_id):
    cred = store.get_credential(conn, old_id)
    if not cred or cred.user_id != user:
        raise store.StoreError("Active owned credential required")
    ticket = uuid.uuid4().hex
    new_challenge = os.urandom(32)
    old_challenge = os.urandom(32)
    try:
        conn.execute("BEGIN IMMEDIATE")
        for challenge, purpose in [
            (new_challenge, store.PURPOSE_REGISTRATION),
            (old_challenge, store.PURPOSE_AUTHENTICATION),
        ]:
            conn.execute(
                "INSERT INTO challenges VALUES (?,?,?,?,?)",
                (challenge, purpose, user, 0, datetime.now(timezone.utc).isoformat()),
            )
        conn.execute(
            "INSERT INTO rotations VALUES (?,?,?,?,?,?)",
            (ticket, user, old_id, new_challenge, old_challenge, "pending"),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {
        "ticket": ticket,
        "new_challenge": new_challenge,
        "old_challenge": old_challenge,
    }


def finish(conn, cfg, user, ticket, new, old):
    row = conn.execute(
        "SELECT user_id,old_id,new_challenge,old_challenge,status FROM rotations WHERE ticket=?",
        (ticket,),
    ).fetchone()
    if not row or row[0] != user or row[4] != "pending":
        raise store.StoreError("Unavailable rotation")
    registered = webauthn.verify_registration(
        conn, cfg, user_id=user, _ticket=ticket, **new
    )
    webauthn.verify_authentication(conn, cfg, user_id=user, _ticket=ticket, **old)
    conn.execute("UPDATE credentials SET active=0 WHERE credential_id=?", (row[1],))
    conn.execute("UPDATE rotations SET status='done' WHERE ticket=?", (ticket,))
    conn.commit()
    return registered


def cancel(conn, user, ticket):
    cur = conn.execute(
        "UPDATE rotations SET status='cancelled' WHERE ticket=? AND user_id=? AND status='pending'",
        (ticket, user),
    )
    conn.commit()
    if cur.rowcount != 1:
        raise store.StoreError("Unavailable rotation")
