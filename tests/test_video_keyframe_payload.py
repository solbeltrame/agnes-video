"""Contract checks for text, reference-image, and first/last-frame payloads."""

import pytest

import core.api.agnes_video as av


@pytest.fixture
def payload_capture(monkeypatch):
    api = av.AgnesVideoAPI(api_key="test-key", model="agnes-video-2.5-flash")
    captured = {}

    async def resolve_image(path):
        return f"https://images.example/{path}"

    async def submit(payload, mode_desc, progress_callback=None):
        captured.update(payload)
        captured["_mode_desc"] = mode_desc
        return "video-test-id"

    monkeypatch.setattr(av, "normalize_reference_path", lambda path, width, height: path)
    monkeypatch.setattr(api, "_resolve_image_ref", resolve_image)
    monkeypatch.setattr(api, "_submit_with_retry", submit)
    return api, captured


@pytest.mark.asyncio
async def test_text_video_payload_has_no_image_fields(payload_capture):
    api, payload = payload_capture

    await api._submit_video_v25("A scene", [], duration=8, width=1280, height=720)

    assert payload["mode"] == "text"
    assert payload["seconds"] == "8"
    assert payload["aspect_ratio"] == "16:9"
    assert "images" not in payload
    assert "first_frame" not in payload
    assert "last_frame" not in payload


@pytest.mark.asyncio
async def test_one_image_remains_reference_mode(payload_capture):
    api, payload = payload_capture

    await api._submit_video_v25("A scene", ["start.png"], duration=8, width=720, height=1280)

    assert payload["mode"] == "reference"
    assert payload["images"] == ["https://images.example/start.png"]
    assert payload["aspect_ratio"] == "9:16"
    assert "first_frame" not in payload
    assert "last_frame" not in payload


@pytest.mark.asyncio
async def test_two_images_use_real_first_and_last_frame_fields(payload_capture):
    api, payload = payload_capture

    await api._submit_video_v25(
        "Move from the opening composition to the final composition",
        ["start.png", "end.png"],
        duration=10,
        width=1280,
        height=720,
        keyframe=True,
    )

    assert payload["model"] == "agnes-video-2.5-flash"
    assert payload["mode"] == "keyframe"
    assert payload["first_frame"] == "https://images.example/start.png"
    assert payload["last_frame"] == "https://images.example/end.png"
    assert payload["seconds"] == "10"
    assert payload["size"] == "720P"
    assert payload["aspect_ratio"] == "16:9"
    assert "images" not in payload
