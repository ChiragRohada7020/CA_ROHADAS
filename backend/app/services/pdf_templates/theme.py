DEFAULT_THEME = {
    "primary": "#1f4e79",
    "text": "#111111",
    "muted": "#6b6b6b",
    "border": "#d9d9d9",
    "background": "#f7f7f7",
    "rowAlt": "#fbfbfb",
    "fontHeader": "Helvetica-Bold",
    "fontBody": "Helvetica",
    "density": "comfortable",
    "showAmountInWords": True,
    "showBankDetails": True,
}


def mergeTheme(theme=None):
    if not theme:
        return DEFAULT_THEME.copy()
    merged = DEFAULT_THEME.copy()
    merged.update(theme)
    return merged


class Theme(dict):
    pass
