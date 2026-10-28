from .theme import DEFAULT_THEME

def getTemplate(name):
    # Return a dummy renderer for now
    def renderer(ctx):
        pass
    return renderer

def registerTemplate(name, renderer):
    pass

def listTemplates():
    return ['modern', 'classic', 'minimal', 'corporate', 'compact']
