from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Player, PlayerPhoto

router = APIRouter(tags=["photos"])


@router.get("/photos/{key}", response_class=Response)
def get_photo(key: str, db: Session = Depends(get_db)):
    """Serve a player photo. The key is random and changes on every upload,
    so the URL works as a capability (<img> tags can't send the JWT) and the
    response can be cached forever."""
    photo = (
        db.query(PlayerPhoto)
        .join(Player, Player.id == PlayerPhoto.player_id)
        .filter(Player.photo_key == key)
        .first()
    )
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada")
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
