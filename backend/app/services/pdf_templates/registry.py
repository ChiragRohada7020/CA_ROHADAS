from .theme import DEFAULT_THEME
from .renderers import listTemplates as _renderers_list

# Template registry: names of all available invoice templates.
# The actual rendering is in renderers.py; this module provides a registry
# for future plugin-style template registration.
REGISTERED_TEMPLATES = {}


def getTemplate(name):
    # Return a dummy renderer for now — real rendering happens in renderers.render()
    def renderer(ctx):
        pass
    return renderer


def registerTemplate(name, renderer):
    REGISTERED_TEMPLATES[name] = renderer


def listTemplates():
    """Return all available template IDs, including the premium templates."""
    return _renderers_list()
