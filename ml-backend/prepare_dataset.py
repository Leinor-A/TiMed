
from pathlib import Path
from urllib.parse import quote

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"

METADATA_FILE = DATASET_DIR / "directory_consumer_grade_images.xlsx"
OUTPUT_FILE = DATASET_DIR / "selected_images_manifest.csv"

BASE_URL = "https://data.lhncbc.nlm.nih.gov/public/Pills/"

PILL_CLASSES = {
    "00093226801": "Amoxicillin_250mg",
    "00093213101": "Nitrofurantoin_100mg",
    "00555032402": "Hydroxyzine_100mg",
}

def normalize_ndc(value):
    return str(value).strip().replace("-", "").zfill(11)

def main():
    if not METADATA_FILE.exists():
        print(f"Metadata file not found: {METADATA_FILE}")
        return

    print("Reading consumer-grade metadata...")

    df = pd.read_excel(
        METADATA_FILE,
        dtype={"NDC11": str}
    )

    df.columns = df.columns.str.strip()

    required_columns = {"NDC11", "Image", "Layout"}

    if not required_columns.issubset(df.columns):
        print("Missing required columns.")
        print("Available columns:", list(df.columns))
        return

    df["NDC11"] = df["NDC11"].apply(normalize_ndc)

    selected = df[
        df["NDC11"].isin(PILL_CLASSES.keys())
    ].copy()

    selected["Image"] = selected["Image"].astype(str).str.strip()

    selected = selected[
        selected["Image"].str.lower().str.endswith(
            (".jpg", ".jpeg", ".png")
        )
    ].copy()

    selected["Class"] = selected["NDC11"].map(PILL_CLASSES)

    selected["DownloadURL"] = selected["Image"].apply(
        lambda path: BASE_URL + quote(path, safe="/")
    )

    selected = selected.drop_duplicates(
        subset=["NDC11", "Image"]
    )

    selected.to_csv(OUTPUT_FILE, index=False)

    print("\nSelected image records:\n")

    for ndc, class_name in PILL_CLASSES.items():
        class_rows = selected[selected["NDC11"] == ndc]

        print(f"{class_name}: {len(class_rows)} images")

        if not class_rows.empty:
            print(class_rows["Layout"].value_counts().to_string())

        print()

    print(f"Manifest saved to: {OUTPUT_FILE}")
    print("\nNo images have been downloaded.")

if __name__ == "__main__":
    main()
