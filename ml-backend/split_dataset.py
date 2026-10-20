
from pathlib import Path
from collections import defaultdict
import csv
import random
import shutil

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
SOURCE_DIR = DATASET_DIR / "selected_images"
OUTPUT_DIR = DATASET_DIR / "model_dataset"
AUDIT_FILE = DATASET_DIR / "audit_reports" / "image_audit.csv"
SIMILAR_FILE = DATASET_DIR / "audit_reports" / "similar_images.csv"

CLASSES = [
    "Amoxicillin_250mg",
    "Hydroxyzine_100mg",
]

RANDOM_SEED = 42


class UnionFind:
    def __init__(self, items):
        self.parent = {item: item for item in items}

    def find(self, item):
        if self.parent[item] != item:
            self.parent[item] = self.find(self.parent[item])
        return self.parent[item]

    def union(self, a, b):
        root_a = self.find(a)
        root_b = self.find(b)

        if root_a != root_b:
            self.parent[root_b] = root_a


def main():
    if not AUDIT_FILE.exists() or not SIMILAR_FILE.exists():
        print("Missing audit reports. Run audit_dataset.py first.")
        return

    audit = pd.read_csv(AUDIT_FILE)
    similar = pd.read_csv(SIMILAR_FILE)

    audit = audit[
        (audit["class"].isin(CLASSES))
        & (audit["status"] == "valid")
    ].copy()

    if audit.empty:
        print("No valid images found.")
        return

    keys = [
        (row["class"], row["filename"])
        for _, row in audit.iterrows()
    ]

    uf = UnionFind(keys)

    # Group perceptually similar images within the same class.
    for _, row in similar.iterrows():
        if row["class_1"] != row["class_2"]:
            continue

        if row["class_1"] not in CLASSES:
            continue

        first = (row["class_1"], row["image_1"])
        second = (row["class_2"], row["image_2"])

        if first in uf.parent and second in uf.parent:
            uf.union(first, second)

    grouped = defaultdict(list)

    for key in keys:
        root = uf.find(key)
        grouped[(key[0], root)].append(key)

    rng = random.Random(RANDOM_SEED)
    assignments = []

    for class_name in CLASSES:
        class_groups = [
            group
            for (group_class, _), group in grouped.items()
            if group_class == class_name
        ]

        rng.shuffle(class_groups)
        class_groups.sort(key=len, reverse=True)

        total_images = sum(len(group) for group in class_groups)

        targets = {
            "train": total_images * 0.70,
            "val": total_images * 0.15,
            "test": total_images * 0.15,
        }

        counts = {"train": 0, "val": 0, "test": 0}

        for group in class_groups:
            # Assign the group to the partition with the
            # largest remaining proportion of its target.
            split = max(
                counts,
                key=lambda name: (
                    targets[name] - counts[name]
                ) / targets[name]
            )

            for item in group:
                assignments.append({
                    "split": split,
                    "class": item[0],
                    "filename": item[1],
                    "group_id": (
                        f"{class_name}_"
                        f"{len(assignments):04d}"
                    ),
                })

            counts[split] += len(group)

        print(f"\n{class_name}")
        print(f"  Train: {counts['train']}")
        print(f"  Validation: {counts['val']}")
        print(f"  Test: {counts['test']}")

    if OUTPUT_DIR.exists():
        print(f"\nOutput folder already exists: {OUTPUT_DIR}")
        print("Please rename or remove it before rerunning.")
        return

    OUTPUT_DIR.mkdir(parents=True)

    for row in assignments:
        source = SOURCE_DIR / row["class"] / row["filename"]
        destination = (
            OUTPUT_DIR / row["split"]
            / row["class"] / row["filename"]
        )

        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    manifest_file = OUTPUT_DIR / "split_manifest.csv"

    with manifest_file.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "split", "class", "filename", "group_id"
            ]
        )
        writer.writeheader()
        writer.writerows(assignments)

    print("\nDataset split completed!")
    print(f"Total images: {len(assignments)}")
    print(f"Saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
