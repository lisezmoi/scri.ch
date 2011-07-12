<?php
class DrawingSettings
{
  /*
   * Validate and returns
   * scri.ch settings.
   */
  
  /* Returns an Array of settings, based on GET parameters */
  public static function get_new_drawing_settings() {
    return self::encode(self::filter_all_url($_GET));
  }
  
  /* Returns an Array of settings, based on POST parameters */
  public static function get_save_drawing_settings() {
    if (isset($_POST['settings'])) {
      $settings = (array)json_decode($_POST['settings']);
      return (json_last_error() === JSON_ERROR_NONE)? self::filter_all($settings) : NULL;
    } else {
      return NULL;
    }
  }
  
  /* Check if $str is a valid color code (hexadecimal without #) and returns it */
  public static function filter_color($str) {
    $str = ltrim((string)$str, '#');
    if (preg_match('/^(([a-fA-F0-9]){3}){1,2}$/i', $str)) {
      return '#'.strtolower($str);
    } else {
      return FALSE;
    }
  }
  
  /* Check if $str is a valid size code and returns it */
  public static function filter_size($str) {
    $str = (string)$str;
    
    // Same width and height, eg. 300
    if (preg_match('/^([0-9]+)$/', $str, $matches)) {
      $matches[1] = (int)$matches[1];
      if ($matches[1] > 0) {
        return array(
          'width' => $matches[1],
          'height' => $matches[1],
        );
      } else {
        return FALSE;
      }
    }
    
    // Width only, eg. 300x
    if (preg_match('/^([0-9]+)x$/', $str, $matches)) {
      $matches[1] = (int)$matches[1];
      if ($matches[1] > 0) {
        return array(
          'width' => $matches[1],
        );
      } else {
        return FALSE;
      }
    }
    
    // Height only, eg. x400
    if (preg_match('/^x([0-9]+)$/', $str, $matches)) {
      $matches[1] = (int)$matches[1];
      if ($matches[1] > 0) {
        return array(
          'height' => $matches[1],
        );
      } else {
        return FALSE;
      }
    }
    
    // Specific width and height: 300x400
    if (preg_match('/^([0-9]+)x([0-9]+)$/', $str, $matches)) {
      $matches[1] = (int)$matches[1];
      $matches[2] = (int)$matches[2];
      $size_settings = array();
      if ($matches[1] > 0) {
        $size_settings['width'] = $matches[1];
      }
      if ($matches[2] > 0) {
        $size_settings['height'] = $matches[2];
      }
      if (count($size_settings) > 0) {
        return $size_settings;
      } else {
        return FALSE;
      }
    }
    
    return FALSE;
  }
  
  /* Check if $str is a valid margin and returns it */
  public static function filter_margin($str) {
    $str = (string)$str;
    if (preg_match('/^[0-9]+$/', $str)) {
      $margin = (int)$str;
      return ($margin > 0)? $margin : FALSE;
    }
    return FALSE;
  }
  
  /* Check and returns an Array containing all settings (URL strings) */
  public static function filter_all_url($raw_settings) {
    $settings = array();
    
    // Background parameter
    if (isset($raw_settings['background'])) {
      $background = self::filter_color($raw_settings['background']);
      if ($background !== FALSE) {
        $settings['background'] = $background;
      }
    }
    
    // Foreground parameter
    if (isset($raw_settings['foreground'])) {
      $foreground = self::filter_color($raw_settings['foreground']);
      if ($foreground !== FALSE) {
        $settings['foreground'] = $foreground;
      }
    }
    
    // Margin parameter
    if (isset($raw_settings['margin'])) {
      $margin = self::filter_margin($raw_settings['margin']);
      if ($margin !== FALSE) {
        $settings['margin'] = $margin;
      }
    }
    
    // Size
    if (isset($raw_settings['size'])) {
      $size = self::filter_size($raw_settings['size']);
      if ($size !== FALSE) {
        $settings['size'] = $size;
      }
    }
    
    return $settings;
  }
  
  /* Check and returns an Array containing all settings (settings Array) */
  public static function filter_all($raw_settings) {
    $settings = array();
    
    // Background parameter
    if (isset($raw_settings['background'])) {
      $background = self::filter_color($raw_settings['background']);
      if ($background !== FALSE) {
        $settings['background'] = $background;
      }
    }
    
    // Foreground parameter
    if (isset($raw_settings['foreground'])) {
      $foreground = self::filter_color($raw_settings['foreground']);
      if ($foreground !== FALSE) {
        $settings['foreground'] = $foreground;
      }
    }
    
    // Margin parameter
    if (isset($raw_settings['margin']) && is_int($raw_settings['margin']) && $raw_settings['margin'] > 0) {
      $settings['margin'] = $raw_settings['margin'];
    }
    
    // Size parameter
    if (isset($raw_settings['size'])) {
      $size_raw_setting = (array)$raw_settings['size'];
      $settings['size'] = array();
      if (isset($size_raw_setting['width']) && is_int($size_raw_setting['width'])) {
        $settings['size']['width'] = $size_raw_setting['width'];
      }
      if (isset($size_raw_setting['height']) && is_int($size_raw_setting['height'])) {
        $settings['size']['height'] = $size_raw_setting['height'];
      }
      if (count($settings['size']) === 0) {
        unset($settings['size']);
      }
    }
    
    return $settings;
  }
  
  /* Encode settings to JSON */
  public static function encode($settings) {
    if (count($settings) > 0) {
      $encoded_settings = json_encode($settings);
      return (json_last_error() === JSON_ERROR_NONE)? $encoded_settings : '{}';
    } else {
      return '{}';
    }
  }
}