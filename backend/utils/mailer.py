# backend/utils/mailer.py
import os, smtplib, ssl
from email.message import EmailMessage
from email.utils import formataddr

SMTP_HOST = os.getenv("SMTP_HOST")            # e.g. smtp.gmail.com
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))# TLS port for Gmail
SMTP_USER = os.getenv("SMTP_USERNAME")        # your full Gmail address
SMTP_PASS = os.getenv("SMTP_PASSWORD")        # 16-char App Password (not your login)
FROM_EMAIL = os.getenv("EMAIL_FROM", SMTP_USER or "no-reply@example.com")
FROM_NAME  = os.getenv("EMAIL_FROM_NAME", os.getenv("APP_NAME", "MoneyMate"))

DEV_MODE = not (SMTP_HOST and SMTP_USER and SMTP_PASS)

def _send_via_smtp(to_email: str, subject: str, html: str, text: str | None = None):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((FROM_NAME, FROM_EMAIL))
    msg["To"] = to_email
    msg["Reply-To"] = formataddr((FROM_NAME, FROM_EMAIL))

    # Plaintext fallback
    plain = text or "Open this email in an HTML-capable client."
    msg.set_content(plain)

    # HTML part
    msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls(context=context)
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)

def send_email(to_email: str, subject: str, html: str, text: str | None = None) -> bool:
    """
    Sends an email. If SMTP env vars are missing, logs a dev preview and returns True
    so the app flow continues for IB IA demos.
    """
    if DEV_MODE:
        print(f"\n--- DEV EMAIL (no SMTP configured) ---\nTo: {to_email}\nSubject: {subject}\n\n{html}\n--- END DEV EMAIL ---\n")
        return True
    try:
        _send_via_smtp(to_email, subject, html, text)
        return True
    except Exception as e:
        print("Email send failed:", repr(e))
        return False

# ---------- HTML templates ----------

def build_reset_email(name: str, link: str, app_name: str = "MoneyMate"):
    """
    Returns (html, text). HTML is Gmail-friendly (table layout, inline styles)
    and includes optional Gmail action markup (shows only if Google whitelists the sender).
    """
    preheader = f"Reset your {app_name} password."
    text = (
        f"Hello {name},\n\n"
        f"We received a request to reset your {app_name} password.\n\n"
        f"Reset link (valid for 2 hours): {link}\n\n"
        "If you didn't request this, you can ignore this email."
    )

    # JSON-LD for Gmail Go-To Action (works only for vetted senders; harmless otherwise)
    gmail_action = f"""
    <script type="application/ld+json">
    {{
      "@context": "http://schema.org",
      "@type": "EmailMessage",
      "description": "Reset your {app_name} password",
      "potentialAction": {{
        "@type": "ViewAction",
        "target": "{link}",
        "name": "Reset password"
      }}
    }}
    </script>
    """

    html = f"""<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>{app_name} – Reset your password</title>
  <style>
    /* Mobile friendly button */
    @media only screen and (max-width:600px) {{
      .container {{ width: 100% !important; }}
    }}
    a.button {{
      background: #22c55e; color:#071521; text-decoration:none;
      padding:12px 18px; border-radius:8px; display:inline-block; font-weight:600;
    }}
    .text-muted {{ color:#64748b; font-size:12px }}
  </style>
</head>
<body style="margin:0;background:#0b132b;">
  {gmail_action}
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">
    {preheader}
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b132b;padding:24px 0;">
    <tr>
      <td align="center">
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="width:600px;max-width:90%;background:#111827;border:1px solid rgba(255,255,255,.08);border-radius:14px;">
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <h2 style="margin:0;color:#e5e7eb;font-family:Segoe UI,Arial,sans-serif">{app_name}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0 24px;color:#c7d2fe;font-family:Segoe UI,Arial,sans-serif;">
              <h3 style="margin:0 0 12px 0;color:#e2e8f0;">Reset your password</h3>
              <p style="margin:0 0 16px 0;color:#dbe7f3;">Hello {name},</p>
              <p style="margin:0 0 16px 0;color:#dbe7f3;">
                We received a request to reset your {app_name} password. Click the button below to proceed.
                This link expires in <strong>2 hours</strong>.
              </p>
              <p style="margin:16px 0 24px 0;">
                <a class="button" href="{link}" target="_blank" rel="noopener noreferrer">Reset password</a>
              </p>
              <p class="text-muted" style="margin:0 0 16px 0;">
                If you didn’t request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px 24px;color:#94a3b8;font-family:Segoe UI,Arial,sans-serif;border-top:1px solid rgba(255,255,255,.08);">
              <div style="font-size:12px;">
                If the button doesn’t work, paste this link in your browser:<br>
                <a href="{link}" style="color:#38bdf8;">{link}</a>
              </div>
            </td>
          </tr>
        </table>
        <div style="color:#64748b;font-size:12px;margin-top:12px;font-family:Segoe UI,Arial,sans-serif;">
          © {app_name}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return html, text
