from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.database import connect_db
from datetime import datetime

transactions_bp = Blueprint('transactions', __name__)

@transactions_bp.route('/add', methods=['POST'])
@jwt_required()
def add_transaction():
    user_id = get_jwt_identity()
    data=request.get_json()

    tx_type = data.get('type')
    category = data.get('category')
    amount = data.get('amount')

    if not all([tx_type, category, amount]):
        return jsonify({"error": "Missing fields"}), 400
    
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor=conn.cursor(dictionary=True)


    cursor.execute(""" INSERT INTO transactions (user_id, type, category, amount, created_at)
                   Values (%s, %s, %s, %s, NOW()) """, (user_id, tx_type, category, amount))
    conn.commit()

    cursor.execute(""" SELECT amount AS budget_amount FROM budgets WHERE user id = %s AND category =%s LIMIT 1 """, (user_id, category))
    budget_row = cursor.fetchone()

    warning = None
    if budget_row:
        budget_amt = float(budget_row['budget_amount'])



        cursor.execute(""" SELECT COALESCE(SUM(amount), 0) AS total_spent FROM transactions WHERE user_id = %s AND category = %s AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) """, (user_id, category))
        spent_row = cursor.fetchone()
        total_spent = float(spent_row['total_spent'])


        if total_spent + amount > budget_amt:
            warning = (f"You have spent ${total_spent:2f} in '{category}', " f" which exceeds your monthly budget of ${budget_amt:2f}.")

            cursor.close()
            conn.close()


            resp = {"message": "Transaction added successfully"}
            if warning:
                resp["warning"] = warning

                return jsonify(resp), 201

def get_transactions():
    user_id = get_jwt_identity()
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    # Fetch recent transactions
    cursor.execute("""
        SELECT id, type, category, amount, created_at 
        FROM transactions 
        WHERE user_id = %s 
        ORDER BY created_at DESC 
        LIMIT 10
    """, (user_id,))
    transactions = cursor.fetchall()

    cursor.close()
    conn.close()
    return jsonify({"transactions": transactions}), 200