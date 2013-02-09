<?php
define('SCRICH_VERSION', '1.2');
define('SCRICH_ROOT', realpath(__DIR__ . '/..'));

require_once SCRICH_ROOT.'/config.php';
require_once SCRICH_ROOT.'/lib/drawing-model.php';
require_once SCRICH_ROOT.'/lib/drawing-settings.php';

// Send a PNG image and exit PHP
function serve_image($img) {
  header('Content-type: image/png');
  header('Content-Length: ' . filesize($img));
  readfile($img);
  exit;
}

function scrich_init() {
  global $cur_img, $title;

  if (isset($_POST['new_drawing'])) {
    $img = $_POST['new_drawing'];
    $settings = DrawingSettings::get_save_drawing_settings();
    if ($settings !== NULL) {
      $settings = serialize($settings);
    }

    $drawing_m = new DrawingModel();
    $short_id = $drawing_m->save($img, NULL, $settings);
    header('Location: '.SCRICH_URL.$short_id);

  } else {

    // Init settings
    $settings = array();

    if (isset($_GET['r']) && $_GET['r'] !== '/') { // Existing drawing

      $request = ltrim($_GET['r'], '/');

      // Direct image
      if (preg_match('/^[a-z0-9]+\.png$/', $request) && file_exists(SCRICH_ROOT.'/drawings/'.$request)) {

        $image_name = $request;

        // Crop image (if imagick is loaded)
        if (isset($_GET['crop']) && extension_loaded('imagick')) {
          $cropped_name = str_replace('.png', '-crop.png', $image_name);
          if (!file_exists(SCRICH_ROOT.'/drawings/'.$cropped_name)) {
            $im = new Imagick(SCRICH_ROOT.'/drawings/'.$image_name);
            $im->trimImage(0);
            $im->borderImage('transparent', 20, 20); // TODO: fetch the bg color in DB
            $im->writeImage(SCRICH_ROOT.'/drawings/'.$cropped_name);
          }
          $image_name = $cropped_name;
        }

        // Serve image
        serve_image('drawings/'.$image_name);

        // Serve 404.png (from the assets/ dir)
      } elseif ($request === '404.png') {
        serve_image('assets/404.png');

      // Load an existing drawing
      } else {
        $drawing_m = new DrawingModel();
        $cur_drawing = $drawing_m->get($request); // Get drawing
        $cur_img = $cur_drawing['short_id'];
        $scrich_settings = json_encode(unserialize($cur_drawing['settings']));

        // 404
        if (!$cur_img) {
          header($_SERVER['SERVER_PROTOCOL'].' 404 Not Found');
          $cur_img = '404';
          $scrich_settings = '{}';
          $title = '404 Not Found';
        }
      }
    } else { // New drawing
      $scrich_settings = DrawingSettings::get_new_drawing_settings();
    }

    // Include template
    include_once SCRICH_ROOT.'/lib/template.php';
  }
}
