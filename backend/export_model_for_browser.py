# backend/export_model_for_browser.py
import os, json, joblib
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
TFIDF_PATH = os.path.join(BASE, 'tfidf_vectorizer.pkl')
MODEL_PATH = os.path.join(BASE, 'mental_health_model.pkl')
LE_PATH = os.path.join(BASE, 'label_encoder.pkl')

OUT_DIR = os.path.join(BASE, '..', 'models')
os.makedirs(OUT_DIR, exist_ok=True)

def to_py(x):
    if hasattr(x, 'tolist'):
        return x.tolist()
    return x

def main():
    tfidf = joblib.load(TFIDF_PATH)
    model = joblib.load(MODEL_PATH)
    le = joblib.load(LE_PATH)

    vocab = {k:int(v) for k,v in tfidf.vocabulary_.items()}
    idf = to_py(getattr(tfidf, 'idf_', None))
    coefs = to_py(getattr(model, 'coef_', None))
    intercept = to_py(getattr(model, 'intercept_', None))
    classes = list(le.classes_)

    out = {
        'classes': classes,
        'vocab': vocab,
        'idf': idf,
        'coefs': coefs,
        'intercept': intercept
    }

    with open(os.path.join(OUT_DIR, 'web_model.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)

    with open(os.path.join(OUT_DIR, 'vocab.json'), 'w', encoding='utf-8') as f:
        json.dump(vocab, f)

    print("Exported web_model.json and vocab.json to", OUT_DIR)

if __name__ == '__main__':
    main()
