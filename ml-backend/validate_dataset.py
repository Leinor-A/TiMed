
from pathlib import Path
from collections import defaultdict
from hashlib import sha256

from PIL import Image, UnidentifiedImageError

BASE_DIR = Path(__file__).resolve().parent
IMAGE_DIR = BASE_DIR / "dataset" / "selected_images"

CLASSES = [
    "Amoxicillin_250mg",
    "Nitrofurantoin_100mg",
    "Hydroxyzine_100mg",
]


def main():
    total_valid = 0
    total_invalid = 0
    hashes = defaultdict(list)

    print("Validating TiMed images...\n")

    for class_name in CLASSES:
        class_dir = IMAGE_DIR / class_name

        if not class_dir.exists():
            print(f"Missing folder: {class_dir}")
            continue

        valid = 0
        invalid = 0

        for image_path in sorted(class_dir.iterdir()):
            if not image_path.is_file():
                continue

            try:
                with Image.open(image_path) as image:
                    image.verify()

                with Image.open(image_path) as image:
                    width, height = image.size

                    if width <= 0 or height <= 0:
                        raise ValueError("Invalid image dimensions")

                file_hash = sha256(image_path.read_bytes()).hexdigest()
                hashes[file_hash].append(image_path)

                valid += 1

            except (UnidentifiedImageError, OSError, ValueError) as error:
                invalid += 1
                print(f"INVALID: {image_path.name} — {error}")

        total_valid += valid
        total_invalid += invalid

        print(f"{class_name}:")
        print(f"  Valid images: {valid}")
        print(f"  Invalid images: {invalid}\n")

    duplicate_groups = [
        paths for paths in hashes.values()
        if len(paths) > 1
    ]

    print("--- Validation Summary ---")
    print(f"Total valid images: {total_valid}")
    print(f"Total invalid images: {total_invalid}")
    print(f"Exact duplicate groups: {len(duplicate_groups)}")

    for group in duplicate_groups:
        print("\nDuplicate group:")
        for path in group:
            print(f"  {path.parent.name}/{path.name}")

    print("\nValidation complete. No files were modified.")


if __name__ == "__main__":
    main()
