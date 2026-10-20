
from pathlib import Path
from io import BytesIO

import torch
from torch import nn
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, File, HTTPException, UploadFile
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "timed_mobilenetv3_best.pth"

MAX_IMAGE_BYTES = 5 * 1024 * 1024

app = FastAPI(
    title="TiMed Computer Vision API",
    description="Experimental pill appearance classification API",
    version="0.1.0",
)

device = torch.device("cpu")

checkpoint = torch.load(
    MODEL_PATH,
    map_location=device,
    weights_only=True,
)

classes = checkpoint["classes"]
image_size = checkpoint["image_size"]

model = mobilenet_v3_small(weights=None)
input_features = model.classifier[-1].in_features
model.classifier[-1] = nn.Linear(input_features, len(classes))

model.load_state_dict(checkpoint["model_state_dict"])
model.to(device)
model.eval()

preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(image_size),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


@app.get("/")
def root():
    return {
        "service": "TiMed Computer Vision API",
        "status": "running",
        "model": "MobileNetV3-Small",
        "experimental": True,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": True,
        "classes": classes,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(
            status_code=415,
            detail="Only JPEG, PNG, and WebP images are supported.",
        )

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 5 MB size limit.",
        )

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Unable to read the uploaded image.",
        )

    input_tensor = preprocess(image).unsqueeze(0).to(device)

    with torch.inference_mode():
        logits = model(input_tensor)
        probabilities = torch.softmax(logits, dim=1)[0]

    predicted_index = int(probabilities.argmax().item())

    scores = {
        class_name: round(float(probabilities[index]), 4)
        for index, class_name in enumerate(classes)
    }

    return {
        "status": "experimental_classification",
        "predicted_class": classes[predicted_index],
        "model_score": round(
            float(probabilities[predicted_index]), 4
        ),
        "scores": scores,
        "verified": False,
        "disclaimer": (
            "Experimental appearance classification only. "
            "This does not verify medication identity, "
            "correctness, safety, or ingestion."
        ),
    }
