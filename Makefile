UGLIFY_BIN = uglifyjs
JS_MIN = assets/scrich-min.js
JS_SOURCE = assets/scrich.js

$(JS_MIN): $(JS_SOURCE)
	@command -v $(UGLIFY_BIN) >/dev/null 2>&1 || { echo >&2 "You need to install UglifyJS, run this: npm install uglify-js -g"; exit 1; }
	$(UGLIFY_BIN) -o $@ $<
	echo >> $@

clean:
	rm $(JS_MIN)

all: $(JS_MIN)
