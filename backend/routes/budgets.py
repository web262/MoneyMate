from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.database import connect_db

budgets_bp = Blueprint("budgets", __name__)

@budgets_bp.route("/add", methods=["POST"])
@jwt_required()
def add_budget():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute(
        "INSERT INTO budgets (user_id, category, amount) VALUES (%s, %s, %s)",
        (user_id, data["category"], data["amount"])
    )
    conn.commit()
    return jsonify({"message": "Budget added successfully"}), 201

@budgets_bp.route("/all", methods=["GET"])
@jwt_required()
def get_all_budgets():
    user_id = get_jwt_identity()
    
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM budgets WHERE user_id = %s", (user_id,))
    budgets = cursor.fetchall()
    return jsonify(budgets), 200

@budgets_bp.route("/update/<int:id>", methods=["PUT"])
@jwt_required()
def update_budget(id):
    user_id = get_jwt_identity()
    data = request.get_json()
    
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute(
        "UPDATE budgets SET category = %s, amount = %s WHERE id = %s AND user_id = %s",
        (data["category"], data["amount"], id, user_id)
    )
    conn.commit()
    return jsonify({"message": "Budget updated successfully"}), 200

@budgets_bp.route("/delete/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_budget(id):
    user_id = get_jwt_identity()
    
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("DELETE FROM budgets WHERE id = %s AND user_id = %s", (id, user_id))
    conn.commit()
    return jsonify({"message": "Budget deleted successfully"}), 200
