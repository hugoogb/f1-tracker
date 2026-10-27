from src.config import Settings


def test_chat_is_disabled_until_key_model_and_salt_are_all_set():
    assert Settings(_env_file=None).chat_enabled is False
    assert (
        Settings(_env_file=None, anthropic_api_key="k", chat_model="claude-haiku-5-5").chat_enabled
        is False
    )
    assert (
        Settings(
            _env_file=None,
            anthropic_api_key="k",
            chat_model="claude-haiku-5-5",
            chat_ip_salt="s",
        ).chat_enabled
        is True
    )


def test_chat_limit_defaults_match_the_spec():
    s = Settings(_env_file=None)
    assert (
        s.chat_daily_budget_usd,
        s.chat_ip_per_10min,
        s.chat_ip_per_day,
        s.chat_max_tokens,
    ) == (0.50, 10, 60, 600)
    assert '"claude-haiku-5-5"' in s.chat_prices_json
