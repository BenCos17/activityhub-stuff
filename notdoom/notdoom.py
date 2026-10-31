from pathlib import Path

from redbot.core import Config, commands


class NotDoom(commands.Cog):
    """Clear the arena, upgrade your arsenal, and survive the NotDoom."""

    def __init__(self, bot):
        self.bot = bot
        self.config = Config.get_conf(self, identifier=701489120532, force_registration=True)
        self.config.register_member(best_score=0)

    async def activityhub_game(self) -> dict:
        return {
            "key": "notdoom",
            "name": "NotDoom",
            "description": "Clear demon waves, grab the pickups, and reach the next arena.",
            "web_dir": Path(__file__).parent / "web",
            "actions": {"submit_score": self.submit_score},
        }

    async def submit_score(self, ctx, data: dict) -> dict:
        try:
            score = int(data.get("score", 0))
        except (TypeError, ValueError):
            return {"error": "That score could not be verified."}

        score = max(0, min(score, 9999999))
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
