"""Normalize uploaded player photos.

Any common raster format is accepted; the result is always a square JPEG of
at most ``SIZE`` pixels (EXIF orientation applied, metadata stripped), so what
gets stored and served is small and safe to render.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
SIZE = 512
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "MPO"}

# Refuse decompression bombs early (a 512px avatar never needs more).
Image.MAX_IMAGE_PIXELS = 40_000_000


class PhotoError(ValueError):
    pass


def process_photo(content: bytes, is_card: bool = False) -> tuple[bytes, str]:
    """Return ``(bytes, content_type)`` or raise ``PhotoError``."""
    if not content:
        raise PhotoError("Arquivo vazio")
    if len(content) > MAX_UPLOAD_BYTES:
        raise PhotoError("Imagem muito grande (máximo de 8 MB)")
    try:
        with Image.open(io.BytesIO(content)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(content))
        if image.format not in ALLOWED_FORMATS:
            raise PhotoError("Formato não suportado (use JPG, PNG ou WEBP)")
        image = ImageOps.exif_transpose(image)
        if is_card:
            # Preserve aspect ratio and transparent corners for card templates
            max_dim = 1200
            if max(image.width, image.height) > max_dim:
                image.thumbnail((max_dim, max_dim), Image.LANCZOS)
            out = io.BytesIO()
            if image.mode in ("RGBA", "LA", "P"):
                image = image.convert("RGBA")
                image.save(out, "PNG", optimize=True)
                return out.getvalue(), "image/png"
            else:
                image = image.convert("RGB")
                image.save(out, "JPEG", quality=90, optimize=True)
                return out.getvalue(), "image/jpeg"

        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
    except PhotoError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise PhotoError("Arquivo de imagem inválido")

    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    if side > SIZE:
        image = image.resize((SIZE, SIZE), Image.LANCZOS)

    out = io.BytesIO()
    image.save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue(), "image/jpeg"
