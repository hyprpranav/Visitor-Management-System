import os
import logging
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import sqlite3
import qrcode
import io
import csv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pydantic import BaseModel, Field, EmailStr, ValidationError
from datetime import datetime, timedelta
from typing import Dict, Optional

# Configure logging
logging.basicConfig(level=logging.DEBUG, filename='app.log', format='%(asctime)s %(levelname)s: %(message)s')

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

DB_PATH = "visitors.db"

# Pydantic Models
class Visitor(BaseModel):
    name: str = Field(..., min_length=1)
    contact: str = Field(..., min_length=10, max_length=10, pattern=r'^\d{10}$')
    email: str = ""
    company: str = ""
    purpose: str = Field(..., min_length=1)
    nda_signed: bool = False
    photo: str = "placeholder.png"
    entry_method: str = "manual"
    liveness_check: str = "N/A"

class Feedback(BaseModel):
    type: str = Field(..., pattern="^(help|report|suggest)$")
    name: str = ""
    email: EmailStr = ""
    message: str = Field(..., min_length=1)

# Database Initialization
def init_db():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('''
                CREATE TABLE IF NOT EXISTS visitors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    contact TEXT,
                    email TEXT,
                    company TEXT,
                    purpose TEXT,
                    nda_signed BOOLEAN,
                    photo TEXT,
                    entry_method TEXT,
                    liveness_check TEXT,
                    checkin_time TEXT,
                    checkout_time TEXT,
                    status TEXT
                )
            ''')
            c.execute('''
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT,
                    name TEXT,
                    email TEXT,
                    message TEXT,
                    timestamp TEXT
                )
            ''')
            c.execute('''
                CREATE TABLE IF NOT EXISTS preregistrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    contact TEXT,
                    email TEXT,
                    company TEXT,
                    purpose TEXT,
                    nda_signed BOOLEAN,
                    visit_date TEXT,
                    visit_time TEXT,
                    status TEXT DEFAULT 'pending',
                    submitted_at TEXT
                )
            ''')
            conn.commit()
            app.logger.info("Database initialized successfully")
    except sqlite3.Error as e:
        app.logger.error(f"Database initialization failed: {str(e)}")
        raise

# Utility Functions
def get_current_time():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def is_overstay(checkin_time: str, status: str) -> bool:
    if status != "Checked In":
        return False
    checkin_dt = datetime.strptime(checkin_time, '%Y-%m-%d %H:%M:%S')
    time_limit = timedelta(hours=2)
    return datetime.now() - checkin_dt > time_limit

def send_email(subject: str, body: str):
    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    SENDER_EMAIL = "harishspranav2006@gmail.com"  # Use environment variables in production
    SENDER_PASSWORD = "your_app_password"  # Replace with Gmail App Password
    RECIPIENT_EMAIL = "harishspranav2006@gmail.com"
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = RECIPIENT_EMAIL
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        app.logger.info("Email sent successfully")
    except Exception as e:
        app.logger.error(f"Email sending failed: {str(e)}")
        raise

