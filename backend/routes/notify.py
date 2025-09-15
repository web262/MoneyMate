# backend/routes/notify.py
from flask import Blueprint, request, jsonify, session, current_app
from ..database import get_db
from .auth import login_required
from .budgets import ensure_schema as ensure_budgets_schema
from .goals import ensure_schema as ensure_goals_schema
from ..utils.mailer import send_email
import os

notify_bp = Blueprint("notify", __name__)

@notify_bp.before_app_request
def _ensure():
    # make sure budgets/goals tables exist
    ensure_budgets_schema()
    ensure_goals_schema()

def _budget_alerts(uid):
    db = get_db()
    rows = db.execute("""
        SELECT b.category, b.monthly_limit,
               IFNULL((
                 SELECT SUM(amount) FROM transactions t
                 WHERE t.user_id=b.user_id AND t.type='expense'
                   AND t.category=b.category
                   AND strftime('%Y-%m', t.created_at)=strftime('%Y-%m', 'now')
               ), 0) AS spent_mtd
        FROM budgets b WHERE b.user_id=?
    """, (uid,)).fetchall()

    # thresholds (use Settings if present)
    st = db.execute("""
        CREATE TABLE IF NOT EXISTS user_settings(
            user_id INTEGER PRIMARY KEY,
            currency_symbol TEXT DEFAULT '$',
            warn_threshold REAL DEFAULT 0.8,
            critical_threshold REAL DEFAULT 1.0
        )
    """)
    db.commit()
    s = get_db().execute("SELECT warn_threshold, critical_threshold FROM user_settings WHERE user_id=?",
                         (uid,)).fetchone()
    warn = s["warn_threshold"] if s else 0.8
    crit = s["critical_threshold"] if s else 1.0

    alerts = []
    for r in rows:
        pct = (r["spent_mtd"]/r["monthly_limit"]) if r["monthly_limit"] else 0
        if pct >= crit:
            alerts.append(f"Budget exceeded for {r['category']} (spent {r['spent_mtd']:.2f} / {r['monthly_limit']:.2f}).")
        elif pct >= warn:
            alerts.append(f"Approaching budget for {r['category']} ({pct*100:.0f}% used).")
    return alerts

def _goal_reminders(uid):
    # 'behind schedule' — still not hit target and past today or <10 days left
    rows = get_db().execute("""
        SELECT name, target_amount, saved_amount,
               target_date
        FROM goals WHERE user_id=? AND status='active'
    """, (uid,)).fetchall()
    from datetime import date, datetime
    notes = []
    for r in rows:
        target = float(r["target_amount"] or 0)
        saved  = float(r["saved_amount"] or 0)
        left = max(0.0, target - saved)
        tgt = r["target_date"]
        if not tgt:
            continue
        try:
            d = datetime.fromisoformat(tgt).date()
        except Exception:
            continue
        days_left = (d - date.today()).days
        if target > 0 and days_left <= 10 and left > 0:
            per_day = left / max(1, days_left)
            notes.append(f"Goal '{r['name']}' is {days_left} day(s) away. You need ~{per_day:.2f}/day to hit {target:.2f}.")
        if days_left < 0 and left > 0:
            notes.append(f"Goal '{r['name']}' is past due. Remaining: {left:.2f}.")
    return notes

@notify_bp.get("/check")
@login_required
def check():
    uid = session["user_id"]
    alerts = _budget_alerts(uid)
    goals  = _goal_reminders(uid)
    return jsonify(success=True, alerts=alerts, goals=goals, total=len(alerts)+len(goals))

@notify_bp.post("/dispatch")
@login_required
def dispatch():
    # Send email with current alerts/goals
    uid = session["user_id"]
    u = get_db().execute("SELECT email, name FROM users WHERE id=?", (uid,)).fetchone()
    if not u: 
        return jsonify(success=False, message="User not found"), 404

    alerts = _budget_alerts(uid)
    goals  = _goal_reminders(uid)
    if not alerts and not goals:
        return jsonify(success=True, sent=False, message="No alerts right now")

    body = []
    if alerts:
        body.append("Budget alerts:\n- " + "\n- ".join(alerts))
    if goals:
        body.append("Goal reminders:\n- " + "\n- ".join(goals))
    text = "\n\n".join(body)
    app_name = os.getenv("APP_NAME", "MoneyMate")
    ok = send_email(u["email"], f"{app_name} – Your alerts", text)
    return jsonify(success=True, sent=ok, counts={"alerts":len(alerts), "goals":len(goals)})
