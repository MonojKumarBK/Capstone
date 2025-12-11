# Mentallify (adapted to provided index.html)

## Overview
Mentallify is an informational mental health resource with a chat-style assistant and a self-check quiz. This repo includes frontend (index.html), backend Flask API, ML training/export scripts, and minimal browser-model JSONs for offline fallback.

## Local development

### 1. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# (Optional) Place your training CSV at backend/mental_health_dataset_60000_rows.csv.
# Ensure it has columns: 'symptoms' and 'disease'.
python train_model.py   # trains model and writes artifacts

# Export model JSON for browser fallback
python export_model_for_browser.py

# Run the API
python app.py

#c80d3f8f83b927685105bbfc208042fe474fa222d9c60604100f75155cd942c7