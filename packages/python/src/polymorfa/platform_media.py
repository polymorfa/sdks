"""Platform media metadata and uploads preserve the API's opaque payloads."""

from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, JsonObject, RequestOptions


class Media(Resource):
    async def retrieve(
        self, media_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("GET", f"/platform/media/{segment(media_id)}", options=options)

    async def delete(
        self, media_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "DELETE", f"/platform/media/{segment(media_id)}", options=options
        )

    async def create_upload(
        self, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("POST", "/platform/media/uploads", body=body, options=options)
