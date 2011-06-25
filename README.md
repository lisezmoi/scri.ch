# scri.ch

## Demo
[Try it live](http://scri.ch/ "Try scri.ch")

## Description
scri.ch is a minimal web app that lets you draw, share, and fork existing drawings.

## How to use

1. Draw on the main blank page
2. Save using the "save" button
3. Copy the url and share it
4. Continue your drawing or make a new one by clicking on the "New" button

## Requirements
 * PHP 5.3
 * MySQL 5.x

## Installation

 * [Download scri.ch](https://github.com/bpierre/scri.ch/zipball/master)
 * Exctract the package on your server
 * Create a new database
 * Edit `config.php` at the root dirrectory
 

Full URL with trailing slash

    define('SCRICH_URL', 'scri.ch/');

Database DSN ([PDO style](http://php.net/manual/en/ref.pdo-mysql.connection.php))

    define('DB_DSN',  'mysql:dbname=scrich;host=localhost');

Database username

    define('DB_USER', 'username');

Database password

    define('DB_PASS', 'password');

Wanna debug?

    define('DEBUG', FALSE);

## Credits

[Pierre Bertet](http://www.pierrebertet.net/) and [Raphaël Bastide](http://raphaelbastide.com)