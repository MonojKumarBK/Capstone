# backend/app.py
import os
import json
import traceback
import csv
import time
from io import StringIO
from flask import Flask, request, jsonify, send_from_directory, Response, send_file
from flask_cors import CORS
import joblib
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
import requests
import jwt
import datetime

# -----------------------------
# Load environment (.env at project root)
# -----------------------------
BASE = os.path.dirname(os.path.abspath(__file__))          # .../project/backend
FRONTEND_ROOT = os.path.abspath(os.path.join(BASE, '..'))   # .../project
ENV_PATH = os.path.join(FRONTEND_ROOT, '.env')
load_dotenv(ENV_PATH)

# Google / OAuth config from env
GOOGLE_CLIENT_ID = os.getenv("ID")
GOOGLE_CLIENT_SECRET = os.getenv("Pasww")
OAUTH_SECRET_KEY = os.getenv("Nothing")  # used to sign JWT tokens for session

# For localhost testing only: allow insecure transport for oauthlib
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

# -----------------------------
# App config & SMTP
# -----------------------------
app = Flask(__name__, static_folder=None)
CORS(app)

MAIL_SERVER = os.getenv("MAIL_SERVER")
MAIL_PORT = int(os.getenv("MAIL_PORT") or 587)
MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Mentallify Contact")
MAIL_TO = os.getenv("MAIL_TO")
SITE_CONTACT_EMAIL = os.getenv("SITE_CONTACT_EMAIL", MAIL_USERNAME or "contact@example.com")

if not (MAIL_SERVER and MAIL_USERNAME and MAIL_PASSWORD and MAIL_TO):
    print("Warning: SMTP not fully configured. Check .env file.")

# -----------------------------
# Paths for artifacts / data
# -----------------------------
MODELS_DIR = os.path.join(FRONTEND_ROOT, 'models')
DATA_DIR = os.path.join(FRONTEND_ROOT, 'data')

# -----------------------------
# ML artifact loading (optional)
# -----------------------------
TFIDF_PATH = os.path.join(BASE, 'tfidf_vectorizer.pkl')
MODEL_PATH = os.path.join(BASE, 'mental_health_model.pkl')
LE_PATH = os.path.join(BASE, 'label_encoder.pkl')

tfidf = model = label_encoder = None

def safe_load(path, name):
    if not os.path.exists(path):
        print(f"[artifact] {name} not found at {path}")
        return None
    try:
        obj = joblib.load(path)
        print(f"[artifact] Loaded {name}")
        return obj
    except Exception as e:
        print(f"[artifact] Failed to load {name}: {e}")
        traceback.print_exc()
        return None

def load_artifacts():
    global tfidf, model, label_encoder
    tfidf = safe_load(TFIDF_PATH, 'tfidf_vectorizer.pkl')
    model = safe_load(MODEL_PATH, 'mental_health_model.pkl')
    label_encoder = safe_load(LE_PATH, 'label_encoder.pkl')
    print("Artifacts status -> tfidf:", bool(tfidf), "model:", bool(model), "label_encoder:", bool(label_encoder))

load_artifacts()

# -----------------------------
# Symptom bank (quiz)
# -----------------------------
SYMPTOM_BANK_PATH = os.path.join(DATA_DIR, 'symptom_bank.json')
if os.path.exists(SYMPTOM_BANK_PATH):
    try:
        with open(SYMPTOM_BANK_PATH, 'r', encoding='utf-8') as f:
            SYMPTOM_BANK = json.load(f)
    except Exception:
        SYMPTOM_BANK = {"diseases": {}, "questions": []}
        print("[data] failed to read symptom_bank.json, using fallback")
else:
    SYMPTOM_BANK = {"diseases": {}, "questions": []}
    print("[data] symptom_bank.json not found, using fallback questions")

