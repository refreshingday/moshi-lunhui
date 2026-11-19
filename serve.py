# Local dev server: same as `python -m http.server`, but tells the browser to revalidate every file,
# so edits to src/*.js show up on a plain reload instead of a stale cached module.
#   python serve.py [port]   → http://localhost:5178
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    print(f'serving on http://localhost:{port}')
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
