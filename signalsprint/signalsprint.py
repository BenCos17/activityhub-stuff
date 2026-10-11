from pathlib import Path

from redbot.core import Config, commands


class SignalSprint(commands.Cog):
    """Dodge falling interference and keep the signal alive."""

    def __init__(self, bot):
        self.bot = bot
        self.config = Config.get_conf(self, identifier=492089091320446976, force_registration=True)
        self.config.register_member(best_score=0)

    async def activityhub_game(self) -> dict:
        return {
            "key": "signalsprint",
            "name": "Signal Sprint",
            "description": "Dodge the interference. Keep the signal alive.",
            "web_dir": Path(__file__).parent / "web",
            "actions": {"submit_score": self.submit_score},
        }

    async def submit_score(self, ctx, data: dict) -> dict:
        try:
            score = int(data.get("score", 0))
        except (TypeError, ValueError):
            return {"error": "That score could not be verified."}

        score = max(0, min(score, 999999))
        record = self.config.member(ctx.author)
        best_score = await record.best_score()
        if score > best_score:
            await record.best_score.set(score)
            best_score = score

        return {"best_score": best_score, "is_new_best": score == best_score}

    async def red_delete_data_for_user(self, *, requester, user_id):
        for guild_id, members in (await self.config.all_members()).items():
            if user_id in members:
                await self.config.member_from_ids(guild_id, user_id).clear()