# -----------------------------
# Keyword fallback for chat
# -----------------------------
def keyword_fallback(text):
    t = (text or "").lower()
    depression = ['sad','depress','hopeless','empty','guilty','worthless','tired','suicidal']
    anxiety = ['anxious','worried','panic','nervous','tense','restless','heart','sweat']
    bipolar = ['manic','high','euphoric','impulsive','spending','risky','mood swing','mood swings']
    ptsd = ['trauma','flashback','nightmare','trigger','hypervigilant','startle','avoid']
    ocd = ['obsession','compulsion','ritual','repeat','check','clean','order']
    schizo = ['hallucination','delusion','paranoid','disorganized','withdrawn']

    matches = []
    if any(k in t for k in depression): matches.append('Depression')
    if any(k in t for k in anxiety): matches.append('Anxiety')
    if any(k in t for k in bipolar): matches.append('Bipolar Disorder')
    if any(k in t for k in ptsd): matches.append('PTSD')
    if any(k in t for k in ocd): matches.append('OCD')
    if any(k in t for k in schizo): matches.append('Schizophrenia')

    if not matches:
        return ("Thanks for sharing — I might need a bit more detail. "
                "Could you tell me whether this affects sleep, appetite, mood, or daily activities?")
    resp = "Based on what you said, these might be related: " + ", ".join(matches) + ".\n\nGeneral suggestions:\n"
    if 'Depression' in matches:
        resp += "• Depression: Consider therapy, staying active, and consult a professional.\n"
    if 'Anxiety' in matches:
        resp += "• Anxiety: Try grounding/breathing exercises and seek help if interfering with life.\n"
    resp += "\nThis is informational only — please consult a healthcare professional."
    return resp

# -----------------------------
# Helper: send email via SMTP
# -----------------------------
def send_contact_email(sender_name: str, sender_email: str, message_text: str) -> None:
    if not (MAIL_SERVER and MAIL_USERNAME and MAIL_PASSWORD and MAIL_TO):
        raise RuntimeError("SMTP not configured on server.")

    msg = EmailMessage()
    msg["Subject"] = f"[Mentallify Contact] Message from {sender_name}"
    msg["From"] = f"{MAIL_FROM_NAME} <{MAIL_USERNAME}>"
    msg["To"] = MAIL_TO

    plain = f"""You have a new message from the website contact form.

Sender name: {sender_name}
Sender email: {sender_email}

Message:
{message_text}
"""
    html = f"""
    <html>
      <body>
        <h2>New website contact message</h2>
        <p><strong>From:</strong> {sender_name} &lt;{sender_email}&gt;</p>
        <p><strong>Message:</strong></p>
        <div style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:10px;">{message_text}</div>
      </body>
    </html>
    """

    msg.set_content(plain)
    msg.add_alternative(html, subtype='html')

    with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=15) as server:
        server.ehlo()
        if MAIL_PORT in (587,):
            server.starttls()
            server.ehlo()
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.send_message(msg)

# -----------------------------
# API endpoints (ML / Quiz / Chat)
# -----------------------------
@app.route('/chat', methods=['POST'])
def chat():
    body = request.get_json(silent=True) or {}
    message = (body.get('message') or "").strip()
    if not message:
        return jsonify({'reply': 'Please enter a message.'}), 400

    try:
        if tfidf is not None and model is not None and label_encoder is not None:
            X = tfidf.transform([message])
            proba = model.predict_proba(X)[0]
            idx = int(proba.argmax())
            label = label_encoder.inverse_transform([idx])[0] if hasattr(label_encoder, 'inverse_transform') else str(model.classes_[idx])
            reply = f"I detect text patterns most associated with {label} (informational only)."
            return jsonify({'reply': reply, 'label': label, 'probs': proba.tolist()})
    except Exception as e:
        print("[ml] inference failed:", e)
        traceback.print_exc()

    reply = keyword_fallback(message)
    return jsonify({'reply': reply, 'label': 'fallback', 'probs': []})

