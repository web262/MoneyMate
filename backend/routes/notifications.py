# backend/routes/notifications.py
from flask import Blueprint, jsonify, request, session
from datetime import date, datetime
from ..database import get_db
from .auth import login_required
from ..utils.mailer import send_email
import os

# real prefix so URLs are /api/notifications/...
notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

def _budget_alerts(uid, db):
    rows = db.execute("""
        SELECT b.category, b.monthly_limit,
               IFNULL((
                 SELECT SUM(amount) FROM transactions t
                 WHERE t.user_id=b.user_id
                   AND t.type='expense'
                   AND t.category=b.category
                   AND strftime('%Y-%m', t.created_at)=strftime('%Y-%m','now')
               ), 0) AS spent_mtd
        FROM budgets b WHERE b.user_id=?
    """, (uid,)).fetchall()
    out=[]
    for r in rows:
        limit = float(r["monthly_limit"] or 0)
        spent = float(r["spent_mtd"] or 0)
        pct = spent/limit if limit>0 else 0
        if pct >= 1.0:
            out.append(f"⚠️ Budget exceeded for {r['category']}: {spent:.2f}/{limit:.2f}.")
        elif pct >= 0.8:
            out.append(f"🔔 Approaching budget for {r['category']}: {pct*100:.0f}% used.")
    return out

def _goal_alerts(uid, db):
    rows = db.execute(
        "SELECT id,name,target_amount,saved_amount,target_date,created_at,status "
        "FROM goals WHERE user_id=? AND status!='archived'", (uid,)
    ).fetchall()
    alerts=[]
    today = date.today()
    for g in rows:
        if g["status"] == "achieved":
            continue
        target = float(g["target_amount"] or 0)
        saved  = float(g["saved_amount"] or 0)
        tgt = g["target_date"]
        if tgt:
            try:
                tgt_d = datetime.fromisoformat(tgt).date()
            except:
                try: tgt_d = datetime.strptime(tgt, "%Y-%m-%d").date()
                except: tgt_d = None
        else:
            tgt_d = None

        remain = max(0.0, target - saved)
        if tgt_d:
            days_left = (tgt_d - today).days
            if days_left <= 7:
                alerts.append(f"🎯 Goal '{g['name']}': {remain:.2f} remaining, {days_left} day(s) left.")
            try:
                created = datetime.fromisoformat(g["created_at"]).date()
            except:
                created = today
            total_days = max(1, (tgt_d - created).days)
            elapsed = max(0, (today - created).days)
            elapsed_pct = elapsed/total_days if total_days>0 else 1
            progress_pct = (saved/target) if target>0 else 0
            if elapsed_pct - progress_pct >= 0.15 and days_left>0:
                alerts.append(f"⏳ Goal '{g['name']}' is behind schedule.")
        else:
            if remain>0 and saved==0:
                alerts.append(f"💡 Consider contributing to goal '{g['name']}' this week.")
    return alerts

def _digest_for_user(uid, db):
    return _budget_alerts(uid, db) + _goal_alerts(uid, db)

@notifications_bp.get("/preview")
@login_required
def preview():
    db = get_db()
    alerts = _digest_for_user(session["user_id"], db)
    return jsonify(success=True, alerts=alerts)

@notifications_bp.route("/send", methods=["POST"])   # explicit methods
@login_required
def send_to_me():
    db = get_db()
    alerts = _digest_for_user(session["user_id"], db)
    if not alerts:
        return jsonify(success=True, sent=False, message="No alerts.")
    user = db.execute("SELECT name,email FROM users WHERE id=?", (session["user_id"],)).fetchone()
    html = "<h3>Your MoneyMate alerts</h3><ul>" + "".join(f"<li>{a}</li>" for a in alerts) + "</ul>"
    ok = send_email(user["email"], "Your MoneyMate alerts", html)
    return jsonify(success=ok, sent=ok, count=len(alerts))

# Optional: admin cron
@notifications_bp.route("/run-all", methods=["POST"])
def run_all():
    key = request.args.get("key") or request.headers.get("X-API-Key")
    if key != os.getenv("ADMIN_API_KEY", "dev-key"):
        return jsonify(success=False), 403
    db = get_db()
    users = db.execute("SELECT id,name,email FROM users").fetchall()
    delivered = 0
    for u in users:
        alerts = _digest_for_user(u["id"], db)
        if not alerts: 
            continue
        html = "<h3>Your MoneyMate alerts</h3><ul>" + "".join(f"<li>{a}</li>" for a in alerts) + "</ul>"
        if send_email(u["email"], "Your MoneyMate alerts", html):
            delivered += 1
    return jsonify(success=True, delivered=delivered, users=len(users))
