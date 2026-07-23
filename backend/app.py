"""Main Flask application for the traffic digital twin backend."""

from flask import Flask, jsonify

from .config import APP_NAME, APP_VERSION, DEBUG, HOST, PORT

app = Flask(__name__)
app.config["APP_NAME"] = APP_NAME
app.config["APP_VERSION"] = APP_VERSION


@app.get("/")
def index():
    return jsonify(
        {
            "name": APP_NAME,
            "version": APP_VERSION,
            "status": "ok",
            "message": "Traffic digital twin backend is running",
        }
    )


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": APP_NAME, "version": APP_VERSION})


@app.get("/status")
def status():
    return jsonify({"status": "ready", "debug": DEBUG})


def create_app():
    return app


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=DEBUG)
