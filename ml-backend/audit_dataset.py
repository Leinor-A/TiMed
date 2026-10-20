
from pathlib import Path
from collections import defaultdict
from hashlib import sha256
import csv

from PIL import Image, ImageOps, ImageStat
import imagehash

BASE_DIR = Path(__file__).resolve().parent
IMAGE_DIR = BASE_DIR / "dataset" / "selected_images"
REPORT_DIR = BASE_DIR / "dataset" / "audit_reports"

CLASSES = [
    "Amoxicillin_250mg",
    "Nitrofurantoin_100mg",
    "Hydroxyzine_100mg",
]

SIMILARITY_THRESHOLD = 6


def collect_images():
    records = []

    for class_name in CLASSES:
        class_dir = IMAGE_DIR / class_name

        if not class_dir.exists():
            print(f"Missing class folder: {class_dir}")
            continue

        for path in sorted(class_dir.iterdir()):
            if not path.is_file():
                continue

            if path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue

            record = {
                "class": class_name,
                "filename": path.name,
                "path": str(path),
                "status": "valid",
                "width": "",
                "height": "",
                "file_size_kb": "",
                "brightness": "",
                "contrast": "",
                "sha256": "",
                "phash": "",
                "review_reason": "",
            }

            try:
                with Image.open(path) as original:
                    image = ImageOps.exif_transpose(
                        original
                    ).convert("RGB")

                grayscale = image.convert("L")
                stats = ImageStat.Stat(grayscale)

                record["width"] = image.width
                record["height"] = image.height
                record["file_size_kb"] = round(
                    path.stat().st_size / 1024, 2
                )
                record["brightness"] = round(stats.mean[0], 2)
                record["contrast"] = round(stats.stddev[0], 2)
                record["sha256"] = sha256(
                    path.read_bytes()
                ).hexdigest()
                record["phash"] = str(imagehash.phash(image))

                reasons = []

                if min(image.size) < 224:
                    reasons.append("low_resolution")

                if stats.stddev[0] < 20:
                    reasons.append("low_contrast")

                if class_name == "Nitrofurantoin_100mg":
                    reasons.append("class_label_needs_review")

                record["review_reason"] = ";".join(reasons)

            except Exception as error:
                record["status"] = "invalid"
                record["review_reason"] = str(error)

            records.append(record)

    return records


def write_csv(filename, fieldnames, rows):
    output = REPORT_DIR / filename

    with output.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(
            file, fieldnames=fieldnames
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved: {output}")


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    print("Auditing TiMed dataset...\n")

    records = collect_images()

    fields = [
        "class",
        "filename",
        "path",
        "status",
        "width",
        "height",
        "file_size_kb",
        "brightness",
        "contrast",
        "sha256",
        "phash",
        "review_reason",
    ]

    write_csv("image_audit.csv", fields, records)

    valid = [
        record for record in records
        if record["status"] == "valid"
    ]

    duplicates = []
    similar_pairs = []

    hash_groups = defaultdict(list)

    for record in valid:
        hash_groups[record["sha256"]].append(record)

    for group in hash_groups.values():
        if len(group) > 1:
            for record in group:
                duplicates.append({
                    "class": record["class"],
                    "filename": record["filename"],
                    "sha256": record["sha256"],
                })

    for i in range(len(valid)):
        first = valid[i]
        first_hash = imagehash.hex_to_hash(
            first["phash"]
        )

        for j in range(i + 1, len(valid)):
            second = valid[j]
            second_hash = imagehash.hex_to_hash(
                second["phash"]
            )

            distance = first_hash - second_hash

            if distance <= SIMILARITY_THRESHOLD:
                similar_pairs.append({
                    "class_1": first["class"],
                    "image_1": first["filename"],
                    "class_2": second["class"],
                    "image_2": second["filename"],
                    "phash_distance": distance,
                })

    write_csv(
        "exact_duplicates.csv",
        ["class", "filename", "sha256"],
        duplicates,
    )

    write_csv(
        "similar_images.csv",
        [
            "class_1",
            "image_1",
            "class_2",
            "image_2",
            "phash_distance",
        ],
        similar_pairs,
    )

    flagged = [
        record for record in records
        if record["review_reason"]
    ]

    write_csv(
        "images_for_review.csv",
        fields,
        flagged,
    )

    print("\n--- Audit Summary ---")
    print(f"Total images: {len(records)}")
    print(f"Valid images: {len(valid)}")
    print(f"Invalid images: {len(records) - len(valid)}")
    print(f"Exact duplicate entries: {len(duplicates)}")
    print(f"Potentially similar pairs: {len(similar_pairs)}")
    print(f"Images flagged for review: {len(flagged)}")

    for class_name in CLASSES:
        count = sum(
            record["class"] == class_name
            for record in valid
        )
        print(f"{class_name}: {count}")

    print("\nAudit complete. Original images unchanged.")


if __name__ == "__main__":
    main()