def export_visitors_to_csv():
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_path = f"static/visitor_logs_{timestamp}.csv"
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('SELECT * FROM visitors')
            rows = c.fetchall()
            headers = ["ID", "Name", "Contact", "Email", "Company", "Purpose", "NDA Signed", "Photo", "Entry Method", 
                       "Liveness Check", "Check-In Time", "Check-Out Time", "Status"]
            with open(file_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(rows)
        app.logger.info(f"Visitor logs exported to {file_path}")
        return file_path
    except sqlite3.Error as e:
        app.logger.error(f"Export failed: {str(e)}")
        raise

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/preregister')
def preregister():
    return render_template('preregister.html')

@app.route('/api/checkin', methods=['POST'])
def checkin():
    try:
        data_dict = dict(request.json)
        if 'company' not in data_dict:
            data_dict['company'] = ""
        data = Visitor(**data_dict)
    except ValidationError as e:
        app.logger.error(f"Validation failed: {str(e)}")
        return jsonify({"error": f"Validation failed: {str(e)}"}), 400
    except ValueError as e:
        app.logger.error(f"Invalid JSON: {str(e)}")
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    except Exception as e:
        app.logger.error(f"Server error: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('''
                INSERT INTO visitors (name, contact, email, company, purpose, nda_signed, photo, entry_method, liveness_check, checkin_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.name, data.contact, data.email, data.company, data.purpose, data.nda_signed,
                data.photo, data.entry_method, data.liveness_check, get_current_time(), "Checked In"
            ))
            visitor_id = c.lastrowid
            conn.commit()
        app.logger.info(f"Visitor {data.name} checked in successfully")
        return jsonify({
            "message": "Visitor checked in successfully!",
            "visitor": {"id": visitor_id, **data.dict(), "checkin_time": get_current_time(), "status": "Checked In"}
        })
    except sqlite3.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/checkout', methods=['POST'])
def checkout():
    contact = request.json.get("contact")
    if not contact:
        app.logger.error("Contact number missing in checkout request")
        return jsonify({"error": "Contact number is required"}), 400
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('SELECT * FROM visitors WHERE contact = ? AND status = ?', (contact, 'Checked In'))
            visitor = c.fetchone()
            if not visitor:
                app.logger.error(f"Visitor with contact {contact} not found or already checked out")
                return jsonify({"error": "Visitor not found or already checked out"}), 404
            c.execute('UPDATE visitors SET checkout_time = ?, status = ? WHERE id = ?', 
                     (get_current_time(), 'Checked Out', visitor[0]))
            conn.commit()
            visitor_dict = {
                "id": visitor[0], "name": visitor[1], "contact": visitor[2], "email": visitor[3], "company": visitor[4], 
                "purpose": visitor[5], "nda_signed": visitor[6], "photo": visitor[7], "entry_method": visitor[8],
                "liveness_check": visitor[9], "checkin_time": visitor[10], "checkout_time": get_current_time(),
                "status": "Checked Out"
            }
            app.logger.info(f"Visitor {visitor[1]} checked out successfully")
            return jsonify({"message": "Visitor checked out successfully!", "visitor": visitor_dict})
    except sqlite3.Error as e:
        app.logger.error(f"Database error during checkout: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/history', methods=['GET'])
def history():
    search = request.args.get('search', '')
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            query = 'SELECT * FROM visitors WHERE name LIKE ? OR contact LIKE ?'
            c.execute(query, (f'%{search}%', f'%{search}%'))
            visitors = [{
                "id": v[0], "name": v[1], "contact": v[2], "email": v[3], "company": v[4], "purpose": v[5],
                "nda_signed": v[6], "photo": v[7], "entry_method": v[8],
                "liveness_check": v[9], "checkin_time": v[10], "checkout_time": v[11],
                "status": v[12], "overstay": is_overstay(v[10], v[12])
            } for v in c.fetchall()]
        if not visitors and search:
            app.logger.info(f"No visitors found for search: {search}")
            return jsonify({"error": "No visitors found matching the search criteria"}), 404
        app.logger.info("Visitor history fetched successfully")
        return jsonify({"visitors": visitors})
    except sqlite3.Error as e:
        app.logger.error(f"Database error fetching history: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/stats', methods=['GET'])
def stats():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM visitors WHERE status = 'Checked In'")
            checked_in = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM visitors WHERE status = 'Checked Out'")
            checked_out = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM visitors")
            total = c.fetchone()[0]
        app.logger.info("Stats fetched successfully")
        return jsonify({"checked_in": checked_in, "checked_out": checked_out, "total": total})
    except sqlite3.Error as e:
        app.logger.error(f"Database error fetching stats: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/feedback', methods=['POST'])
def feedback():
    try:
        data = Feedback(**request.json)
    except ValidationError as e:
        app.logger.error(f"Feedback validation failed: {str(e)}")
        return jsonify({"error": f"Validation failed: {str(e)}"}), 400
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('''
                INSERT INTO feedback (type, name, email, message, timestamp)
                VALUES (?, ?, ?, ?, ?)
            ''', (data.type, data.name, data.email, data.message, get_current_time()))
            conn.commit()
        subject = f"New Feedback: {data.type.capitalize()}"
        body = f"Type: {data.type}\nName: {data.name or 'Anonymous'}\nEmail: {data.email or 'N/A'}\nMessage: {data.message}\nTimestamp: {get_current_time()}"
        send_email(subject, body)
        app.logger.info("Feedback submitted successfully")
        return jsonify({"message": "Feedback submitted successfully!"})
    except sqlite3.Error as e:
        app.logger.error(f"Database error saving feedback: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Feedback email failed: {str(e)}")
        return jsonify({"error": f"Feedback saved, but email failed: {str(e)}"}), 500

@app.route('/api/generate-qr', methods=['POST'])
def generate_qr():
    contact = request.json.get("contact")
    if not contact:
        app.logger.error("Contact missing in QR code request")
        return jsonify({"error": "Contact is required"}), 400
    pre_reg_url = f"http://localhost:5000/preregister?contact={contact}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(pre_reg_url)
    qr.make(fit=True)
    img = qr.make_image(fill='black', back_color='white')
    img_io = io.BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    app.logger.info(f"QR code generated for contact: {contact}")
    return send_file(img_io, mimetype='image/png')

@app.route('/api/export', methods=['GET'])
def export_logs():
    try:
        file_path = export_visitors_to_csv()
        return send_file(file_path, as_attachment=True, download_name='visitor_logs.csv')
    except Exception as e:
        app.logger.error(f"Export logs failed: {str(e)}")
        return jsonify({"error": f"Export failed: {str(e)}"}), 500

# API: Pre-registration submission (does NOT check in visitor)
@app.route('/api/preregister', methods=['POST'])
def preregister_api():
    try:
        data = request.json
        # Validate required fields
        if not data.get('name') or not data.get('contact') or not data.get('purpose') or not data.get('visitDate') or not data.get('visitTime'):
            return jsonify({'error': 'Missing required fields: name, contact, purpose, visitDate, visitTime'}), 400
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('''
                INSERT INTO preregistrations (name, contact, email, company, purpose, nda_signed, visit_date, visit_time, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('name'), data.get('contact'), data.get('email', ''), data.get('company', ''),
                data.get('purpose'), data.get('nda_signed', False), data.get('visitDate'), data.get('visitTime'), get_current_time()
            ))
            conn.commit()
        # Send email notification
        subject = "New Pre-Registration Request"
        body = f"""
New Pre-Registration Request:
Name: {data.get('name')}
Contact: {data.get('contact')}
Email: {data.get('email', 'N/A')}
Company: {data.get('company', 'N/A')}
Purpose: {data.get('purpose')}
Visit Date: {data.get('visitDate')}
Visit Time: {data.get('visitTime')}
NDA Signed: {'Yes' if data.get('nda_signed', False) else 'No'}
Submitted At: {get_current_time()}
Please review this request in the admin dashboard.
"""
        send_email(subject, body)
        app.logger.info(f"Pre-registration submitted for {data.get('name')}")
        return jsonify({'message': 'Pre-registration submitted! Await admin approval.'}), 200
    except Exception as e:
        app.logger.error(f"Pre-registration failed: {str(e)}")
        return jsonify({'error': f"Pre-registration failed: {str(e)}"}), 500

# API: List all pending pre-registrations
@app.route('/api/preregistrations', methods=['GET'])
def list_preregistrations():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT id, name, contact, email, company, purpose, nda_signed, visit_date, visit_time, status FROM preregistrations WHERE status = 'pending'")
            rows = c.fetchall()
            preregs = [
                {
                    'id': row[0], 'name': row[1], 'contact': row[2], 'email': row[3], 'company': row[4],
                    'purpose': row[5], 'nda_signed': row[6], 'visitDate': row[7], 'visitTime': row[8], 'status': row[9]
                } for row in rows
            ]
        app.logger.info("Fetched pending pre-registrations")
        return jsonify({'preregistrations': preregs})
    except Exception as e:
        app.logger.error(f"Fetch preregistrations failed: {str(e)}")
        return jsonify({'error': 'Failed to fetch preregistrations.'}), 500

# API: Approve pre-registration (checks in visitor at specified date/time or now if past)
@app.route('/api/preregistrations/<int:prereg_id>/approve', methods=['POST'])
def approve_preregistration(prereg_id):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            # Get preregistration details
            c.execute("SELECT name, contact, email, company, purpose, nda_signed, visit_date, visit_time FROM preregistrations WHERE id = ?", (prereg_id,))
            row = c.fetchone()
            if not row:
                app.logger.error(f"Pre-registration {prereg_id} not found")
                return jsonify({'error': 'Pre-registration not found.'}), 404
            # Parse requested visit date and time
            try:
                visit_datetime_str = f"{row[6]} {row[7]}"
                visit_datetime = datetime.strptime(visit_datetime_str, '%Y-%m-%d %H:%M')
            except ValueError:
                app.logger.error(f"Invalid visit date/time format for preregistration {prereg_id}")
                return jsonify({'error': 'Invalid visit date/time format.'}), 400
            # Use requested time if in the future, else use current time
            checkin_time = visit_datetime.strftime('%Y-%m-%d %H:%M:%S') if visit_datetime > datetime.now() else get_current_time()
            # Insert into visitors as Checked In
            c.execute('''
                INSERT INTO visitors (name, contact, email, company, purpose, nda_signed, photo, entry_method, liveness_check, checkin_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                row[0], row[1], row[2], row[3], row[4], row[5], 'placeholder.png', 'preregistration', 'N/A', checkin_time, 'Checked In'
            ))
            # Mark preregistration as approved
            c.execute("UPDATE preregistrations SET status = 'approved' WHERE id = ?", (prereg_id,))
            conn.commit()
        app.logger.info(f"Pre-registration {prereg_id} approved and visitor checked in at {checkin_time}")
        return jsonify({'message': f"Pre-registration approved and visitor checked in at {checkin_time}."})
    except Exception as e:
        app.logger.error(f"Approve preregistration failed: {str(e)}")
        return jsonify({'error': f"Failed to approve preregistration: {str(e)}"}), 500

# API: Decline pre-registration
@app.route('/api/preregistrations/<int:prereg_id>/decline', methods=['POST'])
def decline_preregistration(prereg_id):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("UPDATE preregistrations SET status = 'declined' WHERE id = ?", (prereg_id,))
            conn.commit()
        app.logger.info(f"Pre-registration {prereg_id} declined")
        return jsonify({'message': 'Pre-registration declined.'})
    except Exception as e:
        app.logger.error(f"Decline preregistration failed: {str(e)}")
        return jsonify({'error': f"Failed to decline preregistration: {str(e)}"}), 500

# Initialize database if it doesn't exist
if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)