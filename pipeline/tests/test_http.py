import json

from bellwether import http


def test_redact_hides_keys():
    u = "https://api.open.fec.gov/v1/elections/?api_key=SECRET123&cycle=2026&state=GA"
    assert "SECRET123" not in http.redact(u)
    assert http.redact(u).endswith("api_key=REDACTED&cycle=2026&state=GA")
    assert "abc" not in http.redact("https://api.census.gov/data?get=NAME&for=state:*&key=abc")
    assert http.redact("https://en.wikipedia.org/w/api.php?page=X") == "https://en.wikipedia.org/w/api.php?page=X"


def test_cache_meta_never_stores_key(tmp_path, monkeypatch):
    monkeypatch.setattr(http, "CACHE_DIR", tmp_path)

    class R:
        status_code = 200
        content = b"{}"

        def raise_for_status(self):
            pass

    monkeypatch.setattr(http.requests, "get", lambda *a, **k: R())
    http.fetch("https://example.test/x?api_key=TOPSECRET&a=1", max_age_s=0)
    metas = list(tmp_path.glob("*.meta"))
    assert metas and all("TOPSECRET" not in m.read_text() for m in metas)
    assert "REDACTED" in json.loads(metas[0].read_text())["url"]
