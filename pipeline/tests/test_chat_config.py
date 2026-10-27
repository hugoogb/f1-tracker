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


def _on(**overrides):
    values = {"anthropic_api_key": "k", "chat_model": "claude-haiku-5-5", "chat_ip_salt": "s"}
    return Settings(_env_file=None, **{**values, **overrides})


def test_chat_is_disabled_for_a_model_missing_from_the_price_table():
    assert _on(chat_model="claude-unpriced-1").chat_enabled is False


def test_chat_is_disabled_when_the_price_table_is_not_json():
    assert _on(chat_prices_json="not json").chat_enabled is False
    assert _on(chat_prices_json="").chat_enabled is False
    assert _on(chat_prices_json="[]").chat_enabled is False
