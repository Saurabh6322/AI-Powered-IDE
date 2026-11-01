"""
Tests for the auth endpoints: register, login, me, refresh.
"""

import pytest
from fastapi.testclient import TestClient

from main import app
from models import Base, engine

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    """Recreate tables before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


class TestRegister:
    def test_register_success(self):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "secret123",
            "name": "Test User",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "test@example.com"
        assert data["user"]["name"] == "Test User"

    def test_register_duplicate(self):
        client.post("/api/auth/register", json={
            "email": "dup@example.com", "password": "secret123",
        })
        resp = client.post("/api/auth/register", json={
            "email": "dup@example.com", "password": "secret456",
        })
        assert resp.status_code == 409

    def test_register_short_password(self):
        resp = client.post("/api/auth/register", json={
            "email": "x@example.com", "password": "12345",
        })
        assert resp.status_code == 400

    def test_register_missing_fields(self):
        resp = client.post("/api/auth/register", json={"email": ""})
        assert resp.status_code == 400


class TestLogin:
    def _register(self):
        return client.post("/api/auth/register", json={
            "email": "login@example.com",
            "password": "secret123",
            "name": "Login User",
        })

    def test_login_success(self):
        self._register()
        resp = client.post("/api/auth/login", json={
            "email": "login@example.com", "password": "secret123",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self):
        self._register()
        resp = client.post("/api/auth/login", json={
            "email": "login@example.com", "password": "wrong",
        })
        assert resp.status_code == 401

    def test_login_nonexistent(self):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@example.com", "password": "secret",
        })
        assert resp.status_code == 401


class TestMe:
    def test_me_with_valid_token(self):
        reg = client.post("/api/auth/register", json={
            "email": "me@example.com", "password": "secret123",
        })
        token = reg.json()["access_token"]
        resp = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["email"] == "me@example.com"

    def test_me_no_token(self):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_bad_token(self):
        resp = client.get("/api/auth/me", headers={
            "Authorization": "Bearer invalid.token.here",
        })
        assert resp.status_code == 401


class TestRefresh:
    def test_refresh_success(self):
        reg = client.post("/api/auth/register", json={
            "email": "refresh@example.com", "password": "secret123",
        })
        refresh_token = reg.json()["refresh_token"]
        resp = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_invalid(self):
        resp = client.post("/api/auth/refresh", json={
            "refresh_token": "bad.token",
        })
        assert resp.status_code == 401


class TestFileAPI:
    def test_get_tree(self):
        resp = client.get("/api/files/tree")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_read_nonexistent(self):
        resp = client.get("/api/files/nonexistent-file.txt")
        assert resp.status_code == 404

    def test_write_and_read(self):
        client.put("/api/files/test-write.txt", content=b"hello world")
        resp = client.get("/api/files/test-write.txt")
        assert resp.status_code == 200
        assert resp.text == "hello world"
        client.delete("/api/files/test-write.txt")

    def test_search(self):
        client.put("/api/files/search-test.py", content=b"def hello_world():\n    pass")
        resp = client.get("/api/files/search/text?q=hello_world")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        client.delete("/api/files/search-test.py")


class TestHealthAndAI:
    def test_health(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_ai_providers(self):
        resp = client.get("/api/ai/providers")
        assert resp.status_code == 200
        providers = resp.json()["providers"]
        assert len(providers) == 3
        names = [p["id"] for p in providers]
        assert "ollama" in names
        assert "groq" in names
        assert "gemini" in names

    def test_lsp_languages(self):
        resp = client.get("/api/lsp/languages")
        assert resp.status_code == 200
        langs = [l["language"] for l in resp.json()["languages"]]
        assert "python" in langs
        assert "typescript" in langs
