
from pathlib import Path
import csv
import json
import random
import copy

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import (
    mobilenet_v3_small,
    MobileNet_V3_Small_Weights,
)

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset" / "model_dataset"
OUTPUT_DIR = BASE_DIR / "models"

SEED = 42
BATCH_SIZE = 8
EPOCHS = 15
LEARNING_RATE = 0.001
IMAGE_SIZE = 224


def set_seed():
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)


def create_dataloaders():
    train_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(
            IMAGE_SIZE,
            scale=(0.8, 1.0),
        ),
        transforms.RandomRotation(15),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])

    eval_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])

    train_dataset = datasets.ImageFolder(
        DATASET_DIR / "train",
        transform=train_transform,
    )

    val_dataset = datasets.ImageFolder(
        DATASET_DIR / "val",
        transform=eval_transform,
    )

    if train_dataset.classes != val_dataset.classes:
        raise ValueError(
            "Training and validation class labels do not match."
        )

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )

    return train_loader, val_loader, train_dataset.classes


def create_model(num_classes):
    weights = MobileNet_V3_Small_Weights.DEFAULT

    model = mobilenet_v3_small(weights=weights)

    for parameter in model.features.parameters():
        parameter.requires_grad = False

    input_features = model.classifier[-1].in_features

    model.classifier[-1] = nn.Linear(
        input_features,
        num_classes,
    )

    return model


def run_epoch(model, loader, criterion, optimizer, device):
    training = optimizer is not None

    if training:
        model.train()
        # Keep frozen feature extractor in evaluation mode.
        model.features.eval()
    else:
        model.eval()

    total_loss = 0.0
    total_correct = 0
    total_samples = 0

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)

        if training:
            optimizer.zero_grad()

        with torch.set_grad_enabled(training):
            outputs = model(images)
            loss = criterion(outputs, labels)

            if training:
                loss.backward()
                optimizer.step()

        predictions = outputs.argmax(dim=1)

        batch_size = labels.size(0)
        total_loss += loss.item() * batch_size
        total_correct += (
            predictions == labels
        ).sum().item()
        total_samples += batch_size

    return (
        total_loss / total_samples,
        total_correct / total_samples,
    )


def main():
    set_seed()

    device = torch.device("cpu")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("TiMed MobileNetV3 Training")
    print(f"Device: {device}")

    train_loader, val_loader, classes = create_dataloaders()

    print(f"Classes: {classes}")
    print(f"Training images: {len(train_loader.dataset)}")
    print(f"Validation images: {len(val_loader.dataset)}")

    print("\nLoading pretrained MobileNetV3-Small...")
    model = create_model(len(classes))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()

    optimizer = torch.optim.Adam(
        filter(
            lambda parameter: parameter.requires_grad,
            model.parameters(),
        ),
        lr=LEARNING_RATE,
    )

    best_accuracy = -1.0
    best_loss = float("inf")
    best_state = None
    history = []

    print("\nStarting training...\n")

    for epoch in range(1, EPOCHS + 1):
        train_loss, train_accuracy = run_epoch(
            model, train_loader, criterion, optimizer, device
        )

        val_loss, val_accuracy = run_epoch(
            model, val_loader, criterion, None, device
        )

        history.append({
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "train_accuracy": round(train_accuracy, 4),
            "val_loss": round(val_loss, 4),
            "val_accuracy": round(val_accuracy, 4),
        })

        print(
            f"Epoch {epoch:02d}/{EPOCHS} | "
            f"Train Loss: {train_loss:.4f} | "
            f"Train Acc: {train_accuracy:.2%} | "
            f"Val Loss: {val_loss:.4f} | "
            f"Val Acc: {val_accuracy:.2%}",
            flush=True,
        )

        if (
            val_accuracy > best_accuracy
            or (
                val_accuracy == best_accuracy
                and val_loss < best_loss
            )
        ):
            best_accuracy = val_accuracy
            best_loss = val_loss
            best_state = copy.deepcopy(model.state_dict())

    model.load_state_dict(best_state)

    model_path = OUTPUT_DIR / "timed_mobilenetv3_best.pth"

    torch.save({
        "model_state_dict": model.state_dict(),
        "classes": classes,
        "image_size": IMAGE_SIZE,
        "architecture": "mobilenet_v3_small",
        "validation_accuracy": best_accuracy,
    }, model_path)

    history_path = OUTPUT_DIR / "training_history.csv"

    with history_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "epoch",
                "train_loss",
                "train_accuracy",
                "val_loss",
                "val_accuracy",
            ],
        )
        writer.writeheader()
        writer.writerows(history)

    print("\nTraining complete!")
    print(f"Best validation accuracy: {best_accuracy:.2%}")
    print(f"Model saved to: {model_path}")
    print(f"Training history saved to: {history_path}")


if __name__ == "__main__":
    main()
