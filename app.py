import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify, send_from_directory
from config import Config
from models import db

FRONTEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


def create_app(config=Config):
    app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
    app.config.from_object(config)
    db.init_app(app)

    from routes import auth_admin, catalog, sales, insights
    for mod in (auth_admin, catalog, sales, insights):
        app.register_blueprint(mod.bp)

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="Not found"), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify(error="Something went wrong on the server"), 500

    @app.after_request
    def headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        if resp.mimetype == "application/json":
            resp.headers["Cache-Control"] = "no-store"
        return resp

    return app


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=os.getenv("FLASK_DEBUG", "0") == "1", port=5000)
