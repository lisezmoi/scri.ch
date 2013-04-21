<?php
$config = require __DIR__.'/config.php';
$composer_autoloader = require __DIR__.'/vendor/autoload.php';
require __DIR__.'/lib/scrich.php';

scrich_init($config, $composer_autoloader);
