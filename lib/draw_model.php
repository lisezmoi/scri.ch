<?php

class DrawModel
{
  /*
   * Draw model
   * Permits to retrieving and saving draws.
   */
  private $pdo;
  
  function __construct() {
    $this->pdo = $this->get_pdo();
    $this->reserved_short_ids = array('404','admin','gallery','feed','live');
  }
  
  /* Returns a draw */
  public function get($short_id) {
    $sql = 'SELECT short_id, date FROM draws WHERE short_id = :short_id';
    $sth = $this->pdo->prepare($sql);
    $sth->bindValue(':short_id', $short_id);
    $sth->execute();
    $res = $sth->fetch();
    if ($res) {
      return $res[0];
    }
    return false;
  }
  
  /* Returns last draw */
  public function get_last() {
    $sql = 'SELECT short_id, date FROM draws WHERE id = (SELECT MAX(id) FROM draws) FROM draws';
    $sth = $this->pdo->prepare($sql);
    $sth->execute();
    $res = $sth->fetch();
    
    if ($res) {
      return $res[0];
    }
    return '0';
  }
  
  /* Retuns a draws collection */
  public function get_range($offset, $limit) {
    $sql = 'SELECT short_id, date FROM draws ORDER BY id DESC LIMIT :offset, :limit';
    $sth = $this->pdo->prepare($sql);
    $sth->bindValue(':offset', $offset * $limit, PDO::PARAM_INT);
    $sth->bindValue(':limit', $limit, PDO::PARAM_INT);
    $sth->execute();
    
    $sql_results = $sth->fetchAll();
    $results = array();
    
    foreach ($sql_results as $res) {
      $response = new StdClass;
      $response->short_id = $res['short_id'];
      $response->date = $res['date'];
      array_push($results, $response);
    }
    
    return $results;
  }
  
  /* Returns the draws total count */
  public function get_count() {
    $sql = 'SELECT COUNT(*) FROM draws';
    $sth = $this->pdo->prepare($sql);
    $sth->execute();
    $res = $sth->fetch();
    return $res[0];
  }
  
  /* Save a new draw to database */
  public function save($data, $parent=NULL) {
    $tmp_file = $this->data_to_file($data);
    $short_id = $this->insert_drawing($parent);
    rename($tmp_file, SCRICH_ROOT.'/draws/'.$short_id.'.png');
    return $short_id;
  }
  
  /* Get next ID */
  private function get_next_short_id() {
    $last_short_id = $this->get_last();
    $next_id = (int)DrawModel::get_id($last_short_id) + 1;
    while ( $this->get(DrawModel::get_short_id($next_id)) !== false
            || in_array(DrawModel::get_short_id($next_id), $this->reserved_short_ids) ) {
      $next_id += 1;
    }
    return DrawModel::get_short_id($next_id);
  }
  
  /* Save image to disk and returns a tmp. file path */
  private function data_to_file($data) {
    $target = SCRICH_ROOT.'/tmp/'.uniqid().'.png';
    $whandle = fopen($target,'w');
    stream_filter_append($whandle, 'convert.base64-decode', STREAM_FILTER_WRITE);
    fwrite($whandle,$data);
    fclose($whandle);
    return $target;
  }
  
  /* Insert a new image in DB */
  private function insert_drawing($parent) {
    $sql = 'INSERT INTO draws VALUES (NULL, :next_short_id, NULL, :parent)';
    $sth = $this->pdo->prepare($sql);
    $next_short_id = $this->get_next_short_id();
    $sth->bindParam(':next_short_id', $next_short_id);
    $sth->bindParam(':parent', $parent);
    $sth->execute();
    return $next_short_id;
  }
  
  /* Returns a PDO instance */
  private function get_pdo() {
    try {
      $dbh = new PDO(DB_DSN, DB_USER, DB_PASS);
      return $dbh;
    } catch (PDOException $e) {
      exit('Connection failed: ' . $e->getMessage());
    }
  }
  
  /* Returns a short id, eg. 3333 => lt */
  public static function get_short_id($number) {
    return base_convert($number, 10, 36);
  }
  /* Returns a short id, eg. lt => 3333 */
  public static function get_id($short_id) {
    return base_convert($short_id, 36, 10);
  }
}