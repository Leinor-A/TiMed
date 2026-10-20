
import * as ImageManipulator from "expo-image-manipulator";

const API_HOST = "172.20.10.2";
const API_BASE_URL = `http://${API_HOST}:8000`;

export type VisionPrediction = {
  status: string;
  predicted_class: string;
  model_score: number;
  scores: Record<string, number>;
  verified: boolean;
  disclaimer: string;
};

export async function analyzePillImage(
  imageUri: string,
): Promise<VisionPrediction> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const context = ImageManipulator.ImageManipulator.manipulate(imageUri);

    // Resize the photograph to a maximum width of 800 pixels.
    // Preserve its aspect ratio.
    context.resize({ width: 800 });

    const renderedImage = await context.renderAsync();

    const jpegImage = await renderedImage.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.65,
    });

    // Read the converted JPEG as a Blob.
    const imageResponse = await fetch(jpegImage.uri);

    if (!imageResponse.ok) {
      throw new Error("Unable to read the converted photograph.");
    }

    const imageBlob = await imageResponse.blob();

    // Explicitly set the MIME type to image/jpeg.
    const jpegBlob = new Blob([imageBlob], {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("file", jpegBlob, "pill-photo.jpg");

    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`API error ${response.status}: ${details}`);
    }

    return (await response.json()) as VisionPrediction;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The server took too long to respond.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
