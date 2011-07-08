#!/usr/bin/env python
import httplib, urllib, sys, os

root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

jsfile    = open(root + '/assets/scrich.js')
jsminfile = open(root + '/assets/scrich-min.js', 'w')

# Define the parameters for the POST request and encode them in
# a URL-safe format.
params = urllib.urlencode([
    #('code_url', sys.argv[1]),
    ('compilation_level', 'ADVANCED_OPTIMIZATIONS'),
    ('output_format', 'text'),
    ('output_info', 'compiled_code'),
    ('js_externs', 'window.document.onselectstart;window.SCRICH_URL;'),
    ('js_code', jsfile.read()),
    #('formatting', 'pretty_print'),
  ])

# Always use the following value for the Content-type header.
headers = { "Content-type": "application/x-www-form-urlencoded" }
conn = httplib.HTTPConnection('closure-compiler.appspot.com')
conn.request('POST', '/compile', params, headers)
response = conn.getresponse()
data = response.read()
jsminfile.write(data)
conn.close