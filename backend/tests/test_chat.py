from tests.conftest import signup_with_profile, create_mutual_match


def _make_match(client):
    token_a, user_a_id = signup_with_profile(client, "ca@example.com", "CA", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "cb@example.com", "CB", "woman", ["man"])
    match_id = create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)
    return token_a, user_a_id, token_b, user_b_id, match_id


def test_websocket_delivers_message_to_both_participants(client):
    token_a, user_a_id, token_b, user_b_id, match_id = _make_match(client)

    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_json({"content": "hello from A"})
            msg_a = ws_a.receive_json()
            msg_b = ws_b.receive_json()
            assert msg_a["content"] == "hello from A"
            assert msg_b["content"] == "hello from A"
            assert msg_a["sender_id"] == user_a_id


def test_websocket_rejects_non_participant(client):
    _, _, _, _, match_id = _make_match(client)
    outsider_token, _ = signup_with_profile(client, "outsider@example.com", "Outsider", "man", ["woman"])

    try:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={outsider_token}"):
            raised = False
    except Exception:
        raised = True
    assert raised


def test_message_history_persists(client):
    token_a, _, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws:
        ws.send_json({"content": "persisted message"})
        ws.receive_json()

    history = client.get(f"/chat/{match_id}/messages", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert any(m["content"] == "persisted message" for m in history)


def test_read_receipts(client):
    token_a, _, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws:
        ws.send_json({"content": "read me"})
        ws.receive_json()

    marked = client.post(f"/chat/{match_id}/read", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert marked["marked_read"] == 1


def test_match_status_needs_response(client):
    token_a, user_a_id, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws:
        ws.send_json({"content": "your turn"})
        ws.receive_json()

    status_b = client.get(f"/chat/{match_id}/status", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert status_b["needs_response"] is True

    status_a = client.get(f"/chat/{match_id}/status", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert status_a["needs_response"] is False


def test_close_match_sends_kind_message_and_deactivates(client):
    token_a, user_a_id, token_b, _, match_id = _make_match(client)

    close_resp = client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                              json={"reason": "timing_not_right"})
    assert close_resp.status_code == 200
    assert close_resp.json()["closure_message_id"] is not None

    matches_b = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert not any(m["id"] == match_id for m in matches_b)

    # The closure message should still be readable by the person closed on
    # (this was a real bug: closing used to make history unreadable too)
    history_b = client.get(f"/chat/{match_id}/messages", headers={"Authorization": f"Bearer {token_b}"})
    assert history_b.status_code == 200
    assert len(history_b.json()) >= 1


def test_double_close_rejected(client):
    token_a, _, _, _, match_id = _make_match(client)
    client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                json={"reason": "not_feeling_it"})
    second = client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                          json={"reason": "other", "note": "test"})
    assert second.status_code == 404


def test_invalid_close_reason_rejected(client):
    token_a, _, _, _, match_id = _make_match(client)
    resp = client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                        json={"reason": "made_up_reason"})
    assert resp.status_code == 422


def test_closed_match_websocket_rejected(client):
    token_a, _, token_b, _, match_id = _make_match(client)
    client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                json={"reason": "distance"})

    try:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}"):
            raised = False
    except Exception:
        raised = True
    assert raised


