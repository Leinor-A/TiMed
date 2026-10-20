
from pathlib import Path
import math

import pandas as pd
from PIL import Image, ImageOps, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
IMAGE_DIR = DATASET_DIR / "selected_images"
REPORT_DIR = DATASET_DIR / "audit_reports"
OUTPUT_DIR = DATASET_DIR / "inspection"

CSV_FILE = REPORT_DIR / "similar_images.csv"

THUMB_WIDTH = 260
THUMB_HEIGHT = 200
PADDING = 20
LABEL_HEIGHT = 65
PAIR_GAP = 20
PAIRS_PER_PAGE = 6


def load_thumbnail(path):
    background = Image.new(
        "RGB", (THUMB_WIDTH, THUMB_HEIGHT), "#eeeeee"
    )

    try:
        with Image.open(path) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((THUMB_WIDTH, THUMB_HEIGHT))

            x = (THUMB_WIDTH - image.width) // 2
            y = (THUMB_HEIGHT - image.height) // 2

            background.paste(image, (x, y))
    except Exception as error:
        draw = ImageDraw.Draw(background)
        draw.text((10, 10), "IMAGE ERROR", fill="red")
        print(f"Error opening {path}: {error}")

    return background


def main():
    if not CSV_FILE.exists():
        print(f"Missing report: {CSV_FILE}")
        return

    df = pd.read_csv(CSV_FILE)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total = len(df)
    pages = math.ceil(total / PAIRS_PER_PAGE)

    print(f"Reviewing {total} similar-image pairs...")

    for page in range(pages):
        start = page * PAIRS_PER_PAGE
        end = min(start + PAIRS_PER_PAGE, total)
        subset = df.iloc[start:end]

        pair_width = THUMB_WIDTH * 2 + PADDING * 3
        pair_height = THUMB_HEIGHT + LABEL_HEIGHT + PADDING

        sheet = Image.new(
            "RGB",
            (
                pair_width,
                len(subset) * (pair_height + PAIR_GAP) + PADDING
            ),
            "white"
        )

        draw = ImageDraw.Draw(sheet)

        for local_index, (_, row) in enumerate(subset.iterrows()):
            pair_number = start + local_index + 1

            y = PADDING + local_index * (
                pair_height + PAIR_GAP
            )

            path1 = (
                IMAGE_DIR / row["class_1"] / row["image_1"]
            )
            path2 = (
                IMAGE_DIR / row["class_2"] / row["image_2"]
            )

            image1 = load_thumbnail(path1)
            image2 = load_thumbnail(path2)

            x1 = PADDING
            x2 = THUMB_WIDTH + PADDING * 2

            sheet.paste(image1, (x1, y + 30))
            sheet.paste(image2, (x2, y + 30))

            distance = int(row["phash_distance"])

            draw.text(
                (x1, y),
                f"Pair {pair_number} | pHash distance: {distance}",
                fill="black"
            )

            draw.text(
                (x1, y + THUMB_HEIGHT + 35),
                str(row["class_1"]),
                fill="black"
            )

            draw.text(
                (x2, y + THUMB_HEIGHT + 35),
                str(row["class_2"]),
                fill="black"
            )

            if row["class_1"] != row["class_2"]:
                draw.text(
                    (x1, y + THUMB_HEIGHT + 52),
                    "CROSS-CLASS PAIR",
                    fill="red"
                )

        output_path = (
            OUTPUT_DIR / f"similar_pairs_page_{page + 1}.jpg"
        )

        sheet.save(output_path, quality=90)
        print(f"Saved: {output_path}")

    print("\nVisual comparison sheets generated successfully.")


if __name__ == "__main__":
    main()
