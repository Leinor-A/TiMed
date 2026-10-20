
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import time

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"

MANIFEST_FILE = DATASET_DIR / "selected_images_manifest.csv"
OUTPUT_DIR = DATASET_DIR / "selected_images"

LAYOUT_TO_DOWNLOAD = "C3PI_Test"


def main():
    if not MANIFEST_FILE.exists():
        print(f"Manifest not found: {MANIFEST_FILE}")
        return

    df = pd.read_csv(MANIFEST_FILE, dtype={"NDC11": str})

    selected = df[
        df["Layout"] == LAYOUT_TO_DOWNLOAD
    ].copy()

    print(f"Images to download: {len(selected)}")

    success = 0
    failed = 0
    skipped = 0

    for index, (_, row) in enumerate(selected.iterrows(), start=1):
        class_name = str(row["Class"])
        image_path = str(row["Image"])
        image_url = str(row["DownloadURL"])

        class_dir = OUTPUT_DIR / class_name
        class_dir.mkdir(parents=True, exist_ok=True)

        # Preserve the source disc folder to avoid filename collisions.
        disc_name = Path(image_path).parts[0]
        filename = Path(image_path).name
        output_file = class_dir / f"{disc_name}_{filename}"

        if output_file.exists() and output_file.stat().st_size > 0:
            skipped += 1
            print(f"[{index}/{len(selected)}] Skipped: {output_file.name}")
            continue

        try:
            request = Request(
                image_url,
                headers={"User-Agent": "TiMed-Academic-Research/1.0"}
            )

            with urlopen(request, timeout=30) as response:
                image_bytes = response.read()

            if not image_bytes:
                raise ValueError("Downloaded file is empty")

            output_file.write_bytes(image_bytes)

            success += 1
            print(f"[{index}/{len(selected)}] Downloaded: {output_file.name}")

        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            failed += 1
            print(f"[{index}/{len(selected)}] FAILED: {image_path}")
            print(f"  Reason: {error}")

        time.sleep(0.2)

    print("\n--- Download Summary ---")
    print(f"Downloaded: {success}")
    print(f"Already existed: {skipped}")
    print(f"Failed: {failed}")
    print(f"Total selected: {len(selected)}")
    print(f"Saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
