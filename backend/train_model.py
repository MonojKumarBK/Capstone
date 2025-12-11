# backend/train_model.py
import os, joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE, 'mental_health_dataset_60000_rows.csv')
TFIDF_PATH = os.path.join(BASE, 'tfidf_vectorizer.pkl')
MODEL_PATH = os.path.join(BASE, 'mental_health_model.pkl')
LE_PATH = os.path.join(BASE, 'label_encoder.pkl')
REPORTS_DIR = os.path.join(BASE, 'reports')
os.makedirs(REPORTS_DIR, exist_ok=True)

def load_csv(path):
    df = pd.read_csv(path)
    # Ensure explicit mapping
    if 'symptoms' not in df.columns or 'disease' not in df.columns:
        # try to remap common alternate names:
        if 'text' in df.columns and 'label' in df.columns:
            df = df.rename(columns={'text':'symptoms','label':'disease'})
        else:
            raise ValueError("CSV must have 'symptoms' and 'disease' columns.")
    df = df[['symptoms','disease']].dropna()
    return df

def main():
    df = load_csv(CSV_PATH)
    X_text = df['symptoms'].astype(str).values
    y = df['disease'].astype(str).values

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    tfidf = TfidfVectorizer(stop_words='english', max_features=20000, sublinear_tf=True, ngram_range=(1,2))
    X = tfidf.fit_transform(X_text)

    X_train, X_test, y_train, y_test = train_test_split(X, y_enc, test_size=0.2, stratify=y_enc, random_state=42)

    clf = LogisticRegression(max_iter=300, multi_class='ovr')
    clf.fit(X_train, y_train)

    preds = clf.predict(X_test)
    acc = accuracy_score(y_test, preds)
    report = classification_report(y_test, preds, target_names=le.classes_)

    joblib.dump(tfidf, TFIDF_PATH)
    joblib.dump(clf, MODEL_PATH)
    joblib.dump(le, LE_PATH)

    with open(os.path.join(REPORTS_DIR, 'training_report.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Accuracy: {acc}\n\n{report}')

    # sample preds
    sample_texts = X_text[:100]
    sample_preds = le.inverse_transform(clf.predict(tfidf.transform(sample_texts)))
    pd.DataFrame({'text': sample_texts, 'pred': sample_preds}).to_csv(os.path.join(REPORTS_DIR, 'sample_predictions.csv'), index=False)

    print("Training finished. Artifacts saved.")

if __name__ == '__main__':
    main()
