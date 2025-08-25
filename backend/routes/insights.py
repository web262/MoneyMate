from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.database import connect_db
from datetime import datetime, timedelta

insights_bp = Blueprint('insights', __name__)

@insights_bp.route('/insights', methods=['GET'])
@jwt_required()
def get_insights():
    user_id = get_jwt_identity()
    conn = connect_db()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    thirty_days_ago = date.today() - timedelta(days=30)
    cursor.execute("""
        SELECT category, SUM(amount) AS total
        FROM transactions
        WHERE user_id = %s AND type='expense'
        AND created_at >= %s
        GROUP BY category
    """, (user_id, thirty_days_ago))
    rows = cursor.fetchall()

    total_all = sum(r['total'] for r in rows)
    advice = []
    for r in rows:
        cat = r['category']
        tot = float(r['total'])
        pct = tot / total_all * 100 if total_all else 0
        if pct > 25:
            advice.append({
                "title": f"Review your '{cat}' spending",
                "text": (f"You spent ${tot:.2f} ({pct:.0f}% of your last 30-day expenses) "
                f"on '{cat}'. Consider setting a tighter budget or finding ways."
                "to cut back."
            )
            })

         #tip
            advice.append({
                "title": "Take advanatage of roundup savings",
                "text": "Enable automatic round-ups to save spare chnage on every purchase."
            })

            cursor.close()
            conn.close()
            return jsonify({"advice": advice}), 200


    