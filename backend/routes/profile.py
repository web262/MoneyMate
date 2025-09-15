from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.database import connect_db

profile_bp = Blueprint("profile", __name__)

@profile_bp.route("/update", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    data = request.get_json()
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(""" UPDATE users SET name=%s, email=%s WHERE id=%s """, (data["name"], data["email"], user_id))
    conn.commit()

    return jsonify({"message": "Profile updated successfully"}), 200