def test_malformed_match_id_returns_404_not_500(client):
    token_a, _, _, _, _ = _make_match(client)
    resp = client.get("/chat/not-a-uuid/messages", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 404


# ---- Chat media upload ----

def test_upload_chat_image(client):
    from tests.conftest import make_test_image_bytes
    token_a, _, _, _, match_id = _make_match(client)
    resp = client.post(f"/chat/{match_id}/media", headers={"Authorization": f"Bearer {token_a}"},
                        files={"file": ("photo.jpg", make_test_image_bytes(), "image/jpeg")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["media_type"] == "image"
    assert "/media/chat/" in body["url"] or "chat/" in body["url"]

    # actually fetchable
    fetch = client.get(body["url"])
    assert fetch.status_code == 200


def test_upload_chat_video(client):
    token_a, _, _, _, match_id = _make_match(client)
    fake_video = b"\x00\x00\x00\x18ftypmp42" + b"0" * 1000  # not a real mp4, just needs the right content-type
    resp = client.post(f"/chat/{match_id}/media", headers={"Authorization": f"Bearer {token_a}"},
                        files={"file": ("clip.mp4", fake_video, "video/mp4")})
    assert resp.status_code == 200
    assert resp.json()["media_type"] == "video"


def test_upload_chat_media_rejects_bad_content_type(client):
    token_a, _, _, _, match_id = _make_match(client)
    resp = client.post(f"/chat/{match_id}/media", headers={"Authorization": f"Bearer {token_a}"},
                        files={"file": ("evil.exe", b"not media", "application/x-msdownload")})
    assert resp.status_code == 400


def test_upload_chat_media_requires_active_match(client):
    from tests.conftest import make_test_image_bytes
    token_a, _, _, _, match_id = _make_match(client)
    client.post(f"/chat/{match_id}/close", headers={"Authorization": f"Bearer {token_a}"},
                json={"reason": "not_feeling_it"})
    resp = client.post(f"/chat/{match_id}/media", headers={"Authorization": f"Bearer {token_a}"},
                        files={"file": ("photo.jpg", make_test_image_bytes(), "image/jpeg")})
    assert resp.status_code == 404


def test_chat_message_with_uploaded_media_url_delivered(client):
    from tests.conftest import make_test_image_bytes
    token_a, user_a_id, token_b, _, match_id = _make_match(client)
    upload = client.post(f"/chat/{match_id}/media", headers={"Authorization": f"Bearer {token_a}"},
                          files={"file": ("photo.jpg", make_test_image_bytes(), "image/jpeg")}).json()

    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_json({"type": "chat", "media_url": upload["url"]})
            msg_a = ws_a.receive_json()
            msg_b = ws_b.receive_json()
            assert msg_a["media_url"] == upload["url"]
            assert msg_b["media_url"] == upload["url"]


def test_chat_message_with_external_media_url_rejected(client):
    """Security check: a client can't just pass an arbitrary external URL
    and have it rendered as media for the other person."""
    token_a, _, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        ws_a.send_json({"type": "chat", "media_url": "https://evil.example.com/tracker.png"})
        response = ws_a.receive_json()
        assert response["type"] == "error"


# ---- WebRTC call signaling ----

def test_call_offer_relayed_to_other_participant(client):
    token_a, user_a_id, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_json({"type": "call-offer", "payload": {"sdp": "fake-offer-sdp"}})
            received = ws_b.receive_json()
            assert received["type"] == "call-offer"
            assert received["from_user_id"] == user_a_id
            assert received["payload"]["sdp"] == "fake-offer-sdp"


def test_full_call_handshake_offer_answer_ice(client):
    token_a, user_a_id, token_b, user_b_id, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            # A calls B
            ws_a.send_json({"type": "call-offer", "payload": {"sdp": "offer-sdp"}})
            offer = ws_b.receive_json()
            assert offer["type"] == "call-offer"

            # B answers
            ws_b.send_json({"type": "call-answer", "payload": {"sdp": "answer-sdp"}})
            answer = ws_a.receive_json()
            assert answer["type"] == "call-answer"
            assert answer["from_user_id"] == user_b_id

            # ICE candidates flow both directions
            ws_a.send_json({"type": "call-ice-candidate", "payload": {"candidate": "a-candidate"}})
            ice_at_b = ws_b.receive_json()
            assert ice_at_b["type"] == "call-ice-candidate"
            assert ice_at_b["payload"]["candidate"] == "a-candidate"

            ws_b.send_json({"type": "call-ice-candidate", "payload": {"candidate": "b-candidate"}})
            ice_at_a = ws_a.receive_json()
            assert ice_at_a["payload"]["candidate"] == "b-candidate"


def test_call_decline_relayed(client):
    token_a, _, token_b, user_b_id, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_json({"type": "call-offer", "payload": {"sdp": "offer"}})
            ws_b.receive_json()
            ws_b.send_json({"type": "call-decline"})
            declined = ws_a.receive_json()
            assert declined["type"] == "call-decline"
            assert declined["from_user_id"] == user_b_id


def test_call_end_logs_summary_message_with_duration(client):
    token_a, user_a_id, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_json({"type": "call-end", "payload": {"duration_seconds": 204}})
            end_a = ws_a.receive_json()
            end_b = ws_b.receive_json()
            assert end_a["type"] == "call-end"
            assert "3:24" in end_a["message"]["content"]
            assert end_b["message"]["content"] == end_a["message"]["content"]

    # and it's a real, permanently readable message like any other
    history = client.get(f"/chat/{match_id}/messages", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert any("3:24" in (m["content"] or "") for m in history)


# ---- Crash resilience ----

def test_malformed_json_does_not_crash_connection(client):
    """Real bug found in production testing: a non-JSON message used to
    raise an unhandled exception that killed the connection AND left it
    registered in the room, so the next broadcast to it crashed the OTHER
    participant's connection too. Verifies both survive now."""
    token_a, _, token_b, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws_b:
            ws_a.send_text("not valid json {{{")
            error = ws_a.receive_json()
            assert error["type"] == "error"

            # Both connections must still be alive and functional afterward
            ws_a.send_json({"type": "chat", "content": "still here"})
            msg_a = ws_a.receive_json()
            msg_b = ws_b.receive_json()
            assert msg_a["content"] == "still here"
            assert msg_b["content"] == "still here"


def test_non_dict_json_does_not_crash_connection(client):
    token_a, _, _, _, match_id = _make_match(client)
    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_a}") as ws_a:
        ws_a.send_json([1, 2, 3])
        error = ws_a.receive_json()
        assert error["type"] == "error"

        ws_a.send_json({"type": "chat", "content": "recovered"})
        msg = ws_a.receive_json()
        assert msg["content"] == "recovered"
