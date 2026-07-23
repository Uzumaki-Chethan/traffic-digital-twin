from backend.app import app


def test_health_endpoint():
    client = app.test_client()

    response = client.get("/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["service"] == "traffic-digital-twin"


def test_root_endpoint():
    client = app.test_client()

    response = client.get("/")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["name"] == "traffic-digital-twin"
