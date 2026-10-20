
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import math

BASE_DIR = Path(__file__).resolve().parent
IMAGE_DIR = BASE_DIR / "dataset" / "selected_images"
OUTPUT_DIR = BASE_DIR / "dataset" / "inspection"

CLASSES = [
    "Amoxicillin_250mg",
    "Nitrofurantoin_100mg",
    "Hydroxyzine_100mg",
]

THUMB_WIDTH = 180
THUMB_HEIGHT = 180
LABEL_HEIGHT = 35
COLUMNS = 5
MARGIN = 15


def create_contact_sheet(class_name):
    class_dir = IMAGE_DIR / class_name

    if not class_dir.exists():
        print(f"Missing folder: {class_dir}")
        return

    images = sorted([
        path for path in class_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in (".jpg", ".jpeg", ".png")
    ])

    if not images:
        print(f"No images found for {class_name}")
        return

    rows = math.ceil(len(images) / COLUMNS)
    cell_width = THUMB_WIDTH + MARGIN
    cell_height = THUMB_HEIGHT + LABEL_HEIGHT + MARGIN

    sheet = Image.new(
        "RGB",
        (COLUMNS * cell_width + MARGIN,
         rows * cell_height + MARGIN),
        "white"
    )

    draw = ImageDraw.Draw(sheet)

    for index, image_path in enumerate(images):
        col = index % COLUMNS
        row = index // COLUMNS

        x = MARGIN + col * cell_width
        y = MARGIN + row * cell_height

        try:
            with Image.open(image_path) as original:
                thumbnail = ImageOps.contain(
                    ImageOps.exif_transpose(original).convert("RGB"),
                    (THUMB_WIDTH, THUMB_HEIGHT)
                )

            thumb_background = Image.new(
                "RGB",
                (THUMB_WIDTH, THUMB_HEIGHT),
                "#eeeeee"
            )

            paste_x = (THUMB_WIDTH - thumbnail.width) // 2
            paste_y = (THUMB_HEIGHT - thumbnail.height) // 2

            thumb_background.paste(thumbnail, (paste_x, paste_y))
            sheet.paste(thumb_background, (x, y))

            draw.text(
                (x + 5, y + THUMB_HEIGHT + 5),
                f"Image {index + 1}",
                fill="black"
            )

        except Exception as error:
            print(f"Could not process {image_path.name}: {error}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{class_name}_contact_sheet.jpg"
    sheet.save(output_path, quality=90)

    print(f"{class_name}: {len(images)} images")
    print(f"Saved: {output_path}\n")


def main():
    print("Generating TiMed dataset contact sheets...\n")

    for class_name in CLASSES:
        create_contact_sheet(class_name)

    print("Inspection sheets generated successfully.")


if __name__ == "__main__":
    main()
