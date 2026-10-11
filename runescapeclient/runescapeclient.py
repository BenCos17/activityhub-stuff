from pathlib import Path

from redbot.core import commands


class RuneScapeClient(commands.Cog):
    """Open a safe RuneScape companion inside ActivityHub."""

    def __init__(self, bot):
        self.bot = bot

    async def activityhub_game(self) -> dict:
        return {
            "key": "runescapeclient",
            "name": "RuneScape Companion",
            "description": "A companion interface with official RuneScape login handoff.",
            "web_dir": Path(__file__).parent / "web",
        }
