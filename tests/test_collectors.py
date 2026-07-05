from newsletter.collectors import (
    clean_text,
    extract_publish_date,
    fix_mojibake,
    is_garbled,
    is_junk_link,
    is_junk_url,
)


def _mojibake(text: str) -> str:
    """Simulate requests decoding UTF-8 bytes as ISO-8859-1 (the real bug)."""
    return text.encode("utf-8").decode("latin-1")


def test_fix_mojibake_repairs_double_encoded_apostrophe():
    original = "Hong Kong’s development"  # curly apostrophe
    garbled = _mojibake(original)
    assert garbled != original  # sanity: it really is mangled
    assert fix_mojibake(garbled) == original


def test_fix_mojibake_repairs_cjk_decoded_as_latin1():
    # "跳至主要內容" (Skip to main content) UTF-8 bytes mis-decoded as latin-1.
    original = "跳至主要內容"
    garbled = _mojibake(original)
    assert garbled != original
    assert fix_mojibake(garbled) == original


def test_fix_mojibake_leaves_clean_text_untouched():
    clean = "Northern Metropolis public works update 北部都會區"
    assert fix_mojibake(clean) == clean
    # Genuine accented Latin text must not be mangled.
    assert fix_mojibake("Café résumé naïve") == "Café résumé naïve"


def test_clean_text_strips_tags_and_repairs_mojibake():
    garbled = _mojibake("Hong Kong’s")
    assert clean_text(f"<b>{garbled}</b>  plan") == "Hong Kong’s plan"


def test_is_junk_url_flags_media_and_docs():
    assert is_junk_url("https://www.tlb.gov.hk/video/API-TH16-E-X-3.mp4")
    assert is_junk_url("https://www.thestandard.com.hk/banner/PrintAdRate.pdf")
    assert not is_junk_url("https://www.devb.gov.hk/en/press/index_id_15485.html")


def test_is_junk_link_flags_nav_and_schemes():
    assert is_junk_link("#main", "Skip to main content")
    assert is_junk_link("/en/index.html", "跳至主要內容")
    assert is_junk_link("mailto:x@example.com", "Email us about the project")
    assert not is_junk_link(
        "https://www.devb.gov.hk/press/x.html",
        "Fanling Bypass Eastern Section opens",
    )


def test_extract_publish_date_from_title_prefix():
    assert extract_publish_date("28 Mar 2026 URA and 2Gather Launch Festival", "https://x") == "2026-03-28"


def test_extract_publish_date_from_url_slug():
    assert extract_publish_date("URA acquisition offers", "https://www.ura.org.hk/press-releases/20260530") == "2026-05-30"
    assert extract_publish_date("Gov press release", "https://www.info.gov.hk/gia/general/202606/19/P123.htm") == "2026-06-19"


def test_extract_publish_date_absent_returns_empty():
    assert extract_publish_date("Northern Metropolis Development", "https://www.cedd.gov.hk/northern") == ""


def test_is_garbled_detects_unrepairable_mojibake():
    # "內" corrupted to E5 20 A7 (middle byte lost to whitespace) is unrepairable.
    corrupted = "å §å®¹"
    assert is_garbled(corrupted)
    assert not is_garbled("Northern Metropolis transport update")
    assert not is_garbled("發展局推出香港版「新工程合約」")
