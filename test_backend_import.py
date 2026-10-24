import sys
sys.path.insert(0, 'd:\\rohadas_organisagtion\\Ca_software\\backend')

try:
    from app.main import app
    print("App created successfully")
    print(f"Routes: {len(app.routes)}")
    for route in app.routes:
        path = getattr(route, 'path', 'N/A')
        methods = getattr(route, 'methods', None)
        if methods:
            print(f"  {path} -> {sorted(methods)}")
        else:
            print(f"  {path} -> [mount]")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
