# scri.ch

scri.ch is a minimal web app that lets you draw, share, and fork existing drawings.

[Try it live](http://scri.ch/ "Try scri.ch")

It is compatible with every modern browser, including mobile devices.

## How to use

1. Draw on the main blank page
2. Save using the "Save" button
3. Copy the url and share it
4. Continue your drawing or make a new one by clicking on the "New" button

## URL params

You can define some parameters when starting a new drawing, eg. `http://scri.ch/?background=ddd&foreground=666`

### background

The background color in hexadecimal, without the `#`. Shortcuts allowed. Eg. `http://scri.ch/?background=ddd`

### foreground

The foreground color in hexadecimal, without the `#`. Shortcuts allowed. Eg. `http://scri.ch/?foreground=ddd`

### size

The canvas size, in pixels. Syntax:

 * `?size=400`: define same width and height
 * `?size=400x`: define width only
 * `?size=x400`: define height only
 * `?size=400x300`: define both width and height

### margin

The margin around the canvas, in pixels. Eg. `http://scri.ch/?margin=100`

## Requirements
 * PHP 5.3
 * MySQL 5.x

## Installation

 * [Download scri.ch](https://github.com/bpierre/scri.ch/zipball/master)
 * Extract the package on your server
 * /tmp and /drawings directories must be writable by the webserver
 * Create a new database
 * Execute `schema.sql` on the database **then delete it**
 * Rename `config-example.php` to `config.php`
 * Edit `config.php` (see below)

### config.php

    define('SCRICH_URL', 'scri.ch/');

Full URL with trailing slash

    define('DB_DSN',  'mysql:dbname=scrich;host=localhost');

Database DSN ([PDO style](http://php.net/manual/en/ref.pdo-mysql.connection.php))

    define('DB_USER', 'username');

Database username

    define('DB_PASS', 'password');

Database password

    define('DEBUG', FALSE);

Wanna debug?

### .htaccess (Apache HTTP Server)

If you are using the Apache HTTP Server, change the `RewriteBase` directive to the scri.ch path (default is `/`).

### Other HTTP server (Nginx, Lighttpd, etc.)

If you are using another HTTP server, you just need to redirect all requests to: `index.php?r=$request`.

## Credits

A simple idea by [Pierre Bertet](http://pierrebertet.net/) and [Raphaël Bastide](http://raphaelbastide.com)

 * [Aude Debout](http://aude-debout.fr/): 404 drawing, testing
 * [Quick and Dirty](https://twitter.com/qndirty) (pro scricher): testing, evangelism

## More info

[See about page](http://about.scri.ch/)