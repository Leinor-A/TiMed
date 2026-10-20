
from pathlib import Path
import csv

import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import mobilenet_v3_small

BASE_DIR = Path(__file__).resolve().parent
TEST_DIR = BASE_DIR / "dataset" / "model_dataset" / "test"
MODEL_PATH = BASE_DIR / "models" / "timed_mobilenetv3_best.pth"
OUTPUT_DIR = BASE_DIR / "models"

BATCH_SIZE = 8


def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    if not TEST_DIR.exists():
        raise FileNotFoundError(f"Test dataset not found: {TEST_DIR}")

    device = torch.device("cpu")

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=device,
        weights_only=True,
    )

    classes = checkpoint["classes"]
    image_size = checkpoint["image_size"]

    transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(image_size),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])

    test_dataset = datasets.ImageFolder(
        TEST_DIR,
        transform=transform,
    )

    if test_dataset.classes != classes:
        raise ValueError(
            "Test classes do not match checkpoint classes."
        )

    test_loader = DataLoader(
        test_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )

    model = mobilenet_v3_small(weights=None)

    input_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(
        input_features,
        len(classes),
    )

    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    total_correct = 0
    predictions = []
    actual_labels = []

    print("TiMed Model Evaluation")
    print(f"Device: {device}")
    print(f"Classes: {classes}")
    print(f"Test images: {len(test_dataset)}")
    print("\nEvaluating...\n")

    with torch.inference_mode():
        for images, labels in test_loader:
            images = images.to(device)
            outputs = model(images)

            predicted = outputs.argmax(dim=1)

            total_correct += (
                predicted == labels
            ).sum().item()

            predictions.extend(predicted.cpu().tolist())
            actual_labels.extend(labels.tolist())

    total_images = len(test_dataset)
    accuracy = total_correct / total_images

    print(f"Correct predictions: {total_correct}/{total_images}")
    print(f"Test accuracy: {accuracy:.2%}")

    print("\nPer-class results:")

    for class_index, class_name in enumerate(classes):
        count = sum(
            actual == class_index
            for actual in actual_labels
        )

        correct = sum(
            actual == class_index and predicted == class_index
            for actual, predicted in zip(
                actual_labels, predictions
            )
        )

        print(f"  {class_name}: {correct}/{count} correct")

    print("\nConfusion matrix:")
    print("Rows = actual class; columns = predicted class")

    matrix = [
        [0 for _ in classes]
        for _ in classes
    ]

    for actual, predicted in zip(
        actual_labels, predictions
    ):
        matrix[actual][predicted] += 1

    for class_name, row in zip(classes, matrix):
        print(f"  {class_name}: {row}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    report_path = OUTPUT_DIR / "test_predictions.csv"

    with report_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as file:
        writer = csv.writer(file)
        writer.writerow([
            "filename",
            "actual_class",
            "predicted_class",
            "correct",
        ])

        for (path, _), actual, predicted in zip(
            test_dataset.samples,
            actual_labels,
            predictions,
        ):
            writer.writerow([
                Path(path).name,
                classes[actual],
                classes[predicted],
                actual == predicted,
            ])

    print(f"\nPredictions saved to: {report_path}")
    print("Evaluation complete!")


if __name__ == "__main__":
    main()
