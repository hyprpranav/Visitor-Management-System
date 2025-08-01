# Visitor Management System (VMS)
A simple, modern web-based Visitor Management System built with Flask.

## Features
- Visitor check-in and check-out
- Pre-registration workflow (admin approval required)
- Admin dashboard with notifications
- Visitor history and analytics
- Mobile-friendly, responsive UI
- Frontend and backend validation
- Export logs and generate QR codes

## Getting Started

### Prerequisites
- Python 3.8+
- pip

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/hyprpranav/Visitor-Management-System.git
   cd Visitor-Management-System
   ```
2. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
3. Run the app:
   ```sh
   python app.py
   ```
4. Open your browser and go to `http://localhost:5000`

## Folder Structure
```
app.py                # Main Flask app
requirements.txt      # Python dependencies
visitors.db           # SQLite database
static/               # JS, CSS, and assets
  script.js
  style.css
  ...
templates/            # HTML templates
  index.html
  preregister.html
```

## Usage
- Visitors can check in/out via the dashboard.
- Admins can approve pre-registrations, view logs, and export data.
- Mobile-first toggle available in the header for better mobile experience.

## License
MIT

---
Developed by Harish Pranav