@app.route('/quiz_questions', methods=['GET'])
def quiz_questions():
    try:
        n = int(request.args.get('n', '12'))
    except:
        n = 12
    questions = SYMPTOM_BANK.get('questions', [])
    if not questions:
        questions = [
            {"text":"Have you been feeling sad or down recently?","symptom_key":"feeling sad"},
            {"text":"Have you lost interest in activities you usually enjoy?","symptom_key":"loss of interest"},
            {"text":"Have you been feeling unusually worried or anxious?","symptom_key":"excessive worry"},
            {"text":"Are you having trouble sleeping, or sleeping much more?","symptom_key":"insomnia or hypersomnia"},
            {"text":"Have you experienced panic attacks?","symptom_key":"panic attacks"}
        ]
    import random
    random.shuffle(questions)
    return jsonify({"questions": questions[:n]})

@app.route('/quiz_result', methods=['POST'])
def quiz_result():
    body = request.get_json(silent=True) or {}
    yes_symptoms = body.get('yes_symptoms', []) or []
    diseases = SYMPTOM_BANK.get('diseases', {})
    results = []
    for disease, meta in diseases.items():
        s = meta.get('symptoms', [])
        matched = [si for si in s if si in yes_symptoms]
        score = (len(matched) / len(s)) if s else 0.0
        results.append({
            "disease": disease,
            "score": round(score, 3),
            "matched_symptoms": matched,
            "precautions": meta.get('precautions', '')
        })
    results = sorted(results, key=lambda r: r['score'], reverse=True)
    return jsonify({'results': results})

# -----------------------------
# Contact page + send_contact
# -----------------------------
@app.route('/contact', methods=['GET'])
def contact_page():
    contact_path = os.path.join(FRONTEND_ROOT, 'contact.html')
    if not os.path.exists(contact_path):
        return "contact.html not found on server", 500
    try:
        with open(contact_path, 'r', encoding='utf-8') as f:
            html = f.read()
        html = html.replace("{{ site_contact_email }}", SITE_CONTACT_EMAIL)
        return Response(html, mimetype='text/html')
    except Exception as e:
        print("[contact_page] failed to read contact.html:", e)
        traceback.print_exc()
        return "Failed to render contact page", 500

@app.route('/send_contact', methods=['POST'])
def send_contact():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or "").strip()
        email = (data.get('email') or "").strip()
        message_text = (data.get('message') or "").strip()

        if not (name and email and message_text):
            return jsonify({"ok": False, "error": "Please provide name, email and message."}), 400

        # backup to data/messages.csv
        try:
            backup_dir = os.path.join(FRONTEND_ROOT, 'data')
            os.makedirs(backup_dir, exist_ok=True)
            backup_file = os.path.join(backup_dir, 'messages.csv')
            with open(backup_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([int(time.time()), name, email, message_text])
        except Exception as e:
            print("[send_contact] backup failed:", e)

        # send email
        try:
            send_contact_email(name, email, message_text)
        except Exception as send_err:
            print("[send_contact] failed to send email:", send_err)
            traceback.print_exc()
            return jsonify({"ok": False, "error": "Failed to send email. Check server logs."}), 500

        return jsonify({"ok": True, "message": "Message sent. We'll get back to you soon."})
    except Exception as e:
        print("[send_contact] unexpected error:", e)
        traceback.print_exc()
        return jsonify({"ok": False, "error": "Server error"}), 500

# -----------------------------
# Google OAuth routes
# -----------------------------
# NOTE: frontend should open /auth/google (to get auth_url) in a popup, or call it to get the URL.
@app.route('/auth/google', methods=['GET'])
def auth_google_start():
    """
    Builds the Google OAuth2 authorization URL and returns it as JSON.
    Frontend should open the returned URL in a popup window.
    """
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and OAUTH_SECRET_KEY):
        return jsonify({"error": "OAuth not configured on server. Check environment variables."}), 500

    # Choose redirect URI matching Google Cloud Console config
    # Use exact origin + path you added to Google Console
    redirect_uri = request.args.get('redirect_uri') or "http://localhost:5000/auth/google/callback"

    scope = "openid email profile"
    auth_base = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent"
    }
    # build query
    from urllib.parse import urlencode
    auth_url = f"{auth_base}?{urlencode(params)}"
    return jsonify({"auth_url": auth_url})

