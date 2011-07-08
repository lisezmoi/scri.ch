<?php if (!defined('SCRICH_VERSION')) { header('HTTP/1.0 403 Forbidden'); exit; } ?>
<?php
	function tpl_pagination() {
		global $page, $nb_pages;
		echo '<p class="pagination">';
		if ($page > 1) {
			echo '<a href="'. SCRICH_URL . 'gallery/?p='. ($page-1) .'" class="prev">Previous</a>';
		}
		if ($page < $nb_pages) {
			echo '<a href="' . SCRICH_URL.'gallery/?p='. ($page+1) .'" class="next">Next</a>';
		}
		echo '</p>';
	}
?>
<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<title>scri.ch - Gallery</title>
		<link rel="stylesheet" href="<?php echo SCRICH_URL ?>assets/admin.css?<?php echo SCRICH_VERSION ?>">
		<link rel="icon" type="image/png" href="<?php echo SCRICH_URL ?>assets/favicon.png">
		<link rel="apple-touch-icon" href="<?php echo SCRICH_URL ?>assets/apple-touch-icon.png">
	</head>
	<body>
		<h1>Drawings - <?php echo $page ?>/<?php echo $nb_pages ?> - (total <?php echo $draws_count ?>)</h1>
		<?php tpl_pagination(); ?>
		<ul id="draw-list">
			<?php foreach ($draws as $draw): ?>
			<li>
				<h2>/<?php echo $draw->short_id ?> <span>(<?php echo date("G:i j/m/Y", strtotime($draw->date)) ?>)</span></h2>
				<a href="<?php echo SCRICH_URL.$draw->short_id ?>">
					<img src="<?php echo SCRICH_URL.$draw->short_id ?>.png">
				</a>
			</li>
			<?php endforeach ?>
		</ul>
		<?php tpl_pagination(); ?>
	</body>
</html>