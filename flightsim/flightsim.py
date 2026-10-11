import asyncio
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from redbot.core import Config, commands


class FlightSim(commands.Cog):
    """Fly a jet through takeoff, cruise, and landing."""

    def __init__(self, bot):
        self.bot = bot
        self.config = Config.get_conf(self, identifier=492089091320446976, force_registration=True)
        self.config.register_global(api_key="")
        self.config.register_member(best_score=0)
        self._traffic_cache = None
        self._traffic_cache_expires = 0.0
        self._traffic_cache_lock = asyncio.Lock()

    async def activityhub_game(self) -> dict:
        return {
            "key": "flightsim",
            "name": "Flight Sim",
            "description": "Take off, hold your altitude, and land the aircraft safely.",
            "web_dir": Path(__file__).parent / "web",
            "actions": {"submit_score": self.submit_score, "get_traffic": self.get_traffic},
        }

    async def get_traffic(self, ctx, data: dict) -> dict:
        """Fetch nearby aircraft without exposing the Airplanes.Live key to clients."""
        async with self._traffic_cache_lock:
            now = time.monotonic()
            if self._traffic_cache is not None and now < self._traffic_cache_expires:
                return self._traffic_cache

            api_key = await self.config.api_key()
            if not api_key:
                result = {"configured": False, "aircraft": []}
            else:
                request = Request(
                    "https://rest.api.airplanes.live/?circle=38.84916,-77.04138,40",
                    headers={"User-Agent": "ActivityHub Flight Sim"},
                )
                request.add_header("auth", api_key)
                try:
                    payload = await asyncio.to_thread(self._request_traffic, request)
                    result = {"configured": True, "aircraft": self._normalise_aircraft(payload)}
                except HTTPError as error:
                    detail = self._http_error_detail(error)
                    result = {"configured": True, "aircraft": [], "error": f"Airplanes.Live rejected the request ({error.code}): {detail}"}
                except (URLError, OSError, ValueError, json.JSONDecodeError):
                    result = {"configured": True, "aircraft": [], "error": "Airplanes.Live could not be reached."}

            self._traffic_cache = result
            self._traffic_cache_expires = time.monotonic() + 15
            return result

    @staticmethod
    def _normalise_aircraft(payload: dict) -> list[dict]:
        if not isinstance(payload, dict) or not isinstance(payload.get("aircraft"), list):
            raise ValueError("Airplanes.Live returned an unexpected response.")
        aircraft = []
        for item in payload.get("aircraft", []):
            if item.get("lat") is None or item.get("lon") is None:
                continue
            aircraft.append({
                "lat": item["lat"],
                "lon": item["lon"],
                "distance": item.get("dst"),
                "altitude": item.get("alt_baro", "ground"),
                "speed": item.get("gs"),
                "heading": item.get("track"),
                "vertical_rate": item.get("baro_rate"),
                "callsign": str(item.get("flight", "")).strip(),
                "registration": item.get("r", ""),
                "type": item.get("t", "") or "UNKNOWN",
                "squawk": item.get("squawk", ""),
            })
        return aircraft[:80]

    @commands.command(name="flightsimkey")
    @commands.is_owner()
    async def flightsimkey(self, ctx, key: str = ""):
        """Set or check the Airplanes.Live key used by Flight Sim."""
        key = key.strip()
        if not key:
            configured = bool(await self.config.api_key())
            await ctx.send(f"Flight Sim Airplanes.Live key configured: {'yes' if configured else 'no'}.")
            return
        await self.config.api_key.set(key)
        self._traffic_cache = None
        self._traffic_cache_expires = 0.0
        await ctx.send("Flight Sim Airplanes.Live key saved. Run [p]flightsimtest to verify it.")

    @commands.command(name="flightsimtest")
    @commands.is_owner()
    async def flightsimtest(self, ctx):
        """Test the configured Airplanes.Live key and report the result."""
        self._traffic_cache = None
        self._traffic_cache_expires = 0.0
        result = await self.get_traffic(ctx, {})
        if result.get("error"):
            await ctx.send(f"Flight Sim traffic test failed: {result['error']}")
        elif not result.get("configured"):
            await ctx.send("Flight Sim traffic test skipped: no API key is configured.")
        else:
            await ctx.send(f"Flight Sim traffic test passed: {len(result['aircraft'])} aircraft returned.")

    @staticmethod
    def _request_traffic(request: Request) -> dict:
        with urlopen(request, timeout=8) as response:
            return json.load(response)

    @staticmethod
    def _http_error_detail(error: HTTPError) -> str:
        try:
            body = error.read(512).decode("utf-8", errors="replace")
            payload = json.loads(body)
            detail = payload.get("message") or payload.get("error") or payload.get("msg")
            if detail:
                return str(detail)[:160]
        except (OSError, UnicodeDecodeError, ValueError):
            pass
        return "check the API key and query format"

    async def submit_score(self, ctx, data: dict) -> dict:
        try:
            score = int(data.get("score", 0))
        except (TypeError, ValueError):
            return {"error": "That flight score could not be verified."}

        score = max(0, min(score, 999999))
        record = self.config.member(ctx.author)
        best_score = await record.best_score()
        is_new_best = score > best_score
        if is_new_best:
            await record.best_score.set(score)
            best_score = score

        return {"best_score": best_score, "is_new_best": is_new_best}

    async def red_delete_data_for_user(self, *, requester, user_id):
        for guild_id, members in (await self.config.all_members()).items():
            if user_id in members:
                await self.config.member_from_ids(guild_id, user_id).clear()
