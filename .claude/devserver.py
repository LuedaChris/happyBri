# Lokaler Testserver (nur am PC): wie "python -m http.server 8080", aber mit "Cache-Control: no-store",
# damit der Vorschau-Browser nach einer Änderung nie eine alte Datei aus seinem Zwischenspeicher nimmt.
import functools
import http.server
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Projektordner
http.server.ThreadingHTTPServer(('', 8080), functools.partial(NoCacheHandler, directory=root)).serve_forever()
