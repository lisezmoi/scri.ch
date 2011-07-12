<?php
require_once '../lib/scrich.php';

$drawing_m = new DrawingModel();

$page = 1;
$drawings_by_page = 50;

if (isset($_GET['p'])) {
  $page = (int)$_GET['p'];
}

$drawings = $drawing_m->get_range($page-1, $drawings_by_page);
$drawings_count = $drawing_m->get_count();
$nb_pages = (int)ceil($drawings_count/$drawings_by_page);

include_once './template.php';
