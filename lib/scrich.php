<?php
use Evenement\EventEmitter;

define('SCRICH_VERSION', '2.0.0-dev');
define('SCRICH_ROOT', realpath(__DIR__ . '/..'));
define('SCRICH_PLUGINS', realpath(SCRICH_ROOT . '/plugins'));

require_once SCRICH_ROOT.'/config.php';
require_once SCRICH_ROOT.'/lib/drawing-model.php';
require_once SCRICH_ROOT.'/lib/drawing-settings.php';

function load_plugins($composer_autoloader, &$scrich_events) {
  $automap = $composer_autoloader->getClassMap();
  $plugins_loaded = array();
  foreach ($automap as $classname => $filename) {
    if (strpos($filename, SCRICH_PLUGINS) !== FALSE) {
      $plugins_loaded[] = new $classname($scrich_events);
    }
  }
  $scrich_events->emit('plugins.load', array($plugins_loaded));
  return $plugins_loaded;
}

// Send a PNG image and exit PHP
function serve_image($img) {
  header('Content-type: image/png');
  header('Content-Length: ' . filesize($img));
  readfile($img);
  exit;
}

function crop_image($image_name, $dest_image_name, $background = 'white', $margin = 20) {
  if (file_exists($dest_image_name)) return $dest_image_name;
  $im = new Imagick($image_name);
  $im->trimImage(0);
  $im->setImageBackgroundColor($background);
  $im->borderImage($background, $margin, $margin);
  $im->writeImage($dest_image_name);
  return $dest_image_name;
}

function zoom_image($image_name, $dest_image_name, $zoom_level) {
  if (file_exists($dest_image_name)) return $dest_image_name;
  $im = new Imagick($image_name);
  $dimensions = $im->getImageGeometry();
  $im->scaleImage($dimensions['width']*$zoom_level, $dimensions['height']*$zoom_level);
  $im->writeImage($dest_image_name);
  return $dest_image_name;
}

function handle_direct_image($scrich_id, $image_path, $mode, $settings = NULL) {

  // Get settings
  if ($settings === NULL) {
    $drawing_m = new DrawingModel();
    $cur_drawing = $drawing_m->get($scrich_id);
    $settings = unserialize($cur_drawing['settings']);
  }

  // Crop image (if the image is not at a fixed size)
  if ($mode !== 'raw' && !isset($settings['size'])) {
    $img_background = isset($settings['background'])? $settings['background'] : 'white';
    $image_path = crop_image($image_path, SCRICH_ROOT."/drawings/{$scrich_id}-crop.png", $img_background, 20);
  }

  // Zoom image
  if (in_array($mode, array('2x', '3x', '4x'))) {
    $image_path = zoom_image($image_path, SCRICH_ROOT."/drawings/{$scrich_id}-{$mode}.png", intval($mode, 10));
  }

  // Serve image
  serve_image($image_path);
}

function scrich_init($config, $composer_autoloader) {
  global $cur_img, $title;

  if (!extension_loaded('imagick')) {
    die('Error: the PHP Imagick extension is required.');
  }

  $scrich_events = new EventEmitter();
  $plugins_loaded = load_plugins($composer_autoloader, $scrich_events);

  if (isset($_POST['new_drawing'])) {
    $img = $_POST['new_drawing'];
    $settings = DrawingSettings::get_save_drawing_settings();
    if ($settings !== NULL) {
      $settings = serialize($settings);
    }

    $drawing_m = new DrawingModel();
    $short_id = $drawing_m->save($img, NULL, $settings);
    $scrich_events->emit('drawing.new', array($short_id, $settings));

    header('Location: '.SCRICH_URL.$short_id);

  } else {

    // Init settings
    $settings = array();

    if (isset($_GET['r']) && $_GET['r'] !== '/') { // Existing drawing

      $request = ltrim($_GET['r'], '/');

      // Direct image
      if (preg_match('/^([a-z0-9]+)(\-raw|\-[1234]x)?\.png$/', $request, $direct_image_matches)) {

        $scrich_id = $direct_image_matches[1];
        if ($scrich_id === '404' || file_exists(SCRICH_ROOT."/drawings/{$scrich_id}.png")) {

          $mode = 'crop';
          if (count($direct_image_matches) === 3) {
            $tmp_mode = substr($direct_image_matches[2], 1);
            if (in_array($tmp_mode, array('raw', '2x', '3x', '4x'))) {
              $mode = $tmp_mode;
            }
          }

          $image_path = SCRICH_ROOT."/drawings/{$scrich_id}.png";
          $settings = NULL;
          if ($scrich_id === '404') {
            $image_path = SCRICH_ROOT.'/assets/404.png';
            $settings = array();
          }

          handle_direct_image($scrich_id, $image_path, $mode, $settings);
        }

        // Serve 404.png (from the assets/ dir)
      } elseif ($request === '404-raw.png') {
        serve_image(SCRICH_ROOT.'/assets/404.png');

      } elseif ($request === '404.png') {
        serve_image(crop_image(SCRICH_ROOT.'/assets/404.png', SCRICH_ROOT.'/drawings/404-crop.png', 'white', 20));

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
