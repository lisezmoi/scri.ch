<?php
require_once '../lib/scrich.php';
require_once SCRICH_ROOT.'/lib/draw_model.php';

$draw_m = new DrawModel();

$page = 1;
$draws_by_page = 50;

if (isset($_GET['p'])) {
  $page = (int)$_GET['p'];
}

$draws = $draw_m->get_range($page-1, $draws_by_page);
$draws_count = $draw_m->get_count();
$nb_pages = (int)ceil($draws_count/$draws_by_page);

include SCRICH_ROOT.'/admin/pages/list.php';
