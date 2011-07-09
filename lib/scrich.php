<?php
define('SCRICH_VERSION', '1.1');
define('SCRICH_ROOT', realpath(__DIR__ . '/..'));

require_once SCRICH_ROOT.'/config.php';
require_once SCRICH_ROOT.'/lib/draw-model.php';

function serve_image($img) {
  header("Content-type: image/png");
  header('Content-Length: ' . filesize($img));
  readfile($img);
  exit;
}

function scrich_init() {
  global $cur_img, $title;
  
  if (isset($_POST["new_draw"])) {
    $img = $_POST["new_draw"];
    $draw_m = new DrawModel();
    $short_id = $draw_m->save($img);
    header('Location: '.SCRICH_URL.$short_id);
    
  } else {
    
    if (isset($_GET["r"]) && $_GET["r"] !== '/') {
      
      $request = ltrim($_GET["r"], '/');
      
      // Direct image
      if (preg_match('/^[a-z0-9]+\.png$/', $request) && file_exists('draws/'.$request)) {
        serve_image('draws/'.$request);
        
      } elseif ($request === '404.png') {
        serve_image('assets/404.png');
        
      } else {
        
        $draw_m = new DrawModel();
        
        // Get drawing
        $cur_img = $draw_m->get($request);
        
        // 404
        if (!$cur_img) {
          header($_SERVER['SERVER_PROTOCOL'].' 404 Not Found');
          $cur_img = '404';
          $title = '404 Not Found';
        }
      }
    }
    
    // Include template
    include_once SCRICH_ROOT.'/lib/template.php';
  }
}