@app.route('/auth/google/callback', methods=['GET'])
def auth_google_callback():
    """
    Google redirects to this URL with ?code=... . Exchange code for tokens, fetch userinfo,
    then send a small HTML page that posts a message to the opener window and closes.
    """
    code = request.args.get('code')
    if not code:
        return "Missing code parameter", 400

    redirect_uri = "http://localhost:5000/auth/google/callback"

    # 1) Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    try:
        token_r = requests.post(token_url, data=token_data, timeout=10)
        token_r.raise_for_status()
        token_json = token_r.json()
    except Exception as e:
        print("[auth] token exchange failed:", e, getattr(e, "response", None))
        return "Token exchange failed", 500

    access_token = token_json.get("access_token")
    if not access_token:
        print("[auth] no access_token in token response:", token_json)
        return "Token exchange didn't return access token", 500

    # 2) Fetch user info
    try:
        userinfo_r = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        userinfo_r.raise_for_status()
        userinfo = userinfo_r.json()
    except Exception as e:
        print("[auth] userinfo fetch failed:", e)
        return "Failed to fetch user info", 500

    # 3) Issue a signed JWT (expires in 7 days)
    if not OAUTH_SECRET_KEY:
        print("[auth] OAUTH_SECRET_KEY not set in environment")
        return "Server not configured for sessions", 500

    payload = {
        "email": userinfo.get("email"),
        "name": userinfo.get("name"),
        "picture": userinfo.get("picture"),
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }
    token = jwt.encode(payload, OAUTH_SECRET_KEY, algorithm="HS256")

    # 4) Return a simple HTML that posts token to the opener window and closes the popup
    #    The frontend listens for window.postMessage(...) to receive token + profile.
    safe_name = (userinfo.get("name") or "").replace('"', '\\"')
    safe_email = (userinfo.get("email") or "").replace('"', '\\"')
    safe_picture = (userinfo.get("picture") or "").replace('"', '\\"')

    html = f"""
    <!doctype html>
    <html>
      <head><meta charset="utf-8"/></head>
      <body>
        <script>
          try {{
            const payload = {{
              token: "{token}",
              name: "{safe_name}",
              email: "{safe_email}",
              picture: "{safe_picture}"
            }};
            // post to opener (parent). The opener should listen for message events.
            if (window.opener && !window.opener.closed) {{
              window.opener.postMessage(payload, "*");
            }}
          }} catch (e) {{
            console.error("postMessage failed", e);
          }} finally {{
            // close popup
            window.close();
          }}
        </script>
        <p>Signing you in...</p>
      </body>
    </html>
    """
    return Response(html, mimetype='text/html')

# -----------------------------
# Serve model JSON files
# -----------------------------
@app.route('/models/<path:filename>')
def models_static(filename):
    return send_from_directory(MODELS_DIR, filename)

# -----------------------------
# Serve frontend files (repo root) - keep last
# -----------------------------
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    safe_path = path or 'front.html'
    requested_full = os.path.normpath(os.path.join(FRONTEND_ROOT, safe_path))
    if not requested_full.startswith(FRONTEND_ROOT):
        return "Invalid path", 400
    if os.path.exists(requested_full) and os.path.isfile(requested_full):
        rel = os.path.relpath(requested_full, FRONTEND_ROOT)
        return send_from_directory(FRONTEND_ROOT, rel)
    front_file = os.path.join(FRONTEND_ROOT, 'front.html')
    index_file = os.path.join(FRONTEND_ROOT, 'index.html')
    if os.path.exists(front_file):
        return send_from_directory(FRONTEND_ROOT, 'front.html')
    if os.path.exists(index_file):
        return send_from_directory(FRONTEND_ROOT, 'index.html')
    return "front.html/index.html not found on server", 500

# -----------------------------
# Run server
# -----------------------------
if __name__ == '__main__':
    print(f"FRONTEND_ROOT = {FRONTEND_ROOT}")
    print("Starting server on 0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
