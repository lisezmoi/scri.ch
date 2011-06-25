# scri.ch

scri.ch is a minimal web app that lets you draw, share, and fork existing drawings.

[Try it live](http://scri.ch/ "Try scri.ch")

## How to use

1. Draw on the main blank page
2. Save using the "Save" button
3. Copy the url and share it
4. Continue your drawing or make a new one by clicking on the "New" button

## Requirements
 * PHP 5.3
 * MySQL 5.x

## Installation

 * [Download scri.ch](https://github.com/bpierre/scri.ch/zipball/master)
 * Exctract the package on your server
 * Create a new database
 * Execute `schema.sql` on the database **then delete it**
 * Rename `config-example.php` to `config.php`
 * Edit `config.php`

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

## Credits

[Pierre Bertet](http://www.pierrebertet.net/) and [Raphaël Bastide](http://raphaelbastide.com)