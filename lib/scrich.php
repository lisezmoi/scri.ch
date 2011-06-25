<?php
define('SCRICH_VERSION', '1');
define('SCRICH_ROOT', realpath(__DIR__ . '/..'));

require_once SCRICH_ROOT.'/config.php';
require_once SCRICH_ROOT.'/lib/draw_model.php';

function scrich_init() {
  global $cur_img, $title;
  
  if (isset($_POST["new_draw"])) {
    $img = $_POST["new_draw"];
    $draw_m = new DrawModel();
    $short_id = $draw_m->save($img);
    header('Location: '.SCRICH_URL.$short_id);
    
  } else {
    
    if (isset($_GET["r"])) {
      $request = $_GET["r"];
      
      // Direct image
      if (preg_match('/^[a-z0-9]+\.png$/', $request) && file_exists('draws/'.$request)) {
        header("Content-type: image/png");
        header('Content-Length: ' . filesize('draws/'.$request));
        readfile('draws/'.$request);
        exit();
        
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
    include_once SCRICH_ROOT.'/pages/draw.php';
  }